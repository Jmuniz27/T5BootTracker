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
    # Soft-delete: cuando el bootcamper elimina un pago que Finanzas ya vio
    # (pendiente/rechazado), no se borra; queda como "Eliminado por el bootcamper"
    # en el historial de Finanzas. Un DRAFT que nadie revisó sí se borra de verdad.
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_payments",
    )

    class Meta:
        verbose_name = "Pago"
        verbose_name_plural = "Pagos"
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.bootcamper.get_full_name()} — {self.program.name} ({self.get_status_display()})"

    @property
    def is_deleted(self):
        return self.deleted_at is not None


class PaymentPlan(models.Model):
    """Plan de pagos que Finanzas sube para un bootcamper (PDF o Excel).

    Uno por bootcamper: subir de nuevo reemplaza el anterior. Lo gestiona
    Finanzas/Admin; el bootcamper sólo puede verlo.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bootcamper = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payment_plan",
    )
    file = models.FileField(upload_to="payment_plans/%Y/%m/")
    file_type = models.CharField(max_length=10)  # 'pdf' | 'excel'
    original_name = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_payment_plans",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Plan de pagos"
        verbose_name_plural = "Planes de pago"

    def __str__(self):
        return f"Plan de pagos — {self.bootcamper.get_full_name()}"


class BootcamperAssignmentSetting(models.Model):
    """Singleton (pk=1) que habilita la auto-asignación de cobro por Finanzas.

    Espejo de `LeadAssignmentSetting` en el pool de leads (CR-004): el mismo
    control, aplicado al pool de bootcampers. Apagado, sólo el Administrador
    reparte quién cobra a quién.

    Se guarda quién lo cambió y cuándo porque decide sobre el reparto del cobro
    de todo el equipo, y conviene saber de quién fue la decisión.
    """

    self_assign_enabled = models.BooleanField(
        default=True, verbose_name='Auto-asignación habilitada',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Actualizado por',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración de auto-asignación de cobro'
        verbose_name_plural = 'Configuración de auto-asignación de cobro'

    def __str__(self):
        estado = 'habilitada' if self.self_assign_enabled else 'deshabilitada'
        return f'Auto-asignación de cobro: {estado}'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
