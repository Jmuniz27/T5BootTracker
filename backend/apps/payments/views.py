"""Views for payments app."""
import logging
from django.utils.timezone import now
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter, inline_serializer
from rest_framework import status, serializers as drf_serializers
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.leads.permissions import IsSalesperson, IsSalespersonOrAdmin
from .models import Payment
from .serializers import (
    PaymentUploadSerializer, PaymentListSerializer, PaymentDetailSerializer,
    PaymentApproveSerializer, PaymentRejectSerializer,
    PaymentOCRStatusSerializer, PaymentConfirmSerializer,
)
from .services import PaymentProgressService

logger = logging.getLogger(__name__)


class IsBootcamper(IsSalesperson):
    """Only bootcamper users."""
    def has_permission(self, request, view):
        from apps.authentication.models import CustomUser
        return (
            request.user.is_authenticated
            and request.user.role == CustomUser.Role.BOOTCAMPER
        )


# ──────────────────────────────────────────────────────────────────────────────
# Bootcamper views
# ──────────────────────────────────────────────────────────────────────────────

class PaymentUploadView(APIView):
    """POST /api/payments/upload/ — bootcamper uploads a receipt."""
    permission_classes = [IsBootcamper]

    @extend_schema(
        request={'multipart/form-data': PaymentUploadSerializer},
        responses={201: PaymentListSerializer, 400: OpenApiResponse(description='Archivo inválido o muy grande'), 404: OpenApiResponse(description='Programa no encontrado')},
        summary='Subir comprobante de pago',
        description='El bootcamper sube un comprobante (JPG, PNG o PDF, máx 10 MB). Se lanza OCR asíncrono.',
        tags=['Pagos — Bootcamper'],
    )
    def post(self, request):
        from apps.programs.models import Program
        from .tasks import process_payment_ocr
        from .serializers import ALLOWED_MIME_TYPES

        serializer = PaymentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            program = Program.objects.get(pk=data['program_id'])
        except Program.DoesNotExist:
            return Response(
                {'error': 'Programa no encontrado.', 'code': 'PROGRAM_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        file      = data['receipt_file']
        file_type = ALLOWED_MIME_TYPES.get(file.content_type, 'image')

        payment = Payment.objects.create(
            bootcamper=request.user,
            program=program,
            receipt_file=file,
            receipt_file_type=file_type,
            status=Payment.Status.DRAFT,
        )

        process_payment_ocr.delay(str(payment.id))

        return Response(PaymentListSerializer(payment).data, status=status.HTTP_201_CREATED)


class PaymentMyStatusView(APIView):
    """GET /api/payments/my-status/?program_id=... — bootcamper payment summary."""
    permission_classes = [IsBootcamper]

    @extend_schema(
        parameters=[OpenApiParameter('program_id', str, required=True, description='UUID del programa')],
        responses={200: inline_serializer('PaymentSummary', fields={
            'total_cost':              drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'total_paid':              drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'pending_payments':        drf_serializers.IntegerField(),
            'deficit':                 drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'deficit_amount':          drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'pending_balance':         drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'is_critical':             drf_serializers.BooleanField(),
            'time_elapsed_percentage': drf_serializers.FloatField(),
            'payment_count':           drf_serializers.IntegerField(),
            'payment_percentage':      drf_serializers.FloatField(),
            'payment_status':          drf_serializers.CharField(),
            'expected_payment_by_now': drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'surplus_amount':          drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'program_start':           drf_serializers.CharField(),
            'program_end':             drf_serializers.CharField(),
        })},
        summary='Mi resumen de pagos',
        tags=['Pagos — Bootcamper'],
    )
    def get(self, request):
        program_id = request.query_params.get('program_id')
        if not program_id:
            return Response(
                {'error': 'program_id es requerido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            summary = PaymentProgressService().get_payment_summary(
                str(request.user.id), program_id
            )
        except Exception:
            return Response(
                {'error': 'Programa no encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(summary)


class PaymentMyHistoryView(APIView):
    """GET /api/payments/my-history/ — bootcamper's own payment history."""
    permission_classes = [IsBootcamper]

    @extend_schema(
        responses={200: PaymentListSerializer(many=True)},
        summary='Mi historial de pagos',
        tags=['Pagos — Bootcamper'],
    )
    def get(self, request):
        payments = Payment.objects.filter(bootcamper=request.user).select_related('program')
        return Response(PaymentListSerializer(payments, many=True).data)


class PaymentOCRStatusView(APIView):
    """GET /api/payments/my-payments/{id}/ocr-status/ — bootcamper polls OCR results."""
    permission_classes = [IsBootcamper]

    @extend_schema(
        responses={200: PaymentOCRStatusSerializer},
        summary='Estado OCR de mi pago',
        description='El bootcamper consulta los campos extraídos por OCR de su comprobante.',
        tags=['Pagos — Bootcamper'],
    )
    def get(self, request, pk):
        payment = get_object_or_404(Payment, pk=pk, bootcamper=request.user)
        return Response(PaymentOCRStatusSerializer(payment).data)


class PaymentConfirmView(APIView):
    """PATCH /api/payments/my-payments/{id}/confirm/ — bootcamper corrects OCR and confirms.

    Transitions the payment from DRAFT → PENDING, making it visible in the vendor queue.
    The bootcamper may send any subset of editable OCR fields to overwrite only what needs
    fixing; omitted fields keep the value originally extracted by OCR.
    ocr_raw_text and ocr_confidence are never modified here.
    """
    permission_classes = [IsBootcamper]

    @extend_schema(
        request=PaymentConfirmSerializer,
        responses={
            200: PaymentOCRStatusSerializer,
            400: OpenApiResponse(description='El pago ya fue confirmado o no está en borrador'),
            404: OpenApiResponse(description='Pago no encontrado'),
        },
        summary='Confirmar pago (DRAFT → PENDING)',
        description=(
            'El bootcamper revisa los datos extraídos por OCR, corrige los que sean incorrectos '
            'y confirma el envío. El pago pasa de En revisión (DRAFT) a Pendiente (PENDING) '
            'y entra en la cola del vendedor. Solo se puede confirmar una vez.'
        ),
        tags=['Pagos — Bootcamper'],
    )
    def patch(self, request, pk):
        payment = get_object_or_404(Payment, pk=pk, bootcamper=request.user)

        if payment.status != Payment.Status.DRAFT:
            return Response(
                {'error': 'Solo se pueden confirmar pagos en borrador.', 'code': 'NOT_DRAFT'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaymentConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Overwrite only the fields the bootcamper explicitly sent
        editable = (
            'ocr_bank_name', 'ocr_account_last_digits',
            'ocr_amount', 'ocr_transaction_id', 'ocr_payment_date',
            'payer_name', 'payer_identification', 'payer_email',
            'payer_address', 'payer_phone', 'document_number',
        )
        for field in editable:
            if field in data:
                setattr(payment, field, data[field])

        payment.status = Payment.Status.PENDING
        payment.save()

        logger.info("Payment %s confirmed by bootcamper %s.", payment.id, request.user.id)
        return Response(PaymentOCRStatusSerializer(payment).data)


# ──────────────────────────────────────────────────────────────────────────────
# Salesperson / Admin views
# ──────────────────────────────────────────────────────────────────────────────

class PaymentQueueView(APIView):
    """GET /api/payments/queue/ — pending payments for review."""
    permission_classes = [IsSalespersonOrAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter('program_id', str, required=False, description='Filtrar por UUID del programa'),
            OpenApiParameter('search', str, required=False, description='Buscar por nombre o email del bootcamper'),
        ],
        responses={200: PaymentListSerializer(many=True)},
        summary='Cola de pagos pendientes',
        description='Lista pagos en estado PENDING para revisión del vendedor o administrador.',
        tags=['Pagos — Vendedor/Admin'],
    )
    def get(self, request):
        qs = Payment.objects.filter(status=Payment.Status.PENDING).select_related(
            'bootcamper', 'program'
        )
        program_id = request.query_params.get('program_id')
        search     = request.query_params.get('search')
        if program_id:
            qs = qs.filter(program_id=program_id)
        if search:
            qs = qs.filter(bootcamper__first_name__icontains=search) | \
                 qs.filter(bootcamper__last_name__icontains=search) | \
                 qs.filter(bootcamper__email__icontains=search)
        return Response(PaymentListSerializer(qs, many=True).data)


class PaymentMonitoringView(APIView):
    """GET /api/payments/monitoring/ — payment summary for all bootcampers in a program."""
    permission_classes = [IsSalespersonOrAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter('program_id', str, required=False, description='UUID del programa (omitir para todos los programas activos)'),
            OpenApiParameter('status', str, required=False, description='Filtrar por estado: CRITICAL'),
        ],
        responses={200: inline_serializer('BootcamperPaymentSummary', fields={
            'bootcamper_id':           drf_serializers.UUIDField(),
            'bootcamper_name':         drf_serializers.CharField(),
            'email':                   drf_serializers.EmailField(),
            'program_id':              drf_serializers.UUIDField(),
            'program_name':            drf_serializers.CharField(),
            'total_cost':              drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'total_paid':              drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'pending_payments':        drf_serializers.IntegerField(),
            'deficit':                 drf_serializers.DecimalField(max_digits=12, decimal_places=2),
            'is_critical':             drf_serializers.BooleanField(),
            'payment_status':          drf_serializers.CharField(),
            'time_elapsed_percentage': drf_serializers.FloatField(),
            'payment_count':           drf_serializers.IntegerField(),
        }, many=True)},
        summary='Monitoreo de pagos por programa',
        description='Resumen de pagos de todos los bootcampers activos. Sin program_id retorna todos los programas activos.',
        tags=['Pagos — Vendedor/Admin'],
    )
    def get(self, request):
        from apps.authentication.models import CustomUser
        from apps.programs.models import Program

        program_id    = request.query_params.get('program_id')
        status_filter = request.query_params.get('status')

        if program_id:
            try:
                programs = [Program.objects.get(pk=program_id)]
            except Program.DoesNotExist:
                return Response({'error': 'Programa no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            programs = list(Program.objects.filter(is_active=True))

        svc  = PaymentProgressService()
        data = []
        for program in programs:
            bootcampers = CustomUser.objects.filter(
                role=CustomUser.Role.BOOTCAMPER,
                payments__program=program,
            ).distinct()
            for bc in bootcampers:
                summary = svc.get_payment_summary(str(bc.id), str(program.id))
                if status_filter and summary.get('payment_status') != status_filter:
                    continue
                data.append({
                    'bootcamper_id':   str(bc.id),
                    'bootcamper_name': bc.get_full_name(),
                    'email':           bc.email,
                    'program_id':      str(program.id),
                    'program_name':    program.name,
                    **summary,
                })
        return Response(data)


class PaymentDetailView(APIView):
    """GET /api/payments/{id}/ — full payment details including ocr_raw_text."""
    permission_classes = [IsSalespersonOrAdmin]

    @extend_schema(
        responses={200: PaymentDetailSerializer, 404: OpenApiResponse(description='Pago no encontrado')},
        summary='Detalle de pago',
        description='Retorna todos los campos del pago incluyendo ocr_raw_text (texto crudo del OCR para copiar/pegar).',
        tags=['Pagos — Vendedor/Admin'],
    )
    def get(self, request, pk):
        payment = get_object_or_404(Payment.objects.select_related('bootcamper', 'program', 'validated_by'), pk=pk)
        return Response(PaymentDetailSerializer(payment).data)


class PaymentApproveView(APIView):
    """PATCH /api/payments/{id}/approve/"""
    permission_classes = [IsSalespersonOrAdmin]

    @extend_schema(
        request=PaymentApproveSerializer,
        responses={
            200: PaymentListSerializer,
            400: OpenApiResponse(description='El pago no está pendiente'),
            404: OpenApiResponse(description='Pago no encontrado'),
        },
        summary='Aprobar pago',
        description='Aprueba un pago pendiente con el monto confirmado. Notifica al bootcamper.',
        tags=['Pagos — Vendedor/Admin'],
    )
    def patch(self, request, pk):
        from .tasks import send_payment_status_notification
        payment = get_object_or_404(Payment, pk=pk)

        if payment.status != Payment.Status.PENDING:
            return Response(
                {'error': 'Solo se pueden aprobar pagos pendientes.', 'code': 'NOT_PENDING'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaymentApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        payment.status                   = Payment.Status.APPROVED
        payment.confirmed_amount         = data['confirmed_amount']
        payment.confirmed_bank_name      = data.get('confirmed_bank_name', '')
        payment.confirmed_transaction_id = data.get('confirmed_transaction_id', '')
        payment.validated_by             = request.user
        payment.validated_at             = now()
        payment.save()

        send_payment_status_notification.delay(str(payment.id), Payment.Status.APPROVED)

        return Response(PaymentListSerializer(payment).data)


class PaymentRejectView(APIView):
    """PATCH /api/payments/{id}/reject/"""
    permission_classes = [IsSalespersonOrAdmin]

    @extend_schema(
        request=PaymentRejectSerializer,
        responses={
            200: PaymentListSerializer,
            400: OpenApiResponse(description='El pago no está pendiente'),
            404: OpenApiResponse(description='Pago no encontrado'),
        },
        summary='Rechazar pago',
        description='Rechaza un pago pendiente con un motivo. Notifica al bootcamper.',
        tags=['Pagos — Vendedor/Admin'],
    )
    def patch(self, request, pk):
        from .tasks import send_payment_status_notification
        payment = get_object_or_404(Payment, pk=pk)

        if payment.status != Payment.Status.PENDING:
            return Response(
                {'error': 'Solo se pueden rechazar pagos pendientes.', 'code': 'NOT_PENDING'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaymentRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payment.status           = Payment.Status.REJECTED
        payment.rejection_reason = serializer.validated_data['rejection_reason']
        payment.validated_by     = request.user
        payment.validated_at     = now()
        payment.save()

        send_payment_status_notification.delay(str(payment.id), Payment.Status.REJECTED)

        return Response(PaymentListSerializer(payment).data)


class NotifyCoordinatorView(APIView):
    """POST /api/payments/notify-coordinator/{bootcamper_id}/?program_id=..."""
    permission_classes = [IsSalesperson]

    @extend_schema(
        parameters=[OpenApiParameter('program_id', str, required=True, description='UUID del programa')],
        responses={
            200: OpenApiResponse(description='Alerta enviada'),
            400: OpenApiResponse(description='program_id requerido'),
            404: OpenApiResponse(description='Bootcamper no encontrado'),
        },
        summary='Alertar coordinador por pago atrasado',
        description='Dispara una notificación manual al coordinador del programa sobre pagos críticos.',
        tags=['Pagos — Vendedor/Admin'],
    )
    def post(self, request, bootcamper_id):
        from apps.notifications.tasks import send_late_payment_alert
        from apps.authentication.models import CustomUser

        program_id = request.data.get('program_id') or request.query_params.get('program_id')
        if not program_id:
            return Response({'error': 'program_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            CustomUser.objects.get(pk=bootcamper_id, role=CustomUser.Role.BOOTCAMPER)
        except CustomUser.DoesNotExist:
            return Response({'error': 'Bootcamper no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        send_late_payment_alert.delay(str(bootcamper_id), str(program_id))
        return Response({'detail': 'Alerta enviada.'}, status=status.HTTP_200_OK)
