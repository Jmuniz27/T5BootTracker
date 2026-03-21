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

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email      = models.EmailField(unique=True, verbose_name='Correo electrónico')
    first_name = models.CharField(max_length=150, verbose_name='Nombre')
    last_name  = models.CharField(max_length=150, verbose_name='Apellido')
    phone      = models.CharField(max_length=20, blank=True, null=True, verbose_name='Teléfono')
    cedula     = models.CharField(
        max_length=10,
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
