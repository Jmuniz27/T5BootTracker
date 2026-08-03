"""Payment model for Boot-Tracker."""

import uuid
from django.conf import settings
from django.db import models


class Payment(models.Model):
    """A payment receipt submitted by a bootcamper for review."""

    class Status(models.TextChoices):
        DRAFT    = "DRAFT",    "En revisión"
        PENDING  = "PENDING",  "Pendiente"
        APPROVED = "APPROVED", "Aprobado"
        REJECTED = "REJECTED", "Rechazado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bootcamper = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payments",
        limit_choices_to={"role": "BOOTCAMPER"},
    )
    program = models.ForeignKey(
        "programs.Program",
        on_delete=models.CASCADE,
        related_name="payments",
    )
    receipt_file = models.FileField(upload_to="receipts/%Y/%m/")
    receipt_file_type = models.CharField(max_length=10)  # 'image' | 'pdf'
    ocr_bank_name = models.CharField(max_length=200, blank=True)
    ocr_account_last_digits = models.CharField(max_length=10, blank=True)
    ocr_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    ocr_transaction_id = models.CharField(max_length=100, blank=True)
    ocr_payment_date = models.DateField(null=True, blank=True)
    ocr_confidence = models.JSONField(default=dict, blank=True)
    ocr_raw_text = models.TextField(blank=True)
    # Billing fields (CR-009 / CB-123): structured invoicing data associated
    # with the payment. OCR-extracted where possible (payer_name, payer_email,
    # document_number, best-effort payer_identification); payer_address and
    # payer_phone never appear on receipts and are always manual entry.
    payer_name = models.CharField(max_length=200, blank=True)
    payer_identification = models.CharField(max_length=20, blank=True)  # cédula o RUC
    payer_email = models.EmailField(blank=True)
    payer_address = models.CharField(max_length=255, blank=True)
    payer_phone = models.CharField(max_length=20, blank=True)
    document_number = models.CharField(max_length=50, blank=True)  # Nº de comprobante
    confirmed_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    confirmed_bank_name = models.CharField(max_length=200, blank=True)
    confirmed_transaction_id = models.CharField(max_length=100, blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    rejection_reason = models.TextField(blank=True)
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="validated_payments",
    )
    validated_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Pago"
        verbose_name_plural = "Pagos"
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.bootcamper.get_full_name()} — {self.program.name} ({self.get_status_display()})"
