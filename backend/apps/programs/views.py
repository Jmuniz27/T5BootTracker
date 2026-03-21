"""Views for programs app."""
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.leads.permissions import IsAdministrator
from .models import Program, CoordinatorEmailConfig
from .serializers import (
    ProgramSerializer, ProgramWriteSerializer,
    CoordinatorEmailConfigSerializer,
)


class ProgramListCreateView(APIView):
    """GET /api/programs/ — list; POST — create."""
    permission_classes = [IsAdministrator]

    def get(self, request):
        programs = Program.objects.prefetch_related('coordinator_emails').all()
        return Response(ProgramSerializer(programs, many=True).data)

    def post(self, request):
        serializer = ProgramWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        program = serializer.save()
        return Response(ProgramSerializer(program).data, status=status.HTTP_201_CREATED)


class CoordinatorListCreateView(APIView):
    """GET/POST /api/programs/{id}/coordinators/"""
    permission_classes = [IsAdministrator]

    def get(self, request, pk):
        program = get_object_or_404(Program, pk=pk)
        configs = program.coordinator_emails.all()
        return Response(CoordinatorEmailConfigSerializer(configs, many=True).data)

    def post(self, request, pk):
        program = get_object_or_404(Program, pk=pk)
        serializer = CoordinatorEmailConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = serializer.save(program=program)
        return Response(CoordinatorEmailConfigSerializer(config).data, status=status.HTTP_201_CREATED)


class CoordinatorDestroyView(APIView):
    """DELETE /api/programs/{id}/coordinators/{coord_id}/"""
    permission_classes = [IsAdministrator]

    def delete(self, request, pk, coord_id):
        program = get_object_or_404(Program, pk=pk)
        config  = get_object_or_404(CoordinatorEmailConfig, pk=coord_id, program=program)
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
