"""Payment model for Boot-Tracker."""

import uuid
from django.conf import settings
from django.db import models
from django.utils.timezone import now


class Payment(models.Model):
    """A payment receipt submitted by a bootcamper for review."""

    class Status(models.TextChoices):
        DRAFT    = "DRAFT",    "En revisión"
        PENDING  = "PENDING",  "Pendiente"
        APPROVED = "APPROVED", "Aprobado"
        REJECTED = "REJECTED", "Rechazado"

    class Method(models.TextChoices):
        TRANSFER = "TRANSFER", "Transferencia"
        # CR-013: el bootcamper pagó con tarjeta en un link externo (ESPOLTECH)
        # y sube evidencia de ese pago, no un comprobante bancario. Sin datos
        # de banco/cuenta y sin OCR: Finanzas confirma a ojo.
        LINK     = "LINK",     "Link de pago"

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
    payment_method = models.CharField(
        max_length=10, choices=Method.choices, default=Method.TRANSFER,
    )
    # CR-013: qué link concreto usó el bootcamper para pagar, cuando el método
    # es LINK. Puede haber varios links vigentes/pasados por inscripción (uno
    # por negociación, como una factura), así que hace falta saber cuál de
    # todos generó esta evidencia. SET_NULL: el link puede expirar o borrarse
    # sin que eso invalide el pago ya subido.
    payment_link = models.ForeignKey(
        "PaymentLink",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
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


class PaymentLink(models.Model):
    """CR-013: enlace de pago con tarjeta que Finanzas negoció y pegó a mano.

    El sistema no genera el link — Finanzas lo genera en ESPOLTECH fuera del
    sistema, y sólo lo pega acá para que el bootcamper lo vea y le llegue por
    correo. Es una entidad propia (no un campo en Enrollment) porque puede
    haber varios a lo largo del tiempo, cada uno de una negociación puntual
    con Finanzas — igual que una factura — y hace falta conservar el
    historial en vez de sobreescribir el anterior.
    """

    class Status(models.TextChoices):
        ACTIVE   = "ACTIVE",   "Activo"
        EXPIRED  = "EXPIRED",  "Expirado"
        REVOKED  = "REVOKED",  "Revocado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enrollment = models.ForeignKey(
        "programs.Enrollment",
        on_delete=models.CASCADE,
        related_name="payment_links",
    )
    url = models.URLField(verbose_name="Enlace de pago")
    # Lo que se negoció con el bootcamper para este link puntual — no se valida
    # contra el saldo del programa, es sólo referencia para Finanzas y el
    # bootcamper (ej. "Cuota 2 - $300").
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        verbose_name="Monto negociado",
    )
    note = models.CharField(max_length=200, blank=True, verbose_name="Concepto")
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_payment_links",
    )
    expires_at = models.DateTimeField(verbose_name="Expira el")
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Enlace de pago"
        verbose_name_plural = "Enlaces de pago"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.enrollment.bootcamper.get_full_name()} — {self.get_status_display()} (vence {self.expires_at:%Y-%m-%d})"

    @property
    def is_active(self):
        """Vigente de verdad: ACTIVE y todavía no vencido.

        `status` no se actualiza a EXPIRED por un cron — vencer es sólo cosa
        de la fecha, así que se calcula al vuelo en vez de depender de un job
        que lo mantenga sincronizado.
        """
        return self.status == self.Status.ACTIVE and self.expires_at > now()


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
