"""Views for programs app."""
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.leads.permissions import IsAdministrator, IsSalespersonOrAdmin
from .models import Program, CoordinatorEmailConfig
from .serializers import (
    ProgramSerializer, ProgramWriteSerializer,
    CoordinatorEmailConfigSerializer,
)


class ProgramListCreateView(APIView):
    """GET /api/programs/ — list (vendedor/admin); POST — create (admin only)."""

    def get_permissions(self):
        """GET is readable by salesperson and admin; POST is admin-only."""
        if self.request.method == 'GET':
            return [IsSalespersonOrAdmin()]
        return [IsAdministrator()]

    @extend_schema(
        responses={200: ProgramSerializer(many=True)},
        summary='Listar programas',
        description='Lista todos los programas. Accesible por Vendedor y Administrador.',
        tags=['Programas'],
    )
    def get(self, request):
        programs = Program.objects.prefetch_related('coordinator_emails').all()
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
