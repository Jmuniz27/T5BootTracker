"""Serializers for payments app."""

from rest_framework import serializers
from .models import Payment

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
            "status",
        )
