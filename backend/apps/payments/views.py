"""Views for payments app."""
import logging
from django.utils.timezone import now
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.leads.permissions import IsSalesperson, IsSalespersonOrAdmin
from .models import Payment
from .serializers import (
    PaymentUploadSerializer, PaymentListSerializer,
    PaymentApproveSerializer, PaymentRejectSerializer,
    PaymentOCRStatusSerializer,
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
        )

        process_payment_ocr.delay(str(payment.id))

        return Response(PaymentListSerializer(payment).data, status=status.HTTP_201_CREATED)


class PaymentMyStatusView(APIView):
    """GET /api/payments/my-status/?program_id=... — bootcamper payment summary."""
    permission_classes = [IsBootcamper]

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

    def get(self, request):
        payments = Payment.objects.filter(bootcamper=request.user).select_related('program')
        return Response(PaymentListSerializer(payments, many=True).data)


class PaymentOCRStatusView(APIView):
    """GET /api/payments/my-payments/{id}/ocr-status/ — bootcamper polls OCR results."""
    permission_classes = [IsBootcamper]

    def get(self, request, pk):
        payment = get_object_or_404(Payment, pk=pk, bootcamper=request.user)
        return Response(PaymentOCRStatusSerializer(payment).data)


# ──────────────────────────────────────────────────────────────────────────────
# Salesperson / Admin views
# ──────────────────────────────────────────────────────────────────────────────

class PaymentQueueView(APIView):
    """GET /api/payments/queue/ — pending payments for review."""
    permission_classes = [IsSalespersonOrAdmin]

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

    def get(self, request):
        program_id = request.query_params.get('program_id')
        if not program_id:
            return Response({'error': 'program_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.authentication.models import CustomUser
        from apps.programs.models import Program

        try:
            program = Program.objects.get(pk=program_id)
        except Program.DoesNotExist:
            return Response({'error': 'Programa no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        bootcampers = CustomUser.objects.filter(
            role=CustomUser.Role.BOOTCAMPER,
            payments__program=program,
        ).distinct()

        svc  = PaymentProgressService()
        data = []
        for bc in bootcampers:
            summary = svc.get_payment_summary(str(bc.id), str(program.id))
            data.append({
                'bootcamper_id':   str(bc.id),
                'bootcamper_name': bc.get_full_name(),
                'email':           bc.email,
                **summary,
            })
        return Response(data)


class PaymentDetailView(APIView):
    """GET /api/payments/{id}/ — full payment details."""
    permission_classes = [IsSalespersonOrAdmin]

    def get(self, request, pk):
        payment = get_object_or_404(Payment.objects.select_related('bootcamper', 'program', 'validated_by'), pk=pk)
        return Response(PaymentListSerializer(payment).data)


class PaymentApproveView(APIView):
    """PATCH /api/payments/{id}/approve/"""
    permission_classes = [IsSalespersonOrAdmin]

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
