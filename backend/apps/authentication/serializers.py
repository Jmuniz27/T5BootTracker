"""Serializers for authentication app."""
from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import CustomUser


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
            # Check if the user exists but is inactive
            try:
                db_user = CustomUser.objects.get(email=email)
                if not db_user.is_active:
                    raise serializers.ValidationError(
                        {'code': 'ACCOUNT_INACTIVE', 'error': 'Cuenta desactivada. Contacte al administrador.'},
                        code='account_inactive',
                    )
            except CustomUser.DoesNotExist:
                pass
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
