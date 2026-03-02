"""Views for authentication app."""
import logging
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import CustomUser
from .serializers import (
    LoginSerializer,
    UserDataSerializer,
    PasswordRecoverySerializer,
    PasswordResetSerializer,
)

logger = logging.getLogger(__name__)


class LoginView(APIView):
    """JWT login endpoint."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)

        logger.info(f'User {user.username} logged in successfully.')

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserDataSerializer(user).data,
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """JWT logout — blacklists the refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'detail': 'Refresh token requerido.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            token = RefreshToken(refresh_token)
            token.blacklist()
            logger.info(f'User {request.user.username} logged out.')
            return Response({'detail': 'Sesión cerrada exitosamente.'}, status=status.HTTP_200_OK)
        except TokenError:
            return Response(
                {'detail': 'Token inválido o ya expirado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class RefreshView(APIView):
    """Refresh access token using a valid refresh token."""
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response(
                    {'detail': 'Refresh token requerido.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            token = RefreshToken(refresh_token)
            return Response({
                'access': str(token.access_token),
                'refresh': str(token),
            }, status=status.HTTP_200_OK)
        except TokenError:
            return Response(
                {'detail': 'Token inválido o expirado.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class MeView(APIView):
    """Return the authenticated user's data."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserDataSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserDataSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PasswordRecoveryRequestView(APIView):
    """Send password recovery email."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordRecoverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        try:
            user = CustomUser.objects.get(email=email, is_active=True)
            token = default_token_generator.make_token(user)
            uid = urlsafe_base64_encode(force_bytes(user.pk))

            reset_url = f"{request.scheme}://{request.get_host()}/reset-password/{uid}/{token}/"

            send_mail(
                subject='Recuperación de contraseña — Boot-Tracker',
                message=f'Haga clic en el siguiente enlace para restablecer su contraseña: {reset_url}',
                from_email=None,
                recipient_list=[email],
                fail_silently=True,
            )
            logger.info(f'Password recovery email sent to {email}')
        except CustomUser.DoesNotExist:
            pass  # Don't reveal if email exists

        return Response({
            'detail': 'Si el correo existe, recibirá un enlace de recuperación.'
        }, status=status.HTTP_200_OK)


class PasswordResetView(APIView):
    """Reset password using token from email."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            uid = request.data.get('uid', '')
            user_pk = urlsafe_base64_decode(uid).decode()
            user = CustomUser.objects.get(pk=user_pk)
        except (TypeError, ValueError, OverflowError, CustomUser.DoesNotExist):
            return Response(
                {'detail': 'Enlace inválido o expirado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data['token']
        if not default_token_generator.check_token(user, token):
            return Response(
                {'detail': 'Token inválido o expirado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['new_password'])
        user.save()
        logger.info(f'Password reset successful for {user.username}')

        return Response({'detail': 'Contraseña actualizada exitosamente.'}, status=status.HTTP_200_OK)
