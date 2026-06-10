from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from apps.authentication.models import CustomUser
from apps.authentication.permissions import IsAdmin
from .serializers import AdminUserSerializer, CreateUserSerializer
from . import services

class UserViewSet(viewsets.ModelViewSet):
    queryset = CustomUser.objects.all().order_by('-created_at')
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateUserSerializer
        return AdminUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.create_user(serializer.validated_data)

        response_serializer = AdminUserSerializer(user)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """Desactiva al usuario (soft delete)."""
        user = self.get_object()
        if user == request.user:
            return Response(
                    {"detail": "No puedes eliminarte a ti mismo."},
                    status=status.HTTP_400_BAD_REQUEST
            )

        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={200: AdminUserSerializer})
    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        """Activa/Desactiva a un usuario sin eliminarlo."""
        user = self.get_object()
        if user == request.user:
            return Response(
                {"detail": "No puedes modificar tu propio estado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        updated_user = services.toggle_user_activation(user)
        response_serializer = AdminUserSerializer(updated_user)
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @extend_schema(responses={200: {"type": "object", "properties": {"new_password": {"type": "string"}}}})
    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Genera una nueva contraseña temporal segura."""
        user = self.get_object()
        new_password = services.reset_user_password(user)
        return Response({'new_password': new_password}, status=status.HTTP_200_OK)
