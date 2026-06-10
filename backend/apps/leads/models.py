"""Lead and Interaction models for Boot-Tracker."""
import uuid
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Lead(models.Model):
    class Source(models.TextChoices):
        INSTAGRAM    = 'INSTAGRAM',    'Instagram'
        WHATSAPP     = 'WHATSAPP',     'WhatsApp'
        LANDING_PAGE = 'LANDING_PAGE', 'Landing Page'
        MANUAL       = 'MANUAL',       'Manual'

    class Status(models.TextChoices):
        NEW               = 'NEW',               'Nuevo'
        CONTACTED         = 'CONTACTED',         'Contactado'
        INTERESTED        = 'INTERESTED',        'Interesado'
        NOT_INTERESTED    = 'NOT_INTERESTED',    'No interesado'
        SPEAK_COORDINATOR = 'SPEAK_COORDINATOR', 'Hablar con coordinador'
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
    last_contact     = models.DateTimeField(null=True, blank=True, verbose_name='Último contacto')
    version          = models.PositiveIntegerField(default=0)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Lead'
        verbose_name_plural = 'Leads'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.get_status_display()})'


class Interaction(models.Model):
    class InteractionType(models.TextChoices):
        CALL      = 'CALL',      'Llamada'
        WHATSAPP  = 'WHATSAPP',  'WhatsApp'
        EMAIL     = 'EMAIL',     'Email'
        VISIT     = 'VISIT',     'Visita'
        NOTE      = 'NOTE',      'Nota'

    class Outcome(models.TextChoices):
        INTERESTED        = 'INTERESTED',        'Interesado'
        NOT_INTERESTED    = 'NOT_INTERESTED',    'No interesado'
        NO_ANSWER         = 'NO_ANSWER',         'No contestó'
        CALLBACK          = 'CALLBACK',          'Llamar después'
        SPEAK_COORDINATOR = 'SPEAK_COORDINATOR', 'Hablar con coordinador'

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
