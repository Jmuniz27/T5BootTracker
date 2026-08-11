from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiResponse

from apps.authentication.models import CustomUser
from apps.authentication.permissions import IsAdmin, IsStaffNotCoordinator
from .serializers import AdminUserSerializer, CreateUserSerializer, EnrollmentCohortUpdateSerializer
from . import services

class UserViewSet(viewsets.ModelViewSet):
    queryset = CustomUser.objects.all().order_by('-created_at')
    permission_classes = [IsAdmin]

    def get_queryset(self):
        # #328: la tabla muestra programa y cohorte del bootcamper. Sin este
        # prefetch cada fila dispara sus propias consultas.
        return (
            super().get_queryset()
            .prefetch_related(
                'coordinator_programs',
                'enrollments__bootcamp',
                'enrollments__cohort',
            )
        )

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

    def update(self, request, *args, **kwargs):
        """PUT/PATCH — nunca toca password ni credenciales; sólo sincroniza is_staff.

        Cambiar el rol por aquí no debe reenviar ninguna invitación ni tocar la
        contraseña (issue #295): eso sólo pasa al crear. Lo único que faltaba
        sincronizar era `is_staff`, que hoy sólo se setea en `create_user` — un
        PATCH que promueve a alguien a ADMINISTRATOR (o lo degrada) lo dejaba
        desincronizado del rol.
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        new_role = serializer.validated_data.get('role', user.role)
        should_be_staff = new_role == CustomUser.Role.ADMINISTRATOR
        if user.is_staff != should_be_staff:
            user.is_staff = should_be_staff
            user.save(update_fields=['is_staff'])

        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

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


class EnrollmentCohortView(APIView):
    """PATCH /api/users/{pk}/enrollments/{enrollment_id}/ — asigna/cambia la cohorte (CB-347).

    Cualquiera de staff con acceso operativo puede hacer el cambio (no sólo el
    admin): quien detecta que falta o está mal suele ser Finanzas o el vendedor
    dueño del caso, no el admin. El coordinador queda fuera — es un contacto
    del programa, no alguien que opera datos de inscripción.
    """
    permission_classes = [IsStaffNotCoordinator]

    @extend_schema(
        request=EnrollmentCohortUpdateSerializer,
        responses={
            200: AdminUserSerializer,
            400: OpenApiResponse(description='Cohorte de otro programa, o que no admite inscripciones'),
            404: OpenApiResponse(description='Bootcamper, inscripción o cohorte no encontrados'),
            409: OpenApiResponse(description='Ya existe otra inscripción en esa misma cohorte'),
        },
        summary='Asignar o cambiar la cohorte de un bootcamper',
        description=(
            '`cohort_id: null` vacía la cohorte de la inscripción. Deja un registro en el '
            'historial del lead que originó la inscripción (si existe), para que el admin vea '
            'el cambio aunque no lo haya hecho quien lo pidió.'
        ),
        tags=['Usuarios'],
    )
    def patch(self, request, pk, enrollment_id):
        bootcamper = get_object_or_404(CustomUser, pk=pk, role=CustomUser.Role.BOOTCAMPER)

        serializer = EnrollmentCohortUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        services.change_enrollment_cohort(
            bootcamper=bootcamper,
            enrollment_id=enrollment_id,
            cohort_id=serializer.validated_data['cohort_id'],
            changed_by=request.user,
        )

        response_serializer = AdminUserSerializer(bootcamper)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
