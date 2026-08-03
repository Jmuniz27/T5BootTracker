"""Vista de sólo lectura de la actividad comercial de cada vendedor (solo Admin).

Sólo `GET`: el administrador mira, no interviene. Reasignar leads ya tiene su
propio endpoint en la app de leads.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import CustomUser
from apps.authentication.permissions import IsAdmin
from .salespeople_service import get_salesperson_activity, list_salespeople_activity

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


class SalespersonActivityDetailView(APIView):
    """GET /api/users/salespeople/{id}/activity/ — rendimiento de uno (solo Admin)."""
    permission_classes = [IsAdmin]

    @extend_schema(
        responses={
            200: inline_serializer('SalespersonActivityDetail', fields={
                **ACTIVITY_FIELDS,
                'interactions':                    drf_serializers.IntegerField(),
                'avg_retention_hours':             drf_serializers.FloatField(allow_null=True),
                'avg_time_to_first_contact_hours': drf_serializers.FloatField(allow_null=True),
                'by_status':                       drf_serializers.ListField(),
                'by_month':                        drf_serializers.ListField(),
            }),
            404: OpenApiResponse(description='El usuario no existe o no es vendedor'),
        },
        summary='Rendimiento de un vendedor (solo Admin)',
        description=(
            'Totales, reparto de leads por estado y serie mensual de asignados y '
            'convertidos, más los tiempos de gestión. by_status incluye los estados sin '
            'leads en cero, para que el gráfico no cambie de forma según los datos. '
            'by_month agrupa por fecha de asignación, no de creación del lead. Los '
            'promedios de horas son null cuando el vendedor no tiene leads: un 0 se '
            'leería como que responde al instante. Sólo lectura.'
        ),
        tags=['Usuarios'],
    )
    def get(self, request, pk):
        # Se exige el rol: pedir el rendimiento comercial de un administrador o
        # de un bootcamper no es una respuesta vacía, es una petición sin sentido.
        salesperson = get_object_or_404(
            CustomUser, pk=pk, role=CustomUser.Role.SALESPERSON,
        )
        return Response(get_salesperson_activity(salesperson))
