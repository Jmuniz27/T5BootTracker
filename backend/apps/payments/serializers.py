"""Serializers for payments app."""

from django.urls import reverse
from rest_framework import serializers
from apps.authentication.validators import validate_cedula_ecuatoriana
from .models import Payment
from .services import make_receipt_token

MAX_FILE_SIZE_MB = 10
ALLOWED_MIME_TYPES = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/jpg": "image",
    "application/pdf": "pdf",
}


class PaymentUploadSerializer(serializers.Serializer):
    """Validates an uploaded receipt file."""

    receipt_file = serializers.FileField()
    program_id = serializers.UUIDField()

    def validate_receipt_file(self, file):
        mime_type = file.content_type
        if mime_type not in ALLOWED_MIME_TYPES:
            raise serializers.ValidationError(
                "Tipo de archivo no permitido. Use JPG, PNG o PDF."
            )
        if file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise serializers.ValidationError(
                f"El archivo no puede superar {MAX_FILE_SIZE_MB} MB."
            )
        return file


class PaymentListSerializer(serializers.ModelSerializer):
    bootcamper_name = serializers.SerializerMethodField()
    program_name = serializers.SerializerMethodField()
    validated_by_name = serializers.SerializerMethodField()
    receipt_file = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "bootcamper",
            "bootcamper_name",
            "program",
            "program_name",
            "receipt_file",
            "receipt_file_type",
            "ocr_bank_name",
            "ocr_account_last_digits",
            "ocr_amount",
            "ocr_transaction_id",
            "ocr_payment_date",
            "ocr_confidence",
            "payer_name",
            "payer_identification",
            "payer_email",
            "payer_address",
            "payer_phone",
            "document_number",
            "confirmed_amount",
            "confirmed_bank_name",
            "confirmed_transaction_id",
            "status",
            "rejection_reason",
            "validated_by",
            "validated_by_name",
            "validated_at",
            "submitted_at",
            "updated_at",
        )

    def get_receipt_file(self, obj):
        if not obj.receipt_file:
            return None
        url = reverse('payment-receipt-file')
        return f"{url}?st={make_receipt_token(obj.pk)}"

    def get_bootcamper_name(self, obj):
        return obj.bootcamper.get_full_name()

    def get_program_name(self, obj):
        return obj.program.name

    def get_validated_by_name(self, obj):
        if obj.validated_by:
            return obj.validated_by.get_full_name()
        return None


class PaymentApproveSerializer(serializers.Serializer):
    """Validate data required to approve a payment."""

    confirmed_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    confirmed_bank_name = serializers.CharField(
        max_length=200, required=False, allow_blank=True
    )
    confirmed_transaction_id = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )


class PaymentRejectSerializer(serializers.Serializer):
    """Validate data required to reject a payment."""

    rejection_reason = serializers.CharField(min_length=1)

    def validate_rejection_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError(
                "El motivo de rechazo no puede estar vacío."
            )
        return value


class PaymentOCRStatusSerializer(serializers.ModelSerializer):
    """OCR fields only — for bootcamper polling."""

    class Meta:
        model = Payment
        fields = (
            "id",
            "ocr_bank_name",
            "ocr_account_last_digits",
            "ocr_amount",
            "ocr_transaction_id",
            "ocr_payment_date",
            "ocr_confidence",
            "payer_name",
            "payer_identification",
            "payer_email",
            "payer_address",
            "payer_phone",
            "document_number",
            "status",
        )


class PaymentConfirmSerializer(serializers.Serializer):
    """Fields the bootcamper can correct before confirming (all optional).

    The bootcamper overwrites only the fields they need to fix; the rest stay
    as extracted by OCR.  ocr_raw_text and ocr_confidence are never changed
    here — they serve as the original OCR reference.
    """

    ocr_bank_name           = serializers.CharField(max_length=200, required=False, allow_blank=True)
    ocr_account_last_digits = serializers.CharField(max_length=10,  required=False, allow_blank=True)
    ocr_amount              = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    ocr_transaction_id      = serializers.CharField(max_length=100, required=False, allow_blank=True)
    ocr_payment_date        = serializers.DateField(required=False, allow_null=True)
    payer_name              = serializers.CharField(max_length=200, required=False, allow_blank=True)
    payer_identification    = serializers.CharField(max_length=20,  required=False, allow_blank=True)
    payer_email             = serializers.EmailField(required=False, allow_blank=True)
    payer_address           = serializers.CharField(max_length=255, required=False, allow_blank=True)
    payer_phone              = serializers.CharField(max_length=20,  required=False, allow_blank=True)
    document_number         = serializers.CharField(max_length=50,  required=False, allow_blank=True)

    def validate_payer_identification(self, value):
        """Accept blank (best-effort field). If provided, must be a valid
        Ecuadorian cédula (10 digits) or RUC (13 digits, ends in 001)."""
        if not value:
            return value
        if not value.isdigit():
            raise serializers.ValidationError(
                "La identificación debe contener solo dígitos."
            )
        if len(value) == 10:
            if not validate_cedula_ecuatoriana(value):
                raise serializers.ValidationError("Cédula ecuatoriana inválida.")
        elif len(value) == 13:
            if not (validate_cedula_ecuatoriana(value[:10]) and value.endswith("001")):
                raise serializers.ValidationError("RUC ecuatoriano inválido.")
        else:
            raise serializers.ValidationError(
                "La identificación debe tener 10 dígitos (cédula) o 13 (RUC)."
            )
        return value


class PaymentDetailSerializer(PaymentListSerializer):
    """Full payment detail for vendor/admin — adds ocr_raw_text for copy-paste."""

    class Meta(PaymentListSerializer.Meta):
        fields = PaymentListSerializer.Meta.fields + ("ocr_raw_text",)
