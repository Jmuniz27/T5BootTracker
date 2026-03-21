"""Views for leads app."""
import logging

from django.db import transaction, IntegrityError
from django.db.models import Count, Q
from django.utils.timezone import now
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter, inline_serializer
from rest_framework import status, serializers as drf_serializers
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import CustomUser
from apps.programs.models import Program
from .models import Lead, Interaction
from .permissions import IsSalesperson, IsSalespersonOrAdmin
from .serializers import (
    LeadListSerializer, LeadWriteSerializer, InteractionSerializer,
    ConvertLeadSerializer, ReturningBootcamperSerializer,
)

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

    @extend_schema(
        parameters=[
            OpenApiParameter('status', str, description='Filtrar por estado (NEW, CONTACTED, INTERESTED, ...)'),
            OpenApiParameter('source', str, description='Filtrar por fuente (INSTAGRAM, WHATSAPP, ...)'),
            OpenApiParameter('search', str, description='Buscar por nombre, email o teléfono'),
        ],
        responses={200: inline_serializer('LeadListResponse', fields={
            'my_leads':        LeadListSerializer(many=True),
            'available_leads': LeadListSerializer(many=True),
        })},
        summary='Listar leads',
        description='Devuelve my_leads (asignados al usuario) y available_leads (sin asignar).',
        tags=['Leads'],
    )
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

    @extend_schema(
        request=LeadWriteSerializer,
        responses={201: LeadListSerializer},
        summary='Crear lead',
        tags=['Leads'],
    )
    def post(self, request):
        serializer = LeadWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()
        return Response(LeadListSerializer(lead).data, status=status.HTTP_201_CREATED)


