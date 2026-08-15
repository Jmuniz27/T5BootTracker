"""View for the WhatsApp bot integration surface of the programs app (CB-84).

El bot ofrecía tres programas escritos a mano en el flujo de Jelou, que dejaron
de coincidir con el catálogo en cuanto cambió la oferta: el lead llegaba con el
texto en `program_interest` pero sin la FK `program` vinculada. Con esta vista la
lista que ve la persona en WhatsApp **es** el catálogo del CRM, y agregar un
programa desde la página no exige tocar el flujo.

Se reusa `IsJelouBot` de `apps.leads.bot_permissions`: el bot es una sola
integración con un solo secreto, y tener dos clases de permiso equivalentes es
la forma de que un día sólo una de las dos se endurezca.

`authentication_classes = []` y el 200 con lista vacía siguen el mismo criterio
que `apps.leads.bot_views`; el porqué está documentado allí.
"""
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.leads.bot_permissions import IsJelouBot

from .services import bot_program_catalog

CATALOG_RESPONSE = inline_serializer(
    'BotProgramCatalogItem',
    fields={
        'id':          drf_serializers.CharField(),
        'name':        drf_serializers.CharField(),
        'label':       drf_serializers.CharField(),
        'description': drf_serializers.CharField(),
    },
    many=True,
)


class BotProgramCatalogView(APIView):
    """GET /api/programs/bot/ — active programs, ready to render as a WhatsApp list."""
    permission_classes = [IsJelouBot]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'bot'

    @extend_schema(
        responses={200: CATALOG_RESPONSE},
        summary='Catálogo de programas para el bot',
        description=(
            'Programas activos, del más reciente al más antiguo, como máximo 10 — el '
            'tope de filas de una lista de WhatsApp. `label` es el nombre recortado por '
            'palabra a 24 caracteres y `description` lleva el nombre completo cuando '
            'hubo recorte, o la fecha de inicio cuando no. Sin programas activos '
            'responde 200 con lista vacía, no 404.'
        ),
        tags=['Programas · Bot'],
    )
    def get(self, request):
        return Response(bot_program_catalog())
