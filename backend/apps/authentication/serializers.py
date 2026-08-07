"""Serializers for authentication app."""
from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import CustomUser
from .validators import validate_identificacion


class LoginSerializer(serializers.Serializer):
    """Serializer for user login via email."""
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email    = attrs.get('email')
        password = attrs.get('password')

        user = authenticate(
            request=self.context.get('request'),
            username=email,
            password=password,
        )

        if user is None:
            # `authenticate()` devuelve None tanto si la contraseña es
            # incorrecta como si la cuenta está desactivada (ModelBackend
            # rechaza a los inactivos). Para distinguir ambos casos sin filtrar
            # qué emails existen, se comprueba la contraseña explícitamente:
            # sólo quien ya demostró conocerla se entera de que la cuenta está
            # desactivada. A cualquier otro se le responde lo mismo (SEC-3).
            try:
                db_user = CustomUser.objects.get(email=email)
            except CustomUser.DoesNotExist:
                # Se hashea igual contra un usuario inexistente para que el
                # tiempo de respuesta no delate si el email está registrado.
                CustomUser().set_password(password)
                db_user = None

            if db_user is not None and not db_user.is_active and db_user.check_password(password):
                raise serializers.ValidationError(
                    {'code': 'ACCOUNT_INACTIVE', 'error': 'Cuenta desactivada. Contacte al administrador.'},
                    code='account_inactive',
                )

            raise serializers.ValidationError(
                {'code': 'INVALID_CREDENTIALS', 'error': 'Credenciales inválidas.'},
                code='authorization',
            )

        attrs['user'] = user
        return attrs


class UserDataSerializer(serializers.ModelSerializer):
    """Serializer for user data representation."""
    full_name    = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model  = CustomUser
        fields = (
            'id', 'email', 'first_name', 'last_name',
            'full_name', 'role', 'role_display', 'phone', 'is_active',
            'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_full_name(self, obj):
        return obj.get_full_name()


class MeUpdateSerializer(serializers.ModelSerializer):
    """Serializer de escritura para el propio perfil.

    Limitado a campos que el usuario puede cambiar sobre sí mismo:
    `role`, `is_active` y `email` sólo se gestionan desde el panel de
    administración (UserViewSet), nunca vía /api/auth/me/.
    """

    class Meta:
        model  = CustomUser
        fields = ('first_name', 'last_name', 'phone')


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for password reset request (always succeeds)."""
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for password reset confirmation."""
    token            = serializers.CharField()
    password         = serializers.CharField(min_length=8, write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(
                {'code': 'PASSWORD_MISMATCH', 'error': 'Las contraseñas no coinciden.'}
            )
        return attrs


class OnboardingActivateSerializer(serializers.Serializer):
    """Serializer for bootcamper account activation (#253).

    The bootcamper sets their password and confirms/corrects the profile
    data that ``convert_lead_to_bootcamper`` filled in with a naive guess
    (first_name/last_name split from the lead's full name).
    """
    password         = serializers.CharField(min_length=8, write_only=True)
    password_confirm = serializers.CharField(write_only=True)
    first_name       = serializers.CharField(max_length=150, required=False)
    last_name        = serializers.CharField(max_length=150, required=False)
    phone            = serializers.CharField(max_length=20, required=False, allow_blank=True)
    cedula           = serializers.CharField(max_length=13, required=False)
    # Obligatorio y sin default (#329): omitirlo no puede equivaler a aceptarlo.
    data_consent     = serializers.BooleanField()

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(
                {'code': 'PASSWORD_MISMATCH', 'error': 'Las contraseñas no coinciden.'}
            )
        return attrs

    def validate_cedula(self, value):
        if not validate_identificacion(value):
            raise serializers.ValidationError('La identificación ingresada no es válida.')
        return value
