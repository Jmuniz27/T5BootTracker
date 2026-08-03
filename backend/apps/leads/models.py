"""Lead and Interaction models for Boot-Tracker."""
import uuid
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.timezone import now


class LeadManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Lead(models.Model):
    class Source(models.TextChoices):
        INSTAGRAM    = 'INSTAGRAM',    'Instagram'
        WHATSAPP     = 'WHATSAPP',     'WhatsApp'
        LANDING_PAGE = 'LANDING_PAGE', 'Landing Page'
        MANUAL       = 'MANUAL',       'Manual'

    class Status(models.TextChoices):
        NEW               = 'NEW',               'Nuevo'
        QUALIFIED         = 'QUALIFIED',         'Calificado'
        INTERESTED        = 'INTERESTED',        'Interesado'
        NOT_INTERESTED    = 'NOT_INTERESTED',    'No interesado'
        CONVERTED         = 'CONVERTED',         'Convertido'

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name             = models.CharField(max_length=200, verbose_name='Nombre')
    phone            = models.CharField(max_length=20, verbose_name='Teléfono')
    email            = models.EmailField(blank=True, null=True, verbose_name='Correo')
    program_interest = models.CharField(max_length=200, blank=True, verbose_name='Programa de interés')
    source           = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.MANUAL,
        verbose_name='Fuente',
    )
    is_company       = models.BooleanField(default=False, verbose_name='Es empresa')
    status           = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.NEW,
        db_index=True,
        verbose_name='Estado',
    )
    owner            = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='leads',
        verbose_name='Vendedor asignado',
    )
    program          = models.ForeignKey(
        'programs.Program',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='leads',
        verbose_name='Programa',
    )
    assigned_at      = models.DateTimeField(null=True, blank=True)
    # CR-006: se setea al liberar (por el vendedor o por el admin) y se limpia al
    # reasignar. Con assigned_at permite calcular el tiempo de retención.
    released_at      = models.DateTimeField(null=True, blank=True, verbose_name='Liberado')
    last_contact     = models.DateTimeField(null=True, blank=True, verbose_name='Último contacto')
    version          = models.PositiveIntegerField(default=0)
    deleted_at       = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name='Eliminado')
    created_at       = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at       = models.DateTimeField(auto_now=True)

    objects     = LeadManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name = 'Lead'
        verbose_name_plural = 'Leads'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.get_status_display()})'

    def soft_delete(self):
        self.deleted_at = now()
        self.save(update_fields=['deleted_at', 'updated_at'])


class Interaction(models.Model):
    class InteractionType(models.TextChoices):
        CALL      = 'CALL',      'Llamada'
        WHATSAPP  = 'WHATSAPP',  'WhatsApp'
        EMAIL     = 'EMAIL',     'Email'
        VISIT     = 'VISIT',     'Visita'
        NOTE      = 'NOTE',      'Nota'
        SYSTEM    = 'SYSTEM',    'Sistema'

    class Outcome(models.TextChoices):
        CALL_AGAIN        = 'CALL_AGAIN',        'Llamar de nuevo'
        SEND_INFO         = 'SEND_INFO',         'Enviar información'
        SCHEDULE_VISIT    = 'SCHEDULE_VISIT',    'Agendar visita'
        AWAIT_REPLY       = 'AWAIT_REPLY',       'Esperar respuesta'
        SPEAK_COORDINATOR = 'SPEAK_COORDINATOR', 'Hablar con coordinador'
        REASSIGNED        = 'REASSIGNED',        'Reasignado por administrador'

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lead             = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name='interactions',
    )
    salesperson      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='interactions',
    )
    interaction_type = models.CharField(max_length=20, choices=InteractionType.choices)
    outcome          = models.CharField(max_length=30, choices=Outcome.choices)
    interest_level   = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )  # 1-5
    notes            = models.TextField(blank=True)
    campaign         = models.CharField(max_length=100, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    next_action      = models.TextField(blank=True)
    next_action_date = models.DateField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Interacción'
        verbose_name_plural = 'Interacciones'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.lead.name} — {self.get_interaction_type_display()} ({self.get_outcome_display()})'

    @property
    def days_as_lead(self):
        """Days between lead creation and this interaction."""
        return (self.created_at.date() - self.lead.created_at.date()).days


class LeadAssignmentSetting(models.Model):
    """Singleton (pk=1) global toggle for salesperson lead self-assignment (CR-004)."""

    self_assign_enabled = models.BooleanField(default=True, verbose_name='Auto-asignación habilitada')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Actualizado por',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración de auto-asignación de leads'
        verbose_name_plural = 'Configuración de auto-asignación de leads'

    def __str__(self):
        return f'Auto-asignación: {"habilitada" if self.self_assign_enabled else "deshabilitada"}'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
