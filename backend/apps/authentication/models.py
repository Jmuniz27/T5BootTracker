"""Custom user model for Boot-Tracker."""
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('El email es obligatorio')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'ADMINISTRATOR')
        return self.create_user(email, password, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    """Extended user model with email login and role-based access."""

    class Role(models.TextChoices):
        SALESPERSON   = 'SALESPERSON',   'Vendedor'
        BOOTCAMPER    = 'BOOTCAMPER',    'Bootcamper'
        ADMINISTRATOR = 'ADMINISTRATOR', 'Administrador'
        COORDINATOR   = 'COORDINATOR',   'Coordinador'
        FINANCE       = 'FINANCE',       'Finanzas'

    class CoordinatorScope(models.TextChoices):
        """Alcance de un coordinador: general o atado a programas concretos.

        Sólo aplica a usuarios con rol COORDINATOR; en el resto queda vacío.
        Determina a qué notificaciones se le copia (ver
        `apps.notifications.emails.coordinator_recipients`).
        """
        GENERAL = 'GENERAL', 'General'
        PROGRAM = 'PROGRAM', 'Por programa'

    class VerificationStatus(models.TextChoices):
        """Estado de verificación del perfil de un bootcamper (sólo aplica a ese rol).

        INVITED: recién convertido, aún no activó su cuenta.
        PENDING_VERIFICATION: activó la cuenta y confirmó sus datos, falta que
        el vendedor los verifique. No bloquea nada — es informativo.
        VERIFIED: el vendedor confirmó los datos.
        """
        INVITED              = 'INVITED',              'Invitado'
        PENDING_VERIFICATION = 'PENDING_VERIFICATION', 'Pendiente de verificación'
        VERIFIED             = 'VERIFIED',              'Verificado'

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email      = models.EmailField(unique=True, verbose_name='Correo electrónico')
    first_name = models.CharField(max_length=150, verbose_name='Nombre')
    last_name  = models.CharField(max_length=150, verbose_name='Apellido')
    phone      = models.CharField(max_length=20, blank=True, null=True, verbose_name='Teléfono')
    cedula     = models.CharField(
        max_length=13,
        unique=True,
        null=True,
        blank=True,
        verbose_name='Cédula',
    )
    role       = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.BOOTCAMPER,
        verbose_name='Rol',
    )
    coordinator_scope = models.CharField(
        max_length=20,
        choices=CoordinatorScope.choices,
        blank=True,
        default='',
        verbose_name='Alcance del coordinador',
    )
    coordinator_programs = models.ManyToManyField(
        'programs.Program',
        blank=True,
        related_name='coordinator_users',
        verbose_name='Programas asignados',
    )
    # Pool de bootcampers: quién de Finanzas monitorea los pagos de esta
    # persona. Sólo tiene sentido en usuarios con rol BOOTCAMPER; vacío
    # significa que sigue en el pool, sin responsable. Espejo de
    # `Lead.owner` / `Lead.assigned_at` en el pool de leads.
    finance_owner = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monitored_bootcampers',
        verbose_name='Responsable de cobro',
    )
    finance_assigned_at = models.DateTimeField(null=True, blank=True)
    # Verificación del perfil del bootcamper (issue #254). El default VERIFIED
    # es a propósito: la migración no debe marcar retroactivamente todo el
    # historial de bootcampers como pendiente — sólo los convertidos a partir
    # de aquí arrancan en INVITED (ver `convert_lead_to_bootcamper`).
    verification_status = models.CharField(
        max_length=25,
        choices=VerificationStatus.choices,
        default=VerificationStatus.VERIFIED,
        verbose_name='Estado de verificación',
    )
    verified_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_bootcampers',
        verbose_name='Verificado por',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)
    # Token de invitación vigente (issue #253/#255): comparado contra el
    # `iat` firmado en el token para invalidar el link anterior al reenviar.
    onboarding_token_issued_at = models.DateTimeField(null=True, blank=True)
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    objects = CustomUserManager()

    class Meta:
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_full_name()} ({self.get_role_display()})'

    def get_full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_salesperson(self):
        return self.role == self.Role.SALESPERSON

    @property
    def is_administrator(self):
        return self.role == self.Role.ADMINISTRATOR

    @property
    def is_finance(self):
        return self.role == self.Role.FINANCE

    @property
    def is_bootcamper(self):
        return self.role == self.Role.BOOTCAMPER

    @property
    def is_coordinator(self):
        return self.role == self.Role.COORDINATOR
