"""Views for authentication app."""
import logging
import uuid

import redis
from django.conf import settings
from drf_spectacular.utils import extend_schema, OpenApiResponse, inline_serializer
from rest_framework import status, serializers as drf_serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import CustomUser
from .serializers import (
    LoginSerializer,
    MeUpdateSerializer,
    UserDataSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)

logger = logging.getLogger(__name__)


def _get_redis():
    return redis.from_url(settings.REDIS_URL)


class LoginView(APIView):
    """JWT login endpoint — authenticates via email + password."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    @extend_schema(
        request=LoginSerializer,
        responses={
            200: inline_serializer('LoginResponse', fields={
                'access':  drf_serializers.CharField(),
                'refresh': drf_serializers.CharField(),
                'user': inline_serializer('LoginUserData', fields={
                    'id':        drf_serializers.UUIDField(),
                    'email':     drf_serializers.EmailField(),
                    'full_name': drf_serializers.CharField(),
                    'role':      drf_serializers.CharField(),
                }),
            }),
            401: OpenApiResponse(description='Credenciales inválidas'),
            403: OpenApiResponse(description='Cuenta inactiva'),
        },
        summary='Login',
        description='Autentica con email y contraseña. Devuelve access + refresh JWT.',
        tags=['Auth'],
    )
    def post(self, request):
        # El estado de la cuenta lo resuelve LoginSerializer, y sólo después de
        # comprobar la contraseña. Consultarlo aquí, antes de validar nada,
        # permitía averiguar qué emails existen en el sistema (SEC-3).
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            detail = serializer.errors
            if isinstance(detail, dict) and detail.get('code') == 'ACCOUNT_INACTIVE':
                return Response(
                    {'error': detail['error'], 'code': 'ACCOUNT_INACTIVE'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {'error': 'Credenciales inválidas.', 'code': 'INVALID_CREDENTIALS'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)
        logger.info(f'User {user.email} logged in.')

        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id':        str(user.id),
                'email':     user.email,
                'full_name': user.get_full_name(),
                'role':      user.role,
            },
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """JWT logout — blacklists the refresh token."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer('LogoutRequest', fields={'refresh': drf_serializers.CharField()}),
        responses={204: OpenApiResponse(description='Sesión cerrada'), 400: OpenApiResponse(description='Token inválido')},
        summary='Logout',
        description='Invalida el refresh token en la blacklist.',
        tags=['Auth'],
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'error': 'Refresh token requerido.', 'code': 'MISSING_REFRESH_TOKEN'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            logger.info(f'User {request.user.email} logged out.')
            return Response(status=status.HTTP_204_NO_CONTENT)
        except TokenError:
            return Response(
                {'error': 'Token inválido o ya expirado.', 'code': 'INVALID_TOKEN'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class RefreshView(APIView):
    """Refresh access token using a valid refresh token."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    @extend_schema(
        request=inline_serializer('RefreshRequest', fields={'refresh': drf_serializers.CharField()}),
        responses={
            200: inline_serializer('RefreshResponse', fields={
                'access':  drf_serializers.CharField(),
                'refresh': drf_serializers.CharField(),
            }),
            401: OpenApiResponse(description='Token inválido o expirado'),
        },
        summary='Refresh token',
        description='Obtiene un nuevo access token con el refresh token.',
        tags=['Auth'],
    )
    def post(self, request):
        if not request.data.get('refresh'):
            return Response(
                {'error': 'Refresh token requerido.', 'code': 'MISSING_REFRESH_TOKEN'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            serializer = TokenRefreshSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
        except (TokenError, drf_serializers.ValidationError):
            return Response(
                {'error': 'Token inválido o expirado.', 'code': 'INVALID_TOKEN'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class MeView(APIView):
    """Return or update the authenticated user's data."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: UserDataSerializer},
        summary='Mi perfil',
        tags=['Auth'],
    )
    def get(self, request):
        return Response(UserDataSerializer(request.user).data)

    @extend_schema(
        request=MeUpdateSerializer,
        responses={200: UserDataSerializer},
        summary='Actualizar mi perfil',
        tags=['Auth'],
    )
    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserDataSerializer(request.user).data)


class PasswordResetRequestView(APIView):
    """Send password reset link via email. Always returns 200."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={200: OpenApiResponse(description='Email enviado (siempre 200 por seguridad)')},
        summary='Solicitar reset de contraseña',
        description='Envía un enlace de recuperación si el email existe. Siempre devuelve 200.',
        tags=['Auth'],
    )
    def post(self, request):
        from apps.notifications.tasks import send_password_reset_email

        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        try:
            user = CustomUser.objects.get(email=email, is_active=True)
            token = str(uuid.uuid4())
            r = _get_redis()
            r.setex(f'password_reset:{token}', settings.PASSWORD_RESET_TOKEN_TTL, str(user.pk))

            reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
            send_password_reset_email.delay(email, reset_link, user_name=user.get_full_name())
            logger.info('Password reset email queued for %s.', email)
        except CustomUser.DoesNotExist:
            pass

        return Response(
            {'detail': 'Si el correo existe, recibirás un enlace de recuperación.'},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """Reset password using the UUID token from email."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        responses={
            200: OpenApiResponse(description='Contraseña actualizada'),
            400: OpenApiResponse(description='Token expirado o contraseñas no coinciden'),
        },
        summary='Confirmar reset de contraseña',
        tags=['Auth'],
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data['token']
        r = _get_redis()
        user_pk = r.get(f'password_reset:{token}')

        if not user_pk:
            return Response(
                {'error': 'Token expirado o inválido.', 'code': 'TOKEN_EXPIRED'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_pk = user_pk.decode() if isinstance(user_pk, bytes) else user_pk
            user = CustomUser.objects.get(pk=user_pk)
        except (CustomUser.DoesNotExist, ValueError):
            return Response(
                {'error': 'Token inválido.', 'code': 'TOKEN_INVALID'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['password'])
        user.save()
        r.delete(f'password_reset:{token}')
        logger.info(f'Password reset successful for {user.email}')

        return Response({'detail': 'Contraseña actualizada exitosamente.'}, status=status.HTTP_200_OK)