class LeadAssignView(APIView):
    """PATCH /leads/{id}/assign/ — self-assignment with optimistic locking."""
    permission_classes = [IsSalesperson]

    @extend_schema(
        responses={200: LeadListSerializer, 409: OpenApiResponse(description='Lead ya asignado')},
        summary='Asignar lead',
        description='El vendedor autenticado se auto-asigna el lead. 409 si ya tiene dueño.',
        tags=['Leads'],
    )
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

    @extend_schema(
        responses={200: LeadListSerializer, 403: OpenApiResponse(description='No eres el dueño del lead')},
        summary='Liberar lead',
        tags=['Leads'],
    )
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

    @extend_schema(
        request=LeadWriteSerializer,
        responses={200: LeadListSerializer},
        summary='Actualizar lead',
        tags=['Leads'],
    )
    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        serializer = LeadWriteSerializer(lead, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()
        return Response(LeadListSerializer(lead).data)


class InteractionListCreateView(APIView):
    """GET/POST /leads/{id}/interactions/"""
    permission_classes = [IsSalespersonOrAdmin]

    @extend_schema(
        responses={200: InteractionSerializer(many=True)},
        summary='Listar interacciones',
        tags=['Leads'],
    )
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

    @extend_schema(
        request=InteractionSerializer,
        responses={201: InteractionSerializer},
        summary='Registrar interacción',
        description='Crea una interacción y actualiza el estado del lead según el outcome.',
        tags=['Leads'],
    )
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


class ConvertLeadView(APIView):
    """POST /api/leads/{id}/convert/ — convert a lead to a bootcamper."""
    permission_classes = [IsSalesperson]

    @extend_schema(
        request=ConvertLeadSerializer,
        responses={
            201: inline_serializer('ConversionResponse', fields={
                'bootcamper_id':      drf_serializers.UUIDField(),
                'email':              drf_serializers.EmailField(),
                'temporary_password': drf_serializers.CharField(allow_null=True),
                'is_returning':       drf_serializers.BooleanField(),
                'lead_status':        drf_serializers.CharField(),
            }),
            400: OpenApiResponse(description='Estado inválido o cédula inválida'),
            404: OpenApiResponse(description='Lead o programa no encontrado'),
            409: OpenApiResponse(description='Email ya asociado a otro rol'),
        },
        summary='Convertir lead a bootcamper',
        description=(
            'Valida la cédula ecuatoriana, crea o reutiliza un usuario BOOTCAMPER, '
            'marca el lead como CONVERTED y dispara notificación a coordinadores.'
        ),
        tags=['Leads'],
    )
    def post(self, request, pk):
        from apps.authentication.validators import validate_cedula_ecuatoriana
        from apps.notifications.tasks import send_conversion_notification

        serializer = ConvertLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        temporary_password = None
        is_returning = False
        bootcamper = None

        with transaction.atomic():
            lead = get_object_or_404(Lead.objects.select_for_update(), pk=pk)

            if lead.status != Lead.Status.INTERESTED:
                return Response(
                    {'error': 'Solo se puede convertir un lead con estado INTERESTED.', 'code': 'INVALID_STATUS'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not validate_cedula_ecuatoriana(data['cedula']):
                return Response(
                    {'error': 'La cédula ingresada no es válida.', 'code': 'INVALID_CEDULA'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                program = Program.objects.get(pk=data['program_id'])
            except Program.DoesNotExist:
                return Response(
                    {'error': 'Programa no encontrado.', 'code': 'PROGRAM_NOT_FOUND'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            email = data.get('email') or lead.email
            phone = data.get('phone') or lead.phone

            if email:
                try:
                    existing = CustomUser.objects.get(email=email)
                    if existing.role != CustomUser.Role.BOOTCAMPER:
                        return Response(
                            {'error': 'El email ya está asociado a otro rol.', 'code': 'EMAIL_CONFLICT'},
                            status=status.HTTP_409_CONFLICT,
                        )
                    bootcamper = existing
                    is_returning = True
                except CustomUser.DoesNotExist:
                    pass

            if bootcamper is None:
                import secrets
                temporary_password = secrets.token_urlsafe(12)
                try:
                    bootcamper = CustomUser.objects.create_user(
                        email=email or f'bootcamper_{data["cedula"]}@placeholder.com',
                        password=temporary_password,
                        first_name=lead.name.split()[0] if lead.name else 'Bootcamper',
                        last_name=' '.join(lead.name.split()[1:]) if len(lead.name.split()) > 1 else 'N/A',
                        role=CustomUser.Role.BOOTCAMPER,
                        cedula=data['cedula'],
                        phone=phone,
                    )
                except IntegrityError:
                    return Response(
                        {'error': 'Esta cédula ya está registrada en el sistema.', 'code': 'CEDULA_ALREADY_EXISTS'},
                        status=status.HTTP_409_CONFLICT,
                    )

            lead.status  = Lead.Status.CONVERTED
            lead.program = program
            lead.save()

        send_conversion_notification.delay(str(lead.id), str(bootcamper.id))

        return Response({
            'bootcamper_id':       str(bootcamper.id),
            'email':               bootcamper.email,
            'temporary_password':  temporary_password,
            'is_returning':        is_returning,
            'lead_status':         lead.status,
        }, status=status.HTTP_201_CREATED)


class ReturningBootcamperView(APIView):
    """POST /api/leads/returning-bootcamper/ — create a lead for an existing bootcamper."""
    permission_classes = [IsSalesperson]

    @extend_schema(
        request=ReturningBootcamperSerializer,
        responses={
            201: LeadListSerializer,
            404: OpenApiResponse(description='Bootcamper o programa no encontrado'),
            409: OpenApiResponse(description='Ya tiene un lead activo en este programa'),
        },
        summary='Crear lead para bootcamper recurrente',
        description='Crea un nuevo lead para un bootcamper existente que se re-inscribe en otro programa.',
        tags=['Leads'],
    )
    def post(self, request):
        serializer = ReturningBootcamperSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            bootcamper = CustomUser.objects.get(
                email=data['bootcamper_email'],
                role=CustomUser.Role.BOOTCAMPER,
            )
        except CustomUser.DoesNotExist:
            return Response(
                {'error': 'Bootcamper no encontrado.', 'code': 'BOOTCAMPER_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            program = Program.objects.get(pk=data['program_id'])
        except Program.DoesNotExist:
            return Response(
                {'error': 'Programa no encontrado.', 'code': 'PROGRAM_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if Lead.objects.filter(
            program=program,
            status__in=[Lead.Status.NEW, Lead.Status.CONTACTED, Lead.Status.INTERESTED],
            email=bootcamper.email,
        ).exists():
            return Response(
                {'error': 'El bootcamper ya tiene un lead activo en este programa.', 'code': 'ACTIVE_LEAD_EXISTS'},
                status=status.HTTP_409_CONFLICT,
            )

        lead = Lead.objects.create(
            name=bootcamper.get_full_name(),
            phone=bootcamper.phone or '',
            email=bootcamper.email,
            source=data.get('source', Lead.Source.MANUAL),
            status=Lead.Status.NEW,
            program=program,
            owner=request.user,
            assigned_at=now(),
        )

        notes = data.get('notes', '')
        if notes:
            Interaction.objects.create(
                lead=lead,
                salesperson=request.user,
                interaction_type=Interaction.InteractionType.NOTE,
                outcome=Interaction.Outcome.CALLBACK,
                notes=notes,
            )

        return Response(LeadListSerializer(lead).data, status=status.HTTP_201_CREATED)
