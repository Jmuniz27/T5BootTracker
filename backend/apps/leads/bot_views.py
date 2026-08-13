"""Views for the WhatsApp bot integration surface (#279).

Las tres devuelven **200 incluso cuando no hay resultado**, en vez de 404/409. El
flujo conversacional del bot lleva su salida de éxito y la de error al mismo
sucesor, así que un no-2xx legítimo ("este teléfono no existe") sería
indistinguible de una caída de la API y se perdería el caso. El resultado va
dentro del cuerpo, donde el flujo sí puede ramificar.

`authentication_classes = []` es deliberado: la credencial es la cabecera que
comprueba `IsJelouBot`, y dejar la lista vacía evita que `JWTAuthentication`
rechace la petición antes de llegar al permiso.
"""
import logging

from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .bot_permissions import IsJelouBot
from .bot_serializers import BotLeadCreateSerializer, BotLeadUpdateSerializer
from .serializers import LeadListSerializer
from .services import bot_create_lead, bot_lookup_payload, bot_update_lead_by_phone

logger = logging.getLogger(__name__)

LOOKUP_RESPONSE = inline_serializer('BotLeadLookupResponse', fields={
    'exists':  drf_serializers.BooleanField(),
    'status':  drf_serializers.CharField(allow_blank=True),
    'owner':   drf_serializers.CharField(allow_blank=True),
    'lead_id': drf_serializers.CharField(allow_blank=True),
    'program': drf_serializers.CharField(allow_blank=True),
})


class BotLeadLookupView(APIView):
    """GET /api/leads/bot/lookup/?phone= — dedup check before starting the intake."""
    permission_classes = [IsJelouBot]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'bot'

    @extend_schema(
        parameters=[OpenApiParameter(
            'phone', str, required=True,
            description='Teléfono en cualquier formato; se cruza por número de abonado.',
        )],
        responses={200: LOOKUP_RESPONSE},
        summary='Consultar si un teléfono ya es lead (bot)',
        description=(
            'Devuelve 200 siempre, también cuando no hay lead. `owner` viene en cadena '
            'vacía —nunca nula— si el lead no tiene vendedor asignado.'
        ),
        tags=['Leads · Bot'],
    )
    def get(self, request):
        return Response(bot_lookup_payload(request.query_params.get('phone')))


class BotLeadCreateView(APIView):
    """POST /api/leads/bot/ — register the lead the conversation just captured."""
    permission_classes = [IsJelouBot]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'bot'

    @extend_schema(
        request=BotLeadCreateSerializer,
        responses={
            201: inline_serializer('BotLeadCreated', fields={
                'created': drf_serializers.BooleanField(),
                'lead_id': drf_serializers.CharField(),
                'lead':    LeadListSerializer(),
            }),
            200: inline_serializer('BotLeadAlreadyExists', fields={
                'created': drf_serializers.BooleanField(),
                'lead_id': drf_serializers.CharField(),
                'lead':    LeadListSerializer(),
            }),
        },
        summary='Registrar un lead desde el bot',
        description=(
            'Crea el lead con fuente WHATSAPP, estado NEW y sin vendedor asignado (entra al '
            'pool disponible). Si el teléfono ya corresponde a un lead, responde 200 con ese '
            'mismo lead y `created: false`, sin crear un duplicado.'
        ),
        tags=['Leads · Bot'],
    )
    def post(self, request):
        serializer = BotLeadCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        lead, created = bot_create_lead(serializer.validated_data)
        return Response(
            {
                'created': created,
                'lead_id': str(lead.id),
                'lead': LeadListSerializer(lead).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class BotLeadUpdateByPhoneView(APIView):
    """PATCH /api/leads/bot/by-phone/<phone>/ — complete the lead mid-conversation."""
    permission_classes = [IsJelouBot]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'bot'

    @extend_schema(
        request=BotLeadUpdateSerializer,
        responses={200: inline_serializer('BotLeadUpdated', fields={
            'updated': drf_serializers.BooleanField(),
            'lead_id': drf_serializers.CharField(allow_blank=True),
            'lead':    LeadListSerializer(allow_null=True),
        })},
        summary='Actualizar un lead por teléfono (bot)',
        description=(
            'El bot no conoce el UUID del lead, sólo el teléfono. Sin coincidencia responde '
            '200 con `updated: false` en vez de 404.'
        ),
        tags=['Leads · Bot'],
    )
    def patch(self, request, phone):
        serializer = BotLeadUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        lead = bot_update_lead_by_phone(phone, serializer.validated_data)
        if lead is None:
            logger.info('El bot intentó actualizar un teléfono sin lead asociado')
            return Response({'updated': False, 'lead_id': '', 'lead': None})

        return Response({
            'updated': True,
            'lead_id': str(lead.id),
            'lead': LeadListSerializer(lead).data,
        })
