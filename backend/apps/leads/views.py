"""Views for leads app."""
import logging
import uuid

from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, F, Q, OuterRef, Subquery
from django.utils.dateparse import parse_date
from django.utils.timezone import now
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter, inline_serializer
from rest_framework import status, serializers as drf_serializers
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.authentication.models import CustomUser
from apps.authentication.services import reject_bootcamper, verify_bootcamper
from apps.programs.models import Program
from .models import Lead, Interaction, LeadAssignmentSetting
from .permissions import COMMERCIAL_ROLES, IsAdministrator, IsCommercial, IsCommercialOrAdmin
from .serializers import (
    LeadListSerializer, LeadDetailSerializer, LeadWriteSerializer, LeadAdminWriteSerializer,
    InteractionSerializer, ConvertLeadSerializer, ReturningBootcamperSerializer,
    LeadAssignmentSettingSerializer, VerificationRejectSerializer,
)
from .services import (
    register_interaction, convert_lead_to_bootcamper,
    get_self_assignment_enabled, set_self_assignment_enabled,
    find_duplicate_lead, reassign_lead_by_admin, resend_invitation,
)

logger = logging.getLogger(__name__)

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE     = 100
TRUTHY            = {'true', '1', 'yes', 'on'}


class LeadListCreateView(APIView):
    """GET returns paginated my_leads + available_leads. POST creates a new lead."""
    permission_classes = [IsCommercialOrAdmin]

    def _annotated_qs(self):
        # Los eventos de sistema (asignación/reasignación) no son interacciones
        # de venta: no cuentan ni pesan en la última interacción.
        real = ~Q(interactions__interaction_type=Interaction.InteractionType.SYSTEM)
        latest = (
            Interaction.objects
            .filter(lead=OuterRef('pk'))
            .exclude(interaction_type=Interaction.InteractionType.SYSTEM)
            .order_by('-created_at')
        )
        return Lead.objects.select_related('bootcamper').annotate(
            interaction_count=Count('interactions', filter=real),
            last_outcome=Subquery(latest.values('outcome')[:1]),
            last_interaction_at=Subquery(latest.values('created_at')[:1]),
        ).order_by(F('last_interaction_at').desc(nulls_last=True), 'name')

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
            'converted_leads': LeadListSerializer(many=True),
            'all_leads':        LeadListSerializer(many=True, required=False),
            'assigned_leads':   LeadListSerializer(many=True, required=False),
            'unassigned_leads': LeadListSerializer(many=True, required=False),
            'pagination':      inline_serializer('LeadListPagination', fields={
                'page':                        drf_serializers.IntegerField(),
                'page_size':                   drf_serializers.IntegerField(),
                'my_leads_count':              drf_serializers.IntegerField(),
                'available_leads_count':       drf_serializers.IntegerField(),
                'converted_leads_count':       drf_serializers.IntegerField(),
                'my_leads_total_pages':        drf_serializers.IntegerField(),
                'available_leads_total_pages': drf_serializers.IntegerField(),
                'converted_leads_total_pages': drf_serializers.IntegerField(),
                'all_leads_count':              drf_serializers.IntegerField(required=False),
                'assigned_leads_count':         drf_serializers.IntegerField(required=False),
                'unassigned_leads_count':       drf_serializers.IntegerField(required=False),
                'all_leads_total_pages':        drf_serializers.IntegerField(required=False),
                'assigned_leads_total_pages':   drf_serializers.IntegerField(required=False),
                'unassigned_leads_total_pages': drf_serializers.IntegerField(required=False),
            }),
        })},
        summary='Listar leads',
        description=(
            'Vendedor: devuelve my_leads (asignados al usuario), available_leads (sin asignar) y '
            'converted_leads (todos los convertidos, visibles para cualquier vendedor; '
            'owner_name indica quién lo convirtió), paginados de forma independiente. '
            'Administrador: además devuelve all_leads (todos), assigned_leads (con vendedor) y '
            'unassigned_leads (sin asignar), cada uno paginado de forma independiente — '
            'my_leads/available_leads se mantienen para no romper clientes existentes (mobile), '
            'pero para admin no reflejan una partición real.'
        ),
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

        # converted_leads es visible para cualquier vendedor y no depende del
        # filtro de estado (ese aplica solo a my/available). owner_name señala
        # quién convirtió el lead.
        converted_leads_qs = qs.filter(status=Lead.Status.CONVERTED)

        if status_filter:
            qs = qs.filter(status=status_filter)

        only_mine = (params.get('my_leads', '').lower() in TRUTHY)

        if request.user.is_administrator:
            # CB-223 / HST-025: my_leads/available_leads se mantienen tal cual
            # (contrato existente, no romper mobile), pero para admin no son
            # una partición real — se agregan all_leads/assigned_leads/
            # unassigned_leads con la vista real que el admin necesita.
            my_leads_qs        = qs
            available_leads_qs = qs.none()
        elif only_mine:
            # Los convertidos viven en converted_leads, no en "Mis leads".
            my_leads_qs        = qs.filter(owner=request.user).exclude(status=Lead.Status.CONVERTED)
            available_leads_qs = qs.none()
        else:
            my_leads_qs        = qs.filter(owner=request.user).exclude(status=Lead.Status.CONVERTED)
            available_leads_qs = qs.filter(owner__isnull=True)

        page_number, page_size = self._page_params(request)

        my_paginator        = Paginator(my_leads_qs, page_size)
        available_paginator = Paginator(available_leads_qs, page_size)
        converted_paginator = Paginator(converted_leads_qs, page_size)
        my_page        = my_paginator.get_page(page_number)
        available_page = available_paginator.get_page(page_number)
        converted_page = converted_paginator.get_page(page_number)

        data = {
            'my_leads':        LeadListSerializer(my_page.object_list, many=True).data,
            'available_leads': LeadListSerializer(available_page.object_list, many=True).data,
            'converted_leads': LeadListSerializer(converted_page.object_list, many=True).data,
            'pagination': {
                'page':                        page_number,
                'page_size':                   page_size,
                'my_leads_count':              my_paginator.count,
                'available_leads_count':       available_paginator.count,
                'converted_leads_count':       converted_paginator.count,
                'my_leads_total_pages':        my_paginator.num_pages,
                'available_leads_total_pages': available_paginator.num_pages,
                'converted_leads_total_pages': converted_paginator.num_pages,
            },
        }

        if request.user.is_administrator:
            all_leads_qs        = qs
            # Los convertidos viven en converted_leads; salen de "Asignados"
            # aunque conserven dueño, para no contarlos dos veces.
            assigned_leads_qs   = qs.filter(owner__isnull=False).exclude(status=Lead.Status.CONVERTED)
            unassigned_leads_qs = qs.filter(owner__isnull=True)

            all_paginator        = Paginator(all_leads_qs, page_size)
            assigned_paginator   = Paginator(assigned_leads_qs, page_size)
            unassigned_paginator = Paginator(unassigned_leads_qs, page_size)
            all_page        = all_paginator.get_page(page_number)
            assigned_page   = assigned_paginator.get_page(page_number)
            unassigned_page = unassigned_paginator.get_page(page_number)

            data['all_leads']        = LeadListSerializer(all_page.object_list, many=True).data
            data['assigned_leads']   = LeadListSerializer(assigned_page.object_list, many=True).data
            data['unassigned_leads'] = LeadListSerializer(unassigned_page.object_list, many=True).data
            data['pagination'].update({
                'all_leads_count':              all_paginator.count,
                'assigned_leads_count':         assigned_paginator.count,
                'unassigned_leads_count':       unassigned_paginator.count,
                'all_leads_total_pages':        all_paginator.num_pages,
                'assigned_leads_total_pages':   assigned_paginator.num_pages,
                'unassigned_leads_total_pages': unassigned_paginator.num_pages,
            })

        return Response(data)

    @extend_schema(
        request=LeadWriteSerializer,
        responses={
            201: LeadListSerializer,
            409: OpenApiResponse(description='Posible lead duplicado (phone/email ya registrados)'),
        },
        summary='Crear lead',
        tags=['Leads'],
    )
    def post(self, request):
        serializer = LeadWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        confirm_duplicate = serializer.validated_data.get('confirm_duplicate', False)
        if not confirm_duplicate:
            duplicate = find_duplicate_lead(
                serializer.validated_data['phone'],
                serializer.validated_data.get('email'),
            )
            if duplicate is not None:
                return Response(
                    {
                        'error': 'Ya existe un lead con estos datos.',
                        'code': 'POSSIBLE_DUPLICATE',
                        'duplicate': {
                            'id': str(duplicate.id),
                            'name': duplicate.name,
                            'phone': duplicate.phone,
                            'email': duplicate.email,
                        },
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        lead = serializer.save()
        return Response(LeadListSerializer(lead).data, status=status.HTTP_201_CREATED)


class LeadAssignView(APIView):
    """PATCH /leads/{id}/assign/ — self-assignment with optimistic locking."""
    permission_classes = [IsCommercial]

    @extend_schema(
        responses={
            200: LeadListSerializer,
            403: OpenApiResponse(description='Auto-asignación deshabilitada por el Administrador'),
            409: OpenApiResponse(description='Lead ya asignado'),
        },
        summary='Asignar lead',
        tags=['Leads'],
    )
    def patch(self, request, pk):
        if not get_self_assignment_enabled():
            return Response(
                {
                    'error': 'La asignación de leads la realiza el Administrador.',
                    'code': 'SELF_ASSIGNMENT_DISABLED',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

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
            lead.released_at = None  # CR-006: nueva tenencia, se reinicia el reloj
            lead.version    += 1
            lead.save()

        return Response(LeadListSerializer(lead).data)


class LeadReleaseView(APIView):
    """PATCH /leads/{id}/release/ — release ownership."""
    permission_classes = [IsCommercial]

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
        lead.released_at = now()  # CR-006: cierra el período de retención
        lead.assigned_at = None
        lead.save()
        return Response(LeadListSerializer(lead).data)


class LeadAdminReassignView(APIView):
    """PATCH /leads/{id}/admin-reassign/ — Admin liberación/reasignación forzada (CR-005)."""
    permission_classes = [IsAdministrator]

    @extend_schema(
        request=inline_serializer('AdminReassignRequest', fields={
            'owner_id': drf_serializers.UUIDField(required=False, allow_null=True),
        }),
        responses={
            200: LeadDetailSerializer,
            400: OpenApiResponse(description='owner_id no corresponde a un Vendedor existente'),
            404: OpenApiResponse(description='Lead no encontrado'),
        },
        summary='Liberar o reasignar un lead (Admin)',
        description=(
            'El Administrador puede liberar cualquier lead (sin owner_id, vuelve al pool) o '
            'reasignarlo directamente a otro Vendedor (con owner_id), sin importar quién lo '
            'tenía asignado. Queda registrado quién ejecutó la acción, cuándo, y quién era el '
            'vendedor anterior, como una Interaction de tipo SYSTEM.'
        ),
        tags=['Leads'],
    )
    def patch(self, request, pk):
        new_owner = None
        owner_id = request.data.get('owner_id')
        if owner_id:
            try:
                # Finanzas también trabaja leads, así que puede recibir uno.
                new_owner = CustomUser.objects.get(
                    pk=uuid.UUID(str(owner_id)), role__in=COMMERCIAL_ROLES,
                )
            except (CustomUser.DoesNotExist, ValueError):
                return Response(
                    {'error': 'owner_id debe ser un Vendedor o Finanzas existente.', 'code': 'INVALID_OWNER'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            lead = reassign_lead_by_admin(pk, request.user, new_owner)
        except Lead.DoesNotExist:
            return Response(
                {'error': 'Lead no encontrado.', 'code': 'LEAD_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(LeadDetailSerializer(lead).data)


class LeadAssignmentSettingView(APIView):
    """GET/PATCH /leads/settings/self-assignment/ — global toggle for self-assignment (CR-004)."""
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAdministrator()]
        return super().get_permissions()

    @extend_schema(
        responses={200: LeadAssignmentSettingSerializer},
        summary='Consultar estado de auto-asignación',
        tags=['Leads'],
    )
    def get(self, request):
        setting = LeadAssignmentSetting.get_solo()
        return Response(LeadAssignmentSettingSerializer(setting).data)

    @extend_schema(
        request=LeadAssignmentSettingSerializer,
        responses={200: LeadAssignmentSettingSerializer, 403: OpenApiResponse(description='Solo el Administrador puede cambiar este control')},
        summary='Habilitar/deshabilitar auto-asignación',
        tags=['Leads'],
    )
    def patch(self, request):
        serializer = LeadAssignmentSettingSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if 'self_assign_enabled' not in serializer.validated_data:
            return Response(
                {'error': 'self_assign_enabled es requerido.', 'code': 'MISSING_FIELD'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        setting = set_self_assignment_enabled(serializer.validated_data['self_assign_enabled'], request.user)
        return Response(LeadAssignmentSettingSerializer(setting).data)


class LeadDetailView(APIView):
    """GET/PATCH/DELETE /leads/{id}/ — detail, partial update, soft delete."""
    permission_classes = [IsCommercialOrAdmin]

    @extend_schema(
        responses={
            200: LeadDetailSerializer,
            403: OpenApiResponse(description='No tienes permiso para ver este lead'),
            404: OpenApiResponse(description='Lead no encontrado'),
        },
        summary='Detalle de lead',
        tags=['Leads'],
    )
    def get(self, request, pk):
        lead = get_object_or_404(
            Lead.objects.select_related('bootcamper').annotate(
                interaction_count=Count(
                    'interactions',
                    filter=~Q(interactions__interaction_type=Interaction.InteractionType.SYSTEM),
                ),
            ),
            pk=pk,
        )
        if not request.user.is_administrator and lead.owner is not None and lead.owner != request.user:
            return Response(
                {'error': 'No tienes permiso para ver este lead.', 'code': 'FORBIDDEN'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(LeadDetailSerializer(lead).data)

    @extend_schema(
        request=LeadWriteSerializer,
        responses={200: LeadDetailSerializer, 403: OpenApiResponse(description='No eres el dueño del lead')},
        summary='Actualizar lead',
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
        serializer = serializer_class(lead, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        lead = serializer.save()
        return Response(LeadDetailSerializer(lead).data)

    @extend_schema(
        responses={
            204: OpenApiResponse(description='Lead eliminado (soft delete)'),
        },
        summary='Eliminar lead (soft delete)',
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
    permission_classes = [IsCommercialOrAdmin]

    @extend_schema(
        responses={200: InteractionSerializer(many=True)},
        summary='Listar interacciones',
        tags=['Leads'],
    )
    def get(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        if not request.user.is_administrator and lead.owner != request.user:
            return Response(
                {'error': 'No tienes permiso para ver este lead.', 'code': 'FORBIDDEN'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Los eventos de sistema (asignación/reasignación) son auditoría, no
        # interacciones de venta: no se muestran en el historial.
        interactions = (
            lead.interactions
            .exclude(interaction_type=Interaction.InteractionType.SYSTEM)
            .select_related('salesperson')
            .order_by('-created_at')
        )
        return Response(InteractionSerializer(interactions, many=True).data)

    @extend_schema(
        request=InteractionSerializer,
        responses={201: InteractionSerializer},
        summary='Registrar interacción',
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
        interaction = register_interaction(lead, request.user, serializer.validated_data)

        return Response(InteractionSerializer(interaction).data, status=status.HTTP_201_CREATED)


class InteractionDetailView(APIView):
    """PATCH /leads/{pk}/interactions/{interaction_pk}/ — edit an existing interaction."""
    permission_classes = [IsCommercialOrAdmin]

    @extend_schema(
        request=InteractionSerializer,
        responses={200: InteractionSerializer},
        summary='Editar interacción',
        tags=['Leads'],
    )
    def patch(self, request, pk, interaction_pk):
        lead = get_object_or_404(Lead, pk=pk)
        interaction = get_object_or_404(Interaction, pk=interaction_pk, lead=lead)
        if not request.user.is_administrator and interaction.salesperson != request.user:
            return Response(
                {'error': 'Solo el vendedor que registró esta interacción puede editarla.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = InteractionSerializer(interaction, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(InteractionSerializer(interaction).data)


class ConvertLeadView(APIView):
    """POST /api/leads/{id}/convert/ — convert a lead to a bootcamper."""
    permission_classes = [IsCommercial]

    @extend_schema(
        request=ConvertLeadSerializer,
        responses={
            201: inline_serializer('ConversionResponse', fields={
                'bootcamper_id':        drf_serializers.UUIDField(),
                'email':                drf_serializers.EmailField(),
                'invitation_link':      drf_serializers.CharField(allow_null=True),
                'is_returning':         drf_serializers.BooleanField(),
                'lead_status':          drf_serializers.CharField(),
                'discount_percentage':  drf_serializers.CharField(),
                'agreed_price':         drf_serializers.CharField(),
                'cohort_id':            drf_serializers.UUIDField(allow_null=True),
                'cohort_number':        drf_serializers.IntegerField(allow_null=True),
            }),
            400: OpenApiResponse(description='Estado inválido o cédula/RUC inválido'),
            403: OpenApiResponse(description='No eres el dueño del lead'),
            404: OpenApiResponse(description='Lead o programa no encontrado'),
            409: OpenApiResponse(description='Email ya asociado a otro rol, cédula ya registrada o bootcamper ya inscrito en el programa'),
        },
        summary='Convertir lead a bootcamper',
        description=(
            'Valida la identificación (cédula o RUC), crea o reutiliza un usuario BOOTCAMPER, '
            'crea la inscripción (Enrollment), marca el lead como CONVERTED '
            'y dispara notificación a coordinadores. Requiere que el Lead sea QUALIFIED. '
            'Si es una cuenta nueva, la respuesta incluye invitation_link para que active su '
            'contraseña; un bootcamper recurrente (is_returning=True) no recibe invitación.'
        ),
        tags=['Leads'],
    )
    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        if not request.user.is_administrator and lead.owner != request.user:
            return Response(
                {'error': 'Solo el vendedor asignado puede convertir este lead.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ConvertLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result_data = convert_lead_to_bootcamper(lead, serializer.validated_data)

        return Response(result_data, status=status.HTTP_201_CREATED)


class ResendInvitationView(APIView):
    """POST /api/leads/{id}/resend-invitation/ — reissue the onboarding link (#255)."""
    permission_classes = [IsCommercial]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'invitation'

    @extend_schema(
        responses={
            200: inline_serializer('ResendInvitationResponse', fields={
                'invitation_link': drf_serializers.CharField(),
            }),
            400: OpenApiResponse(description='El lead no fue convertido, o la cuenta ya fue activada'),
            403: OpenApiResponse(description='No eres el dueño del lead'),
            404: OpenApiResponse(description='Lead no encontrado'),
            429: OpenApiResponse(description='Demasiados reenvíos'),
        },
        summary='Reenviar invitación de onboarding',
        description=(
            'Genera un token nuevo e invalida el anterior (deja de servir para activar la cuenta), '
            'reenvía el email al bootcamper y devuelve el link nuevo. Sólo mientras la cuenta siga '
            'en INVITED — si ya se activó, se rechaza.'
        ),
        tags=['Leads'],
    )
    def post(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        if not request.user.is_administrator and lead.owner != request.user:
            return Response(
                {'error': 'Solo el vendedor asignado puede reenviar esta invitación.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )

        result_data = resend_invitation(lead)
        return Response(result_data, status=status.HTTP_200_OK)


class VerifyBootcamperView(APIView):
    """PATCH /api/leads/{id}/verify-bootcamper/ — mark the resulting bootcamper as verified (#259)."""
    permission_classes = [IsCommercialOrAdmin]

    @extend_schema(
        responses={
            200: LeadDetailSerializer,
            400: OpenApiResponse(description='El lead no fue convertido, o el bootcamper no está pendiente de verificación'),
            403: OpenApiResponse(description='No eres el dueño del lead'),
            404: OpenApiResponse(description='Lead no encontrado'),
        },
        summary='Verificar datos del bootcamper',
        description=(
            'El vendedor dueño del lead (o un administrador) confirma que los datos que el '
            'bootcamper completó en el onboarding son correctos. Sólo válido si el bootcamper '
            'está en PENDING_VERIFICATION.'
        ),
        tags=['Leads'],
    )
    def patch(self, request, pk):
        lead = get_object_or_404(Lead.objects.select_related('bootcamper'), pk=pk)
        if not request.user.is_administrator and lead.owner != request.user:
            return Response(
                {'error': 'Solo el vendedor asignado puede verificar este bootcamper.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if lead.bootcamper is None:
            return Response(
                {'error': 'Este lead todavía no fue convertido a bootcamper.', 'code': 'NOT_CONVERTED'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verify_bootcamper(lead.bootcamper, request.user)
        lead = Lead.objects.select_related('bootcamper').annotate(
            interaction_count=Count('interactions'),
        ).get(pk=lead.pk)
        return Response(LeadDetailSerializer(lead).data)


class RejectBootcamperView(APIView):
    """PATCH /api/leads/{id}/reject-bootcamper/ — señalar que hay datos que corregir (#309)."""
    permission_classes = [IsCommercialOrAdmin]

    @extend_schema(
        request=VerificationRejectSerializer,
        responses={
            200: LeadDetailSerializer,
            400: OpenApiResponse(description='Motivo vacío, lead no convertido, o el bootcamper no está en un estado revisable'),
            403: OpenApiResponse(description='No eres el dueño del lead'),
            404: OpenApiResponse(description='Lead no encontrado'),
        },
        summary='Rechazar datos del bootcamper',
        description=(
            'El vendedor dueño del lead (o un administrador) marca que los datos del onboarding '
            'tienen algo que corregir, indicando qué. Se le notifica al bootcamper por correo. '
            'El rechazo no es terminal: una vez corregidos los datos se puede verificar.'
        ),
        tags=['Leads'],
    )
    def patch(self, request, pk):
        lead = get_object_or_404(Lead.objects.select_related('bootcamper'), pk=pk)
        if not request.user.is_administrator and lead.owner != request.user:
            return Response(
                {'error': 'Solo el vendedor asignado puede rechazar los datos de este bootcamper.', 'code': 'NOT_OWNER'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if lead.bootcamper is None:
            return Response(
                {'error': 'Este lead todavía no fue convertido a bootcamper.', 'code': 'NOT_CONVERTED'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = VerificationRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reject_bootcamper(lead.bootcamper, request.user, serializer.validated_data['reason'])
        lead = Lead.objects.select_related('bootcamper').annotate(
            interaction_count=Count('interactions'),
        ).get(pk=lead.pk)
        return Response(LeadDetailSerializer(lead).data)


class ReturningBootcamperView(APIView):
    """POST /api/leads/returning-bootcamper/ — create a lead for an existing bootcamper."""
    permission_classes = [IsCommercial]

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
            status__in=[Lead.Status.NEW, Lead.Status.INTERESTED, Lead.Status.QUALIFIED],
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
                outcome=Interaction.Outcome.CALL_AGAIN,  # <-- ACTUALIZADO AQUÍ
                notes=notes,
            )

        return Response(LeadListSerializer(lead).data, status=status.HTTP_201_CREATED)
