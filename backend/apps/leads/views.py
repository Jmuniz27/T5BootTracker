"""Views for leads app."""
import logging
import uuid

from django.core.paginator import Paginator
from django.db import transaction, IntegrityError
from django.db.models import Count, Q
from django.utils.dateparse import parse_date
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
    LeadListSerializer, LeadDetailSerializer, LeadWriteSerializer, LeadAdminWriteSerializer,
    InteractionSerializer, ConvertLeadSerializer, ReturningBootcamperSerializer,
)
from .services import register_interaction

logger = logging.getLogger(__name__)


DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE     = 100
TRUTHY            = {'true', '1', 'yes', 'on'}


class LeadListCreateView(APIView):
    """GET returns paginated my_leads + available_leads. POST creates a new lead."""
    permission_classes = [IsSalespersonOrAdmin]

    def _annotated_qs(self):
        return Lead.objects.annotate(interaction_count=Count('interactions')).order_by('-created_at')

    def _page_params(self, request):
        """Read and clamp ``page`` / ``page_size`` query params."""
        try:
            page_size = int(request.query_params.get('page_size', DEFAULT_PAGE_SIZE))
        except (TypeError, ValueError):
            page_size = DEFAULT_PAGE_SIZE
        if page_size <= 0:
            page_size = DEFAULT_PAGE_SIZE
        page_size = min(page_size, MAX_PAGE_SIZE)

        try:
            page_number = int(request.query_params.get('page', 1))
        except (TypeError, ValueError):
            page_number = 1
        page_number = max(1, page_number)

        return page_number, page_size

    @extend_schema(
        parameters=[
            OpenApiParameter('estado', str, description='Filtrar por estado (NEW, CONTACTED, INTERESTED, ...). Alias: status'),
            OpenApiParameter('source', str, description='Filtrar por fuente (INSTAGRAM, WHATSAPP, ...)'),
            OpenApiParameter('vendedor', str, description='Filtrar por vendedor asignado (UUID). Solo Admin'),
            OpenApiParameter('fecha_desde', str, description='Creados desde (YYYY-MM-DD)'),
            OpenApiParameter('fecha_hasta', str, description='Creados hasta (YYYY-MM-DD)'),
            OpenApiParameter('my_leads', bool, description='true -> solo los leads del usuario autenticado'),
            OpenApiParameter('is_company', bool, description='Filtrar leads de empresa (CR-001)'),
            OpenApiParameter('search', str, description='Buscar por nombre, email o teléfono'),
            OpenApiParameter('page', int, description='Número de página (default 1)'),
            OpenApiParameter('page_size', int, description=f'Tamaño de página (default {DEFAULT_PAGE_SIZE}, máx {MAX_PAGE_SIZE})'),
        ],
        responses={200: inline_serializer('LeadListResponse', fields={
            'my_leads':        LeadListSerializer(many=True),
            'available_leads': LeadListSerializer(many=True),
            'pagination':      inline_serializer('LeadListPagination', fields={
                'page':                        drf_serializers.IntegerField(),
                'page_size':                   drf_serializers.IntegerField(),
                'my_leads_count':              drf_serializers.IntegerField(),
                'available_leads_count':       drf_serializers.IntegerField(),
                'my_leads_total_pages':        drf_serializers.IntegerField(),
                'available_leads_total_pages': drf_serializers.IntegerField(),
            }),
        })},
        summary='Listar leads',
        description='Devuelve my_leads (asignados al usuario) y available_leads (sin asignar), '
                    'paginados de forma independiente. Usa ?page y ?page_size para paginar.',
        tags=['Leads'],
    )
    def get(self, request):
        qs = self._annotated_qs()
        params = request.query_params

        status_filter = params.get('estado') or params.get('status')
        source_filter = params.get('source')
        search        = params.get('search')
        is_company    = params.get('is_company')
        fecha_desde   = parse_date(params.get('fecha_desde', '') or '')
        fecha_hasta   = parse_date(params.get('fecha_hasta', '') or '')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if source_filter:
            qs = qs.filter(source=source_filter)
        if is_company is not None:
            qs = qs.filter(is_company=is_company.lower() in TRUTHY)
        if fecha_desde:
            qs = qs.filter(created_at__date__gte=fecha_desde)
        if fecha_hasta:
            qs = qs.filter(created_at__date__lte=fecha_hasta)
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search)
            )

        vendedor = params.get('vendedor')
        if vendedor and request.user.is_administrator:
            try:
                qs = qs.filter(owner_id=uuid.UUID(str(vendedor)))
            except ValueError:
                pass

        only_mine = (params.get('my_leads', '').lower() in TRUTHY)

        if request.user.is_administrator:
            my_leads_qs        = qs
            available_leads_qs = qs.none()
        elif only_mine:
            my_leads_qs        = qs.filter(owner=request.user)
            available_leads_qs = qs.none()
        else:
            my_leads_qs        = qs.filter(owner=request.user)
            available_leads_qs = qs.filter(owner__isnull=True)

        page_number, page_size = self._page_params(request)

        my_paginator        = Paginator(my_leads_qs, page_size)
        available_paginator = Paginator(available_leads_qs, page_size)
        my_page        = my_paginator.get_page(page_number)
        available_page = available_paginator.get_page(page_number)

        return Response({
            'my_leads':        LeadListSerializer(my_page.object_list, many=True).data,
            'available_leads': LeadListSerializer(available_page.object_list, many=True).data,
            'pagination': {
                'page':                        page_number,
                'page_size':                   page_size,
                'my_leads_count':              my_paginator.count,
                'available_leads_count':       available_paginator.count,
                'my_leads_total_pages':        my_paginator.num_pages,
                'available_leads_total_pages': available_paginator.num_pages,
            },
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


class LeadDetailView(APIView):
    """GET/PATCH/DELETE /leads/{id}/ — detail, partial update, soft delete."""
    permission_classes = [IsSalespersonOrAdmin]

    @extend_schema(
        responses={200: LeadDetailSerializer, 404: OpenApiResponse(description='Lead no encontrado')},
        summary='Detalle de lead',
        description='Devuelve el detalle de un lead. Cualquier vendedor o admin puede verlo.',
        tags=['Leads'],
    )
    def get(self, request, pk):
        lead = get_object_or_404(Lead.objects.annotate(interaction_count=Count('interactions')), pk=pk)
        return Response(LeadDetailSerializer(lead).data)

    @extend_schema(
        request=LeadAdminWriteSerializer,
        responses={200: LeadDetailSerializer, 403: OpenApiResponse(description='No eres el dueño del lead')},
        summary='Actualizar lead',
        description='Actualiza un lead. El vendedor solo puede gestionar los suyos o los disponibles. '
                    'El admin puede gestionar cualquiera y además reasignar el campo `owner` a otro vendedor '
                    '(o dejarlo en null para liberar el lead).',
        tags=['Leads'],
    )
    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        if not request.user.is_administrator and lead.owner is not None and lead.owner != request.user:
            return Response(
                {'error': 'No puedes gestionar un lead asignado a otro vendedor.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer_class = LeadAdminWriteSerializer if request.user.is_administrator else LeadWriteSerializer
        serializer = serializer_class(lead, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()
        return Response(LeadDetailSerializer(lead).data)

    @extend_schema(
        responses={
            204: OpenApiResponse(description='Lead eliminado (soft delete)'),
            403: OpenApiResponse(description='Solo un administrador puede eliminar leads'),
            404: OpenApiResponse(description='Lead no encontrado'),
        },
        summary='Eliminar lead (soft delete)',
        description='Marca el lead como eliminado. Solo Admin.',
        tags=['Leads'],
    )
    def delete(self, request, pk):
        if not request.user.is_administrator:
            return Response(
                {'error': 'Solo un administrador puede eliminar leads.', 'code': 'FORBIDDEN'},
                status=status.HTTP_403_FORBIDDEN,
            )
        lead = get_object_or_404(Lead, pk=pk)
        lead.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        if not request.user.is_administrator and lead.owner != request.user:
            return Response(
                {'error': 'No tienes permiso para ver este lead.', 'code': 'FORBIDDEN'},
                status=status.HTTP_403_FORBIDDEN,
            )
        interactions = lead.interactions.select_related('salesperson').order_by('-created_at')
        return Response(InteractionSerializer(interactions, many=True).data)

    @extend_schema(
        request=InteractionSerializer,
        responses={201: InteractionSerializer},
        summary='Registrar interacción',
        description='Crea una interacción y actualiza estado y last_contact del lead. '
                    'Solo el vendedor asignado puede registrar (admins no, aunque puedan ver).',
        tags=['Leads'],
    )
    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        # Only the assigned salesperson may create — admins can view (GET) but not register.
        if lead.owner != request.user:
            return Response(
                {'error': 'Solo el vendedor asignado puede registrar interacciones.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = InteractionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        interaction = register_interaction(lead, request.user, serializer.validated_data)

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
