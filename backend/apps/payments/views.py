"""Views for payments app."""
import logging
import mimetypes
from django.core import signing
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.http import FileResponse, Http404
from django.utils.timezone import now
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter, inline_serializer
from rest_framework import status, serializers as drf_serializers
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.permissions import IsAdmin, IsFinanceOrAdmin
from .models import BootcamperAssignmentSetting, Payment
from .serializers import (
    PaymentUploadSerializer, PaymentListSerializer, PaymentDetailSerializer,
    PaymentApproveSerializer, PaymentRejectSerializer,
    PaymentOCRStatusSerializer, PaymentConfirmSerializer,
    BootcamperAssignmentSettingSerializer,
)
from .services import (
    PaymentProgressService, read_receipt_token,
    get_bootcamper_self_assignment_enabled, set_bootcamper_self_assignment_enabled,
)

logger = logging.getLogger(__name__)

# Mismos topes que el pool de leads, para que ambos pools pagineen igual.
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE     = 100


class IsBootcamper(BasePermission):
    """Only bootcamper users."""
    def has_permission(self, request, view):
        from apps.authentication.models import CustomUser
        return (
            request.user.is_authenticated
            and request.user.role == CustomUser.Role.BOOTCAMPER
        )


class ReceiptFileView(APIView):
    """GET /api/payments/receipt/?st=<token> — sirve el archivo del comprobante.

    AllowAny deliberado: el navegador pide este recurso desde <img>/<object>
    sin cabecera Authorization. El control de acceso es el token firmado y
    con expiración que emite PaymentListSerializer únicamente dentro de
    respuestas ya autorizadas por rol.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[OpenApiParameter('st', str, description='Token firmado emitido por la API')],
        responses={200: OpenApiResponse(description='Archivo del comprobante'), 403: OpenApiResponse(description='Token inválido o expirado')},
        summary='Descargar comprobante (URL firmada)',
        tags=['Pagos — Bootcamper'],
    )
    def get(self, request):
        token = request.query_params.get('st', '')
        try:
            payment_id = read_receipt_token(token)
        except signing.BadSignature:
            return Response(
                {'error': 'Enlace inválido o expirado.', 'code': 'RECEIPT_TOKEN_INVALID'},
                status=status.HTTP_403_FORBIDDEN,
            )

        payment = get_object_or_404(Payment, pk=payment_id)
        if not payment.receipt_file:
            raise Http404
        try:
            file_handle = payment.receipt_file.open('rb')
        except FileNotFoundError:
            logger.error('Receipt file missing on disk for payment %s', payment_id)
            raise Http404
        content_type = mimetypes.guess_type(payment.receipt_file.name)[0] or 'application/octet-stream'
        return FileResponse(file_handle, content_type=content_type)


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

class PaymentHistoryView(APIView):
    """GET /api/payments/history/ — todas las solicitudes de un bootcamper.

    La cola (`/queue/`) fija `status=PENDING`, así que no había forma de ver lo
    aprobado ni lo rechazado: una vez revisada, la solicitud desaparecía de la
    pantalla y con ella el motivo del rechazo y quién la validó.
    """
    permission_classes = [IsFinanceOrAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter('bootcamper_id', str, required=True, description='UUID del bootcamper'),
            OpenApiParameter('program_id', str, required=False, description='Filtrar por UUID del programa'),
            OpenApiParameter(
                'status', str, required=False,
                description='Filtrar por estado: DRAFT, PENDING, APPROVED, REJECTED.',
            ),
        ],
        responses={
            200: PaymentListSerializer(many=True),
            400: OpenApiResponse(description='Falta bootcamper_id'),
        },
        summary='Historial de solicitudes de pago (Finanzas/Admin)',
        description=(
            'Todas las solicitudes del bootcamper, de la más reciente a la más antigua, '
            'con su estado, el motivo del rechazo cuando aplica, y quién validó y cuándo. '
            'A diferencia de /queue/, incluye las ya revisadas. Sólo lectura: aprobar y '
            'rechazar siguen en sus propios endpoints.'
        ),
        tags=['Pagos — Finanzas/Admin'],
    )
    def get(self, request):
        bootcamper_id = request.query_params.get('bootcamper_id')
        if not bootcamper_id:
            return Response(
                {'error': 'bootcamper_id es requerido.', 'code': 'BOOTCAMPER_ID_REQUIRED'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = (
            Payment.objects
            .filter(bootcamper_id=bootcamper_id)
            .select_related('bootcamper', 'program', 'validated_by')
        )

        program_id = request.query_params.get('program_id')
        if program_id:
            qs = qs.filter(program_id=program_id)

        estado = request.query_params.get('status')
        if estado:
            # Un estado desconocido devuelve vacío en vez de 400: el filtro es
            # una comodidad de lectura, no una operación que deba fallar.
            qs = qs.filter(status=estado)

        # El orden del modelo ya es -submitted_at, pero se deja explícito: el
        # historial se lee de lo más nuevo a lo más viejo y no debe depender de
        # que nadie cambie el Meta.ordering.
        return Response(PaymentListSerializer(qs.order_by('-submitted_at'), many=True).data)


class PaymentQueueView(APIView):
    """GET /api/payments/queue/ — pending payments for review."""
    permission_classes = [IsFinanceOrAdmin]

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
    permission_classes = [IsFinanceOrAdmin]

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

        data = PaymentProgressService().get_monitoring_summaries(programs, status_filter)

        # Finanzas sólo monitorea su propia cartera; el administrador ve todo.
        if not request.user.is_administrator:
            from apps.authentication.models import CustomUser

            mine = {
                str(pk) for pk in CustomUser.objects
                .filter(role=CustomUser.Role.BOOTCAMPER, finance_owner=request.user)
                .values_list('id', flat=True)
            }
            data = [row for row in data if row['bootcamper_id'] in mine]

        return Response(data)


class PaymentDetailView(APIView):
    """GET /api/payments/{id}/ — full payment details including ocr_raw_text."""
    permission_classes = [IsFinanceOrAdmin]

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
    permission_classes = [IsFinanceOrAdmin]

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
    permission_classes = [IsFinanceOrAdmin]

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
    permission_classes = [IsFinanceOrAdmin]

    @extend_schema(
        parameters=[OpenApiParameter('program_id', str, required=True, description='UUID del programa')],
        responses={
            200: OpenApiResponse(description='Alerta enviada'),
            400: OpenApiResponse(description='program_id requerido, o el pago no está en estado crítico'),
            404: OpenApiResponse(description='Bootcamper o programa no encontrado'),
        },
        summary='Alertar coordinador por pago atrasado',
        description='Dispara una notificación manual al coordinador del programa sobre pagos críticos.',
        tags=['Pagos — Vendedor/Admin'],
    )
    def post(self, request, bootcamper_id):
        from apps.notifications.tasks import send_late_payment_alert
        from apps.authentication.models import CustomUser
        from apps.programs.models import Program

        program_id = request.data.get('program_id') or request.query_params.get('program_id')
        if not program_id:
            return Response({'error': 'program_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            CustomUser.objects.get(pk=bootcamper_id, role=CustomUser.Role.BOOTCAMPER)
        except CustomUser.DoesNotExist:
            return Response({'error': 'Bootcamper no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        # El gate del 10% debe validarse en el servidor: el frontend sólo lo usaba
        # para mostrar u ocultar el botón, así que una llamada directa a la API
        # podía notificar al coordinador sobre un pago que no era crítico.
        try:
            summary = PaymentProgressService().get_payment_summary(str(bootcamper_id), str(program_id))
        except Program.DoesNotExist:
            return Response({'error': 'Programa no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not summary['is_critical']:
            return Response(
                {
                    'error': 'El pago de este bootcamper no está en estado crítico.',
                    'code': 'NOT_CRITICAL',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        send_late_payment_alert.delay(str(bootcamper_id), str(program_id))
        return Response({'detail': 'Alerta enviada.'}, status=status.HTTP_200_OK)


# ─── Pool de bootcampers ──────────────────────────────────────────────────────
#
# Misma mecánica que el pool de leads: al convertirse, un bootcamper queda sin
# responsable de cobro (`finance_owner` vacío) y cualquiera de Finanzas puede
# tomarlo. No hace falta ningún paso extra en la conversión — estar en el pool
# es, literalmente, no tener dueño.

BOOTCAMPER_CARD_FIELDS = {
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
}


class BootcamperPoolView(APIView):
    """GET /api/payments/bootcampers/ — cartera propia + pool sin asignar."""
    permission_classes = [IsFinanceOrAdmin]

    def _page_params(self, request):
        """Lee y acota ``page`` / ``page_size``, igual que el pool de leads."""
        try:
            page_size = int(request.query_params.get('page_size', DEFAULT_PAGE_SIZE))
        except (TypeError, ValueError):
            page_size = DEFAULT_PAGE_SIZE
        if page_size <= 0:
            page_size = DEFAULT_PAGE_SIZE
        page_size = min(page_size, MAX_PAGE_SIZE)

        try:
            page_number = int(request.query_params.get('page', 1))
        except (TypeError, ValueError):
            page_number = 1
        return max(1, page_number), page_size

    @extend_schema(
        parameters=[
            OpenApiParameter('search', str, required=False, description='Buscar por nombre o email'),
            OpenApiParameter('program_id', str, required=False, description='Filtrar por UUID del programa'),
            OpenApiParameter('cohort_id', str, required=False, description='Filtrar por UUID de la cohorte'),
            OpenApiParameter('status', str, required=False, description='CRITICAL | AT_RISK | ON_TRACK'),
            OpenApiParameter('page', int, required=False, description='Número de página (default 1)'),
            OpenApiParameter('page_size', int, required=False, description=f'Default {DEFAULT_PAGE_SIZE}, máx {MAX_PAGE_SIZE}'),
        ],
        responses={200: inline_serializer('BootcamperPoolResponse', fields={
            'my_bootcampers':        inline_serializer('MyBootcamperCard', fields=BOOTCAMPER_CARD_FIELDS, many=True),
            'available_bootcampers': inline_serializer('PoolBootcamperCard', fields=BOOTCAMPER_CARD_FIELDS, many=True),
            'pagination':            inline_serializer('BootcamperPoolPagination', fields={
                'page':                             drf_serializers.IntegerField(),
                'page_size':                        drf_serializers.IntegerField(),
                'my_bootcampers_count':             drf_serializers.IntegerField(),
                'available_bootcampers_count':      drf_serializers.IntegerField(),
                'my_bootcampers_total_pages':       drf_serializers.IntegerField(),
                'available_bootcampers_total_pages': drf_serializers.IntegerField(),
            }),
        })},
        summary='Pool de bootcampers',
        description=(
            'Devuelve my_bootcampers (los que monitorea quien llama) y available_bootcampers '
            '(sin responsable de cobro), paginados de forma independiente. El administrador no '
            'tiene cartera propia: sólo ve el pool.'
        ),
        tags=['Pagos — Finanzas/Admin'],
    )
    def get(self, request):
        from django.core.paginator import Paginator
        from apps.authentication.models import CustomUser

        bootcampers = CustomUser.objects.filter(
            role=CustomUser.Role.BOOTCAMPER, is_active=True,
        )

        search = request.query_params.get('search')
        if search:
            bootcampers = bootcampers.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )

        service = PaymentProgressService()
        mine = (
            [] if request.user.is_administrator
            else service.get_bootcamper_summaries(bootcampers.filter(finance_owner=request.user))
        )
        available = service.get_bootcamper_summaries(bootcampers.filter(finance_owner__isnull=True))

        program_id    = request.query_params.get('program_id')
        cohort_id     = request.query_params.get('cohort_id')
        status_filter = request.query_params.get('status')

        def _filter(cards):
            if program_id:
                cards = [c for c in cards if c['program_id'] == program_id]
            if cohort_id:
                # El cobro se monitorea por edición: filtrar sólo por programa
                # mezcla cohortes que arrancaron en meses distintos.
                cards = [c for c in cards if c['cohort_id'] == cohort_id]
            if status_filter:
                cards = [c for c in cards if c['payment_status'] == status_filter]
            return cards

        mine      = _filter(mine)
        available = _filter(available)

        page_number, page_size = self._page_params(request)
        mine_paginator      = Paginator(mine, page_size)
        available_paginator = Paginator(available, page_size)

        return Response({
            'my_bootcampers':        list(mine_paginator.get_page(page_number).object_list),
            'available_bootcampers': list(available_paginator.get_page(page_number).object_list),
            'pagination': {
                'page':                              page_number,
                'page_size':                         page_size,
                'my_bootcampers_count':              mine_paginator.count,
                'available_bootcampers_count':       available_paginator.count,
                'my_bootcampers_total_pages':        mine_paginator.num_pages,
                'available_bootcampers_total_pages': available_paginator.num_pages,
            },
        })


class BootcamperAssignView(APIView):
    """PATCH /api/payments/bootcampers/{id}/assign/ — tomar del pool o repartirlo.

    Dos usos según quién llama, porque son dos gestos distintos:

      - **Finanzas** se lo asigna a sí misma y el cuerpo se ignora.
      - **Administrador** reparte: tiene que indicar `finance_owner_id`, porque
        no tiene cartera propia y asignárselo a sí mismo no querría decir nada.

    Antes era sólo `IsFinance`, así que el administrador veía el aviso de
    "N bootcampers sin responsable" y no podía hacer nada al respecto.
    """
    permission_classes = [IsFinanceOrAdmin]

    @extend_schema(
        request=inline_serializer('AssignBootcamperRequest', fields={
            'finance_owner_id': drf_serializers.UUIDField(required=False),
        }),
        responses={
            200: inline_serializer('AssignedBootcamper', fields=BOOTCAMPER_CARD_FIELDS, many=True),
            400: OpenApiResponse(description='Falta finance_owner_id, o no es de Finanzas'),
            404: OpenApiResponse(description='Bootcamper no encontrado'),
            409: OpenApiResponse(description='Ya tiene responsable de cobro'),
        },
        summary='Asignar un bootcamper del pool',
        description=(
            'Finanzas se lo asigna a sí misma. El Administrador debe mandar '
            'finance_owner_id, que tiene que ser una persona de Finanzas activa. '
            'Con bloqueo: si dos peticiones llegan a la vez, la segunda recibe 409.'
        ),
        tags=['Pagos — Finanzas/Admin'],
    )
    def patch(self, request, bootcamper_id):
        from django.db import transaction
        from apps.authentication.models import CustomUser

        from apps.authentication.models import CustomUser as _User

        # El control sólo limita a Finanzas. El administrador reparte siempre:
        # apagarlo justamente deja el reparto en sus manos.
        if (
            request.user.role != _User.Role.ADMINISTRATOR
            and not get_bootcamper_self_assignment_enabled()
        ):
            return Response(
                {
                    'error': 'La asignación de bootcampers la realiza el Administrador.',
                    'code': 'SELF_ASSIGNMENT_DISABLED',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        owner, error = self._resolve_owner(request)
        if error is not None:
            return error

        with transaction.atomic():
            try:
                bootcamper = CustomUser.objects.select_for_update().get(
                    pk=bootcamper_id, role=CustomUser.Role.BOOTCAMPER,
                )
            except CustomUser.DoesNotExist:
                return Response(
                    {'error': 'Bootcamper no encontrado.', 'code': 'BOOTCAMPER_NOT_FOUND'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if bootcamper.finance_owner_id is not None:
                return Response(
                    {
                        'error': 'Este bootcamper ya lo está monitoreando otra persona.',
                        'code': 'BOOTCAMPER_ALREADY_ASSIGNED',
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            bootcamper.finance_owner       = owner
            bootcamper.finance_assigned_at = now()
            bootcamper.save(update_fields=['finance_owner', 'finance_assigned_at', 'updated_at'])

        return Response(PaymentProgressService().get_bootcamper_summaries([bootcamper]))

    @staticmethod
    def _resolve_owner(request):
        """A quién se le asigna. Devuelve `(owner, None)` o `(None, respuesta)`."""
        from apps.authentication.models import CustomUser

        if request.user.role != CustomUser.Role.ADMINISTRATOR:
            return request.user, None

        owner_id = request.data.get('finance_owner_id')
        if not owner_id:
            return None, Response(
                {
                    'error': 'Indica a qué persona de Finanzas se le asigna.',
                    'code': 'FINANCE_OWNER_REQUIRED',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Se exige el rol y que esté activa: asignar la cartera a alguien que no
        # cobra —o a una cuenta dada de baja— deja al bootcamper sin seguimiento
        # real, que es justo lo que el pool intenta evitar.
        try:
            return CustomUser.objects.get(
                pk=owner_id, role=CustomUser.Role.FINANCE, is_active=True,
            ), None
        except (CustomUser.DoesNotExist, ValidationError, ValueError):
            return None, Response(
                {
                    'error': 'Esa persona no existe o no es de Finanzas.',
                    'code': 'INVALID_FINANCE_OWNER',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class BootcamperReleaseView(APIView):
    """PATCH /api/payments/bootcampers/{id}/release/ — devolver al pool.

    Finanzas sólo puede liberar lo propio. El Administrador puede liberar
    cualquiera: si reparte el pool y se equivoca de persona, sin esto quedaría
    sin forma de corregirlo.
    """
    permission_classes = [IsFinanceOrAdmin]

    @extend_schema(
        responses={
            200: inline_serializer('ReleasedBootcamper', fields=BOOTCAMPER_CARD_FIELDS, many=True),
            403: OpenApiResponse(description='No eres el responsable de cobro'),
            404: OpenApiResponse(description='Bootcamper no encontrado'),
        },
        summary='Liberar un bootcamper',
        description=(
            'Devuelve el bootcamper al pool. Finanzas sólo puede liberar los suyos; '
            'el Administrador puede liberar cualquiera para corregir un reparto.'
        ),
        tags=['Pagos — Finanzas/Admin'],
    )
    def patch(self, request, bootcamper_id):
        from apps.authentication.models import CustomUser

        bootcamper = get_object_or_404(
            CustomUser, pk=bootcamper_id, role=CustomUser.Role.BOOTCAMPER,
        )
        is_admin = request.user.role == CustomUser.Role.ADMINISTRATOR
        if not is_admin and bootcamper.finance_owner_id != request.user.id:
            return Response(
                {
                    'error': 'Solo quien monitorea a este bootcamper puede liberarlo.',
                    'code': 'NOT_OWNER',
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        bootcamper.finance_owner       = None
        bootcamper.finance_assigned_at = None
        bootcamper.save(update_fields=['finance_owner', 'finance_assigned_at', 'updated_at'])

        return Response(PaymentProgressService().get_bootcamper_summaries([bootcamper]))


class BootcamperAssignmentSettingView(APIView):
    """GET/PATCH /payments/settings/self-assignment/ — control global del pool.

    Espejo de `LeadAssignmentSettingView` (CR-004) para el pool de bootcampers.
    Lo lee cualquier rol autenticado —Finanzas necesita saber si su botón está
    habilitado— pero sólo el Administrador lo cambia.
    """
    permission_classes = [IsFinanceOrAdmin]

    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAdmin()]
        return super().get_permissions()

    @extend_schema(
        responses={200: BootcamperAssignmentSettingSerializer},
        summary='Consultar auto-asignación de cobro',
        tags=['Pagos — Finanzas/Admin'],
    )
    def get(self, request):
        setting = BootcamperAssignmentSetting.get_solo()
        return Response(BootcamperAssignmentSettingSerializer(setting).data)

    @extend_schema(
        request=BootcamperAssignmentSettingSerializer,
        responses={
            200: BootcamperAssignmentSettingSerializer,
            400: OpenApiResponse(description='Falta self_assign_enabled'),
            403: OpenApiResponse(description='Solo el Administrador puede cambiar este control'),
        },
        summary='Habilitar/deshabilitar auto-asignación de cobro',
        description=(
            'Apagado, Finanzas no puede tomar bootcampers del pool: sólo el Administrador '
            'reparte quién cobra a quién. No afecta a lo ya asignado.'
        ),
        tags=['Pagos — Finanzas/Admin'],
    )
    def patch(self, request):
        serializer = BootcamperAssignmentSettingSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if 'self_assign_enabled' not in serializer.validated_data:
            return Response(
                {'error': 'self_assign_enabled es requerido.', 'code': 'MISSING_FIELD'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        setting = set_bootcamper_self_assignment_enabled(
            serializer.validated_data['self_assign_enabled'], request.user,
        )
        return Response(BootcamperAssignmentSettingSerializer(setting).data)
