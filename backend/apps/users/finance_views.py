"""Vistas de sólo lectura de la cartera de cada persona de Finanzas (solo Admin).

Sólo `GET`: el administrador mira, no interviene. No se expone ningún método de
escritura sobre la cartera ni sobre sus bootcampers, a propósito — reasignar un
bootcamper es cosa de Finanzas, que lo libera al pool para que otro lo tome.

Van en la app de usuarios y no en pagos para no tocar `PaymentMonitoringView`
ni `payments/services.py`.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import CustomUser
from apps.authentication.permissions import IsAdmin
from .finance_service import (
    get_finance_bootcampers,
    list_finance_portfolios,
    unassigned_bootcamper_count,
)

PORTFOLIO_FIELDS = {
    'finance_id':       drf_serializers.UUIDField(),
    'finance_name':     drf_serializers.CharField(),
    'email':            drf_serializers.EmailField(),
    'bootcamper_count': drf_serializers.IntegerField(),
    'expected_amount':  drf_serializers.DecimalField(max_digits=12, decimal_places=2),
    'total_paid':       drf_serializers.DecimalField(max_digits=12, decimal_places=2),
    'deficit':          drf_serializers.DecimalField(max_digits=12, decimal_places=2),
    'critical_count':   drf_serializers.IntegerField(),
}


class FinancePortfolioView(APIView):
    """GET /api/users/finance/ — cartera de cada persona de Finanzas (solo Admin)."""
    permission_classes = [IsAdmin]

    @extend_schema(
        responses={200: inline_serializer('FinancePortfolioResponse', fields={
            'portfolios':            inline_serializer('FinancePortfolio', fields=PORTFOLIO_FIELDS, many=True),
            'unassigned_bootcampers': drf_serializers.IntegerField(),
        })},
        summary='Cartera de bootcampers por persona de Finanzas (solo Admin)',
        description=(
            'Una fila por persona de Finanzas activa, incluidas las que no tienen ningún '
            'bootcamper (aparecen en ceros). Los administradores no figuran: no tienen '
            'cartera propia. `unassigned_bootcampers` cuenta los que siguen en el pool, sin '
            'nadie que les siga el cobro. critical_count se evalúa por par bootcamper/programa, '
            'no sobre el total.'
        ),
        tags=['Usuarios'],
    )
    def get(self, request):
        return Response({
            'portfolios':             list_finance_portfolios(),
            'unassigned_bootcampers': unassigned_bootcamper_count(),
        })


class FinanceBootcampersView(APIView):
    """GET /api/users/finance/{id}/bootcampers/ — sus bootcampers (solo Admin)."""
    permission_classes = [IsAdmin]

    @extend_schema(
        responses={
            200: inline_serializer('FinanceBootcamper', fields={
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
            404: OpenApiResponse(description='El usuario no existe o no es de Finanzas'),
        },
        summary='Bootcampers de una persona de Finanzas (solo Admin)',
        description='Sólo lectura. Un id que no corresponda a Finanzas devuelve 404.',
        tags=['Usuarios'],
    )
    def get(self, request, pk):
        # Se exige el rol en el lookup: pedir la cartera de un administrador o de
        # un bootcamper no es una lista vacía, es una petición sin sentido.
        finance_user = get_object_or_404(
            CustomUser, pk=pk, role=CustomUser.Role.FINANCE,
        )
        return Response({
            'finance_id':   str(finance_user.id),
            'finance_name': finance_user.get_full_name(),
            'email':        finance_user.email,
            'bootcampers':  get_finance_bootcampers(finance_user),
        })
