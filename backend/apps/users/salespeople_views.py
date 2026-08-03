"""Vistas de sólo lectura de la cartera de cada vendedor (solo Administrador).

Sólo `GET`: el administrador mira, no interviene. No se expone ningún método de
escritura sobre el vendedor ni sobre sus bootcampers, a propósito.

Van en la app de usuarios y no en pagos para no tocar `PaymentMonitoringView`
ni `payments/services.py`, que PERF-1 está reescribiendo.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import CustomUser
from apps.authentication.permissions import IsAdmin
from .salespeople_service import get_salesperson_bootcampers, list_salespeople_portfolios

PORTFOLIO_FIELDS = {
    'salesperson_id':   drf_serializers.UUIDField(),
    'salesperson':      drf_serializers.CharField(),
    'email':            drf_serializers.EmailField(),
    'bootcamper_count': drf_serializers.IntegerField(),
    'expected_amount':  drf_serializers.DecimalField(max_digits=12, decimal_places=2),
    'total_paid':       drf_serializers.DecimalField(max_digits=12, decimal_places=2),
    'deficit':          drf_serializers.DecimalField(max_digits=12, decimal_places=2),
    'critical_count':   drf_serializers.IntegerField(),
}


class SalespeoplePortfolioView(APIView):
    """GET /api/users/salespeople/ — cartera de cada vendedor (solo Admin)."""
    permission_classes = [IsAdmin]

    @extend_schema(
        responses={200: inline_serializer('SalespersonPortfolio', fields=PORTFOLIO_FIELDS, many=True)},
        summary='Cartera de bootcampers por vendedor (solo Admin)',
        description=(
            'Una fila por vendedor activo, incluidos los que no tienen ningún bootcamper '
            '(aparecen en ceros). Los administradores no figuran: no tienen cartera propia. '
            'critical_count se evalúa por par bootcamper/programa, no sobre el total.'
        ),
        tags=['Usuarios'],
    )
    def get(self, request):
        return Response(list_salespeople_portfolios())


class SalespersonBootcampersView(APIView):
    """GET /api/users/salespeople/{id}/bootcampers/ — sus bootcampers (solo Admin)."""
    permission_classes = [IsAdmin]

    @extend_schema(
        responses={
            200: inline_serializer('SalespersonBootcamper', fields={
                'bootcamper_id':    drf_serializers.UUIDField(),
                'bootcamper_name':  drf_serializers.CharField(),
                'email':            drf_serializers.EmailField(),
                'program_count':    drf_serializers.IntegerField(),
                'pending_payments': drf_serializers.IntegerField(),
                'expected_amount':  drf_serializers.DecimalField(max_digits=12, decimal_places=2),
                'total_paid':       drf_serializers.DecimalField(max_digits=12, decimal_places=2),
                'deficit':          drf_serializers.DecimalField(max_digits=12, decimal_places=2),
                'critical_count':   drf_serializers.IntegerField(),
            }, many=True),
            404: OpenApiResponse(description='El usuario no existe o no es vendedor'),
        },
        summary='Bootcampers de un vendedor (solo Admin)',
        description='Sólo lectura. Un id que no corresponda a un vendedor devuelve 404.',
        tags=['Usuarios'],
    )
    def get(self, request, pk):
        # Se exige el rol en el lookup: pedir la cartera de un administrador o de
        # un bootcamper no es una lista vacía, es una petición sin sentido.
        salesperson = get_object_or_404(
            CustomUser, pk=pk, role=CustomUser.Role.SALESPERSON,
        )
        return Response({
            'salesperson_id': str(salesperson.id),
            'salesperson':    salesperson.get_full_name(),
            'email':          salesperson.email,
            'bootcampers':    get_salesperson_bootcampers(salesperson),
        })
