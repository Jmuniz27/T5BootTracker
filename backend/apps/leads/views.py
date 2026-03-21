"""Views for leads app."""
import logging

from django.db import transaction
from django.db.models import Count, Q
from django.utils.timezone import now
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Lead, Interaction
from .permissions import IsSalesperson, IsSalespersonOrAdmin
from .serializers import LeadListSerializer, LeadWriteSerializer, InteractionSerializer

logger = logging.getLogger(__name__)

OUTCOME_TO_STATUS = {
    Interaction.Outcome.INTERESTED:        Lead.Status.INTERESTED,
    Interaction.Outcome.NOT_INTERESTED:    Lead.Status.NOT_INTERESTED,
    Interaction.Outcome.SPEAK_COORDINATOR: Lead.Status.SPEAK_COORDINATOR,
}


class LeadListCreateView(APIView):
    """GET returns my_leads + available_leads. POST creates a new lead."""
    permission_classes = [IsSalespersonOrAdmin]

    def _annotated_qs(self):
        return Lead.objects.annotate(interaction_count=Count('interactions'))

    def get(self, request):
        qs = self._annotated_qs()

        # Filters
        status_filter = request.query_params.get('status')
        source_filter = request.query_params.get('source')
        search        = request.query_params.get('search')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if source_filter:
            qs = qs.filter(source=source_filter)
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search)
            )

        my_leads        = qs.filter(owner=request.user)
        available_leads = qs.filter(owner__isnull=True)

        return Response({
            'my_leads':        LeadListSerializer(my_leads, many=True).data,
            'available_leads': LeadListSerializer(available_leads, many=True).data,
        })

    def post(self, request):
        serializer = LeadWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()
        return Response(LeadListSerializer(lead).data, status=status.HTTP_201_CREATED)


class LeadAssignView(APIView):
    """PATCH /leads/{id}/assign/ — self-assignment with optimistic locking."""
    permission_classes = [IsSalesperson]

    def patch(self, request, pk):
        with transaction.atomic():
            try:
                lead = Lead.objects.select_for_update().get(pk=pk)
            except Lead.DoesNotExist:
                return Response(
                    {'error': 'Lead no encontrado.', 'code': 'LEAD_NOT_FOUND'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if lead.owner is not None:
                return Response(
                    {'error': 'Este lead ya fue asignado por otro vendedor.', 'code': 'LEAD_ALREADY_ASSIGNED'},
                    status=status.HTTP_409_CONFLICT,
                )
            lead.owner       = request.user
            lead.assigned_at = now()
            lead.version    += 1
            lead.save()

        return Response(LeadListSerializer(lead).data)


class LeadReleaseView(APIView):
    """PATCH /leads/{id}/release/ — release ownership."""
    permission_classes = [IsSalesperson]

    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        if lead.owner != request.user:
            return Response(
                {'error': 'Solo el vendedor asignado puede liberar este lead.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )
        lead.owner       = None
        lead.assigned_at = None
        lead.save()
        return Response(LeadListSerializer(lead).data)


class LeadUpdateView(APIView):
    """PATCH /leads/{id}/ — partial update."""
    permission_classes = [IsSalespersonOrAdmin]

    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        serializer = LeadWriteSerializer(lead, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()
        return Response(LeadListSerializer(lead).data)


class InteractionListCreateView(APIView):
    """GET/POST /leads/{id}/interactions/"""
    permission_classes = [IsSalespersonOrAdmin]

    def get(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        # Owner or admin can view
        if request.user.role != 'ADMINISTRATOR' and lead.owner != request.user:
            return Response(
                {'error': 'No tienes permiso para ver este lead.', 'code': 'FORBIDDEN'},
                status=status.HTTP_403_FORBIDDEN,
            )
        interactions = lead.interactions.select_related('salesperson').all()
        return Response(InteractionSerializer(interactions, many=True).data)

    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        if lead.owner != request.user:
            return Response(
                {'error': 'Solo el vendedor asignado puede registrar interacciones.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = InteractionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        interaction = serializer.save(lead=lead, salesperson=request.user)

        # Update lead status based on outcome
        new_status = OUTCOME_TO_STATUS.get(interaction.outcome)
        if new_status:
            lead.status = new_status
            lead.save(update_fields=['status', 'updated_at'])

        return Response(InteractionSerializer(interaction).data, status=status.HTTP_201_CREATED)
