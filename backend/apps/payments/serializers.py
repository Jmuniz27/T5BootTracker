"""Serializers for payments app."""

from django.urls import reverse
from rest_framework import serializers
from apps.authentication.validators import validate_identificacion
from apps.notifications.services import ALERT_SOURCES
from .models import BootcamperAssignmentSetting, Payment
from .services import make_receipt_token

MAX_FILE_SIZE_MB = 10
ALLOWED_MIME_TYPES = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/jpg": "image",
    "application/pdf": "pdf",
}
# Al arrastrar un archivo, algunos SO/navegadores declaran "application/octet-stream"
# en vez del MIME real — sobre todo con PDFs. Ese tipo pasa el filtro del frontend
# (que valida por extensión) y el backend lo rechazaba, así que se acepta acá
# revalidando por extensión.
ALLOWED_EXTENSIONS = {
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".pdf": "pdf",
}


class PaymentUploadSerializer(serializers.Serializer):
    """Validates an uploaded receipt file."""

    receipt_file = serializers.FileField()
    # Opcional: el bootcamper no elige el programa al subir, se deduce de su
    # inscripción activa (ver `services.resolve_upload_program`). Se sigue
    # aceptando para los clientes que ya lo enviaban y para desempatar a quien
    # curse dos programas a la vez.
    program_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_receipt_file(self, file):
        import os

        mime_type = file.content_type
        if mime_type not in ALLOWED_MIME_TYPES:
            extension = os.path.splitext(file.name or "")[1].lower()
            if mime_type != "application/octet-stream" or extension not in ALLOWED_EXTENSIONS:
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


class NotifyCoordinatorSerializer(serializers.Serializer):
    """Validate the context of a manual alert to the coordinator.

    `source` dice desde qué pantalla se pidió el aviso, para que el correo diga
    de qué se trata. Se valida contra la lista en vez de ignorar lo desconocido:
    un valor mal escrito mandaría el correo genérico sin que nadie se entere.
    """

    source = serializers.ChoiceField(
        choices=ALERT_SOURCES, required=False, allow_null=True
    )
    payment_id = serializers.UUIDField(required=False, allow_null=True)


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

    def to_internal_value(self, data):
        # The frontend initializes the date input to '' when there's no OCR
        # value; DRF's DateField accepts null but not '', so normalize here.
        if data.get("ocr_payment_date") == "":
            data = {**data, "ocr_payment_date": None}
        return super().to_internal_value(data)

    def validate_payer_identification(self, value):
        """Accept blank (best-effort field). If provided, must be a valid
        Ecuadorian cédula (10 digits) or RUC (13 digits, ends in 001)."""
        if not value:
            return value
        if not value.isdigit():
            raise serializers.ValidationError(
                "La identificación debe contener solo dígitos."
            )
        if len(value) not in (10, 13):
            raise serializers.ValidationError(
                "La identificación debe tener 10 dígitos (cédula) o 13 (RUC)."
            )
        if not validate_identificacion(value):
            if len(value) == 10:
                raise serializers.ValidationError("Cédula ecuatoriana inválida.")
            raise serializers.ValidationError("RUC ecuatoriano inválido.")
        return value


class PaymentDetailSerializer(PaymentListSerializer):
    """Full payment detail for vendor/admin — adds ocr_raw_text for copy-paste."""

    class Meta(PaymentListSerializer.Meta):
        fields = PaymentListSerializer.Meta.fields + ("ocr_raw_text",)


class BootcamperAssignmentSettingSerializer(serializers.ModelSerializer):
    """Espejo de LeadAssignmentSettingSerializer, para el pool de bootcampers."""
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BootcamperAssignmentSetting
        fields = ('self_assign_enabled', 'updated_by_name', 'updated_at')
        read_only_fields = ('updated_by_name', 'updated_at')

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() if obj.updated_by else None
