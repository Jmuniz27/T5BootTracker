"""Vista de sólo lectura de la actividad comercial de cada vendedor (solo Admin).

Sólo `GET`: el administrador mira, no interviene. Reasignar leads ya tiene su
propio endpoint en la app de leads.
"""
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.permissions import IsAdmin
from .salespeople_service import list_salespeople_activity

ACTIVITY_FIELDS = {
    'salesperson_id':    drf_serializers.UUIDField(),
    'salesperson':       drf_serializers.CharField(),
    'email':             drf_serializers.EmailField(),
    'assigned_leads':    drf_serializers.IntegerField(),
    'converted_leads':   drf_serializers.IntegerField(),
    'uncontacted_leads': drf_serializers.IntegerField(),
    'conversion_rate':   drf_serializers.FloatField(),
}


class SalespeopleActivityView(APIView):
    """GET /api/users/salespeople/ — actividad comercial por vendedor (solo Admin)."""
    permission_classes = [IsAdmin]

    @extend_schema(
        responses={200: inline_serializer('SalespersonActivity', fields=ACTIVITY_FIELDS, many=True)},
        summary='Actividad comercial por vendedor (solo Admin)',
        description=(
            'Una fila por vendedor activo, incluidos los que no tienen ningún lead '
            '(aparecen en ceros). Los administradores no figuran. Un lead convertido '
            'conserva su vendedor, así que converted_leads es un subconjunto de '
            'assigned_leads. uncontacted_leads cuenta los leads asignados sin ninguna '
            'interacción registrada y todavía sin convertir. No incluye montos: el cobro '
            'es de Finanzas y se consulta en /api/users/finance/.'
        ),
        tags=['Usuarios'],
    )
    def get(self, request):
        return Response(list_salespeople_activity())
