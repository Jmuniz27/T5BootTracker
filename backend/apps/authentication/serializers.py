"""Serializers for authentication app."""
from django.contrib.auth import authenticate
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from .models import CustomUser


class LoginSerializer(serializers.Serializer):
    """Serializer for user login."""
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        user = authenticate(
            request=self.context.get('request'),
            username=username,
            password=password,
        )

        if not user:
            raise serializers.ValidationError(
                _('Credenciales inválidas. Por favor, intente nuevamente.'),
                code='authorization',
            )

        if not user.is_active:
            raise serializers.ValidationError(
                _('Cuenta desactivada. Contacte al administrador.'),
                code='authorization',
            )

        attrs['user'] = user
        return attrs


class UserDataSerializer(serializers.ModelSerializer):
    """Serializer for user data representation."""
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = CustomUser
        fields = (
            'id', 'username', 'email', 'first_name', 'last_name',
            'full_name', 'role', 'role_display', 'phone', 'is_active',
            'date_joined',
        )
        read_only_fields = ('id', 'date_joined')

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class PasswordRecoverySerializer(serializers.Serializer):
    """Serializer for password recovery request."""
    email = serializers.EmailField()

    def validate_email(self, value):
        if not CustomUser.objects.filter(email=value, is_active=True).exists():
            # Return success even if email doesn't exist to prevent enumeration
            return value
        return value


class PasswordResetSerializer(serializers.Serializer):
    """Serializer for password reset with token."""
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError('Las contraseñas no coinciden.')
        return attrs
