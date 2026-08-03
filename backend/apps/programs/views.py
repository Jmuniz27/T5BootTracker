"""Views for programs app."""
from django.db.models import Count
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.leads.permissions import IsAdministrator, IsCommercialOrAdmin
from .models import Cohort, Program, CoordinatorEmailConfig
from .serializers import (
    CohortSerializer, CohortWriteSerializer,
    ProgramSerializer, ProgramWriteSerializer,
    CoordinatorEmailConfigSerializer,
)


class ProgramListCreateView(APIView):
    """GET /api/programs/ — list (vendedor/admin); POST — create (admin only)."""

    def get_permissions(self):
        """GET is readable by salesperson and admin; POST is admin-only."""
        if self.request.method == 'GET':
            return [IsCommercialOrAdmin()]
        return [IsAdministrator()]

    @extend_schema(
        responses={200: ProgramSerializer(many=True)},
        summary='Listar programas',
        description='Lista todos los programas. Accesible por Vendedor y Administrador.',
        tags=['Programas'],
    )
    def get(self, request):
        programs = (
            Program.objects
            .prefetch_related('coordinator_emails')
            .annotate(cohort_count=Count('cohorts', distinct=True))
        )
        return Response(ProgramSerializer(programs, many=True).data)

    @extend_schema(
        request=ProgramWriteSerializer,
        responses={201: ProgramSerializer, 400: OpenApiResponse(description='Datos inválidos')},
        summary='Crear programa',
        description='Crea un nuevo programa de bootcamp. end_date debe ser posterior a start_date. Solo Administrador.',
        tags=['Programas'],
    )
    def post(self, request):
        serializer = ProgramWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        program = serializer.save()
        return Response(ProgramSerializer(program).data, status=status.HTTP_201_CREATED)


class CohortListCreateView(APIView):
    """GET /api/programs/{id}/cohorts/ — list (vendedor/admin); POST — create (admin only)."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsCommercialOrAdmin()]
        return [IsAdministrator()]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                'status', str,
                description='Filtrar por estado: UPCOMING, IN_PROGRESS, FINISHED.',
            ),
        ],
        responses={200: CohortSerializer(many=True), 404: OpenApiResponse(description='Programa no encontrado')},
        summary='Listar cohortes del programa',
        description='Cohortes de un programa, opcionalmente filtradas por estado. Accesible por Vendedor y Administrador.',
        tags=['Programas'],
    )
    def get(self, request, pk):
        program = get_object_or_404(Program, pk=pk)
        cohorts = program.cohorts.all()

        estado = request.query_params.get('status')
        if estado:
            # Un estado desconocido devuelve vacío en lugar de 400: el filtro es
            # una comodidad de lectura, no una operación que deba fallar.
            cohorts = cohorts.filter(status=estado)

        return Response(CohortSerializer(cohorts, many=True).data)

    @extend_schema(
        request=CohortWriteSerializer,
        responses={
            201: CohortSerializer,
            400: OpenApiResponse(description='Datos inválidos o número de cohorte repetido'),
            404: OpenApiResponse(description='Programa no encontrado'),
        },
        summary='Crear cohorte',
        description=(
            'Crea una cohorte del programa. start_month es obligatorio y se guarda siempre '
            'con día 1. end_month no se acepta: se sella automáticamente al marcar la cohorte '
            'como finalizada. Solo Administrador.'
        ),
        tags=['Programas'],
    )
    def post(self, request, pk):
        program = get_object_or_404(Program, pk=pk)
        serializer = CohortWriteSerializer(data=request.data, context={'program': program})
        serializer.is_valid(raise_exception=True)
        cohort = serializer.save()
        return Response(CohortSerializer(cohort).data, status=status.HTTP_201_CREATED)


class CohortDetailView(APIView):
    """GET/PATCH/DELETE /api/programs/{id}/cohorts/{cohort_id}/"""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsCommercialOrAdmin()]
        return [IsAdministrator()]

    def _get_cohort(self, pk, cohort_id):
        program = get_object_or_404(Program, pk=pk)
        return get_object_or_404(Cohort, pk=cohort_id, program=program)

    @extend_schema(
        responses={200: CohortSerializer, 404: OpenApiResponse(description='No encontrado')},
        summary='Detalle de una cohorte',
        tags=['Programas'],
    )
    def get(self, request, pk, cohort_id):
        return Response(CohortSerializer(self._get_cohort(pk, cohort_id)).data)

    @extend_schema(
        request=CohortWriteSerializer,
        responses={
            200: CohortSerializer,
            400: OpenApiResponse(description='Datos inválidos o número de cohorte repetido'),
            404: OpenApiResponse(description='No encontrado'),
        },
        summary='Editar cohorte',
        description=(
            'Edita número, mes de inicio y estado. Marcar FINISHED sella end_month con el mes '
            'en curso; devolverla a otro estado lo limpia. Solo Administrador.'
        ),
        tags=['Programas'],
    )
    def patch(self, request, pk, cohort_id):
        cohort = self._get_cohort(pk, cohort_id)
        serializer = CohortWriteSerializer(
            cohort, data=request.data, partial=True, context={'program': cohort.program},
        )
        serializer.is_valid(raise_exception=True)
        return Response(CohortSerializer(serializer.save()).data)

    @extend_schema(
        responses={204: OpenApiResponse(description='Cohorte eliminada'), 404: OpenApiResponse(description='No encontrado')},
        summary='Eliminar cohorte',
        tags=['Programas'],
    )
    def delete(self, request, pk, cohort_id):
        self._get_cohort(pk, cohort_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CoordinatorListCreateView(APIView):
    """GET/POST /api/programs/{id}/coordinators/"""
    permission_classes = [IsAdministrator]

    @extend_schema(
        responses={200: CoordinatorEmailConfigSerializer(many=True), 404: OpenApiResponse(description='Programa no encontrado')},
        summary='Listar coordinadores del programa',
        tags=['Programas'],
    )
    def get(self, request, pk):
        program = get_object_or_404(Program, pk=pk)
        configs = program.coordinator_emails.all()
        return Response(CoordinatorEmailConfigSerializer(configs, many=True).data)

    @extend_schema(
        request=CoordinatorEmailConfigSerializer,
        responses={
            201: CoordinatorEmailConfigSerializer,
            400: OpenApiResponse(description='Datos inválidos o email duplicado'),
            404: OpenApiResponse(description='Programa no encontrado'),
        },
        summary='Agregar coordinador al programa',
        tags=['Programas'],
    )
    def post(self, request, pk):
        program = get_object_or_404(Program, pk=pk)
        serializer = CoordinatorEmailConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = serializer.save(program=program)
        return Response(CoordinatorEmailConfigSerializer(config).data, status=status.HTTP_201_CREATED)


class CoordinatorDestroyView(APIView):
    """DELETE /api/programs/{id}/coordinators/{coord_id}/"""
    permission_classes = [IsAdministrator]

    @extend_schema(
        responses={
            204: OpenApiResponse(description='Coordinador eliminado'),
            404: OpenApiResponse(description='Programa o coordinador no encontrado'),
        },
        summary='Eliminar coordinador del programa',
        tags=['Programas'],
    )
    def delete(self, request, pk, coord_id):
        program = get_object_or_404(Program, pk=pk)
        config  = get_object_or_404(CoordinatorEmailConfig, pk=coord_id, program=program)
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
