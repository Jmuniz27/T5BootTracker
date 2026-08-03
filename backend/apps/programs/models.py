"""Program and CoordinatorEmailConfig models."""
import uuid
from django.db import models
from django.conf import settings


class Program(models.Model):
    """A bootcamp program offering."""

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name       = models.CharField(max_length=200, verbose_name='Nombre')
    start_date = models.DateField(verbose_name='Fecha de inicio')
    end_date   = models.DateField(verbose_name='Fecha de fin')
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Costo total')
    is_active  = models.BooleanField(default=True, verbose_name='Activo')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Programa'
        verbose_name_plural = 'Programas'
        ordering = ['-start_date']

    def __str__(self):
        return self.name


class Cohort(models.Model):
    """Una edición concreta de un programa: "cohorte 1", "cohorte 2"…

    El programa aporta el costo y las fechas de referencia (`Payment` y
    `Enrollment` siguen colgando de `Program`); la cohorte sólo identifica la
    edición y en qué mes arrancó o terminó.

    Los tres estados son manuales: nada se deriva de las fechas. Lo único
    automático es `end_month`, que se llena al marcar la cohorte finalizada
    (ver `apps.programs.services.set_cohort_status`).
    """

    class Status(models.TextChoices):
        UPCOMING    = 'UPCOMING',    'Próximamente'
        IN_PROGRESS = 'IN_PROGRESS', 'En curso'
        FINISHED    = 'FINISHED',    'Finalizada'

    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name='cohorts',
        verbose_name='Programa',
    )
    number = models.PositiveIntegerField(verbose_name='Número de cohorte')
    # Se guardan como fecha con día 1: el dominio es un mes, no un día. La
    # normalización vive en save() para que también aplique al admin y al seed.
    start_month = models.DateField(verbose_name='Mes de inicio')
    end_month   = models.DateField(
        null=True, blank=True, verbose_name='Mes de finalización',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.UPCOMING,
        verbose_name='Estado',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cohorte'
        verbose_name_plural = 'Cohortes'
        ordering = ['-start_month', '-number']
        constraints = [
            models.UniqueConstraint(
                fields=['program', 'number'],
                name='unique_cohort_number_per_program',
            ),
        ]

    def __str__(self):
        return f'{self.program.name} — Cohorte {self.number}'

    def save(self, *args, **kwargs):
        """Fija el día 1 en los dos meses: el día que manden es irrelevante."""
        if self.start_month:
            self.start_month = self.start_month.replace(day=1)
        if self.end_month:
            self.end_month = self.end_month.replace(day=1)
        super().save(*args, **kwargs)


class CoordinatorEmailConfig(models.Model):
    """Email recipients for coordinator notifications per program."""

    RECIPIENT_TYPE = [
        ('TO', 'Principal'),
        ('CC', 'Copia'),
    ]

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program        = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name='coordinator_emails',
    )
    email          = models.EmailField(verbose_name='Correo')
    name           = models.CharField(max_length=200, verbose_name='Nombre')
    recipient_type = models.CharField(max_length=2, choices=RECIPIENT_TYPE, default='TO')
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Configuración de coordinador'
        verbose_name_plural = 'Configuraciones de coordinadores'
        unique_together = ['program', 'email']

    def __str__(self):
        return f'{self.name} <{self.email}> ({self.program.name})'


class Enrollment(models.Model):
    """Registro de inscripción de un bootcamper a un programa."""
    class Status(models.TextChoices):
        ACTIVE    = 'ACTIVE',    'Activo'
        DROPPED   = 'DROPPED',   'Retirado'
        GRADUATED = 'GRADUATED', 'Graduado'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bootcamper = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='enrollments'
    )
    bootcamp = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name='enrollments'
    )
    start_date = models.DateField(verbose_name='Fecha de inicio')
    agreed_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Precio acordado')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Inscripción'
        verbose_name_plural = 'Inscripciones'
        unique_together = ['bootcamper', 'bootcamp']

    def __str__(self):
        return f'{self.bootcamper} -> {self.bootcamp.name}'
