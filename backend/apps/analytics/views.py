"""Views for analytics app."""
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiParameter
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.leads.permissions import IsAdministrator
from .services import AnalyticsService


class AnalyticsKPIView(APIView):
    """GET /api/analytics/kpis/ — KPIs combinados del dashboard de analítica (solo Admin)."""
    permission_classes = [IsAdministrator]

    @extend_schema(
        parameters=[
            OpenApiParameter('fecha_desde', str, description='Filtrar desde (YYYY-MM-DD). Define además la ventana actual de lead_velocity y el rango de submitted_at en payment_collection.'),
            OpenApiParameter('fecha_hasta', str, description='Filtrar hasta (YYYY-MM-DD).'),
            OpenApiParameter('segment', str, description='Lead.source: INSTAGRAM, WHATSAPP, LANDING_PAGE, MANUAL'),
            OpenApiParameter('campaign', str, description='Interaction.campaign (texto libre, coincidencia parcial, case-insensitive)'),
        ],
        responses={200: inline_serializer('AnalyticsKPIResponse', fields={
            'filters_applied':    drf_serializers.DictField(),
            'conversion_rate':    drf_serializers.DictField(),
            'response_time':      drf_serializers.DictField(),
            'lead_velocity':      drf_serializers.DictField(),
            'payment_collection': drf_serializers.DictField(),
        })},
        summary='KPIs del dashboard de analítica (solo Admin)',
        description=(
            'Devuelve tasa de conversión, tiempo de respuesta, velocidad de leads y cobro de '
            'pagos en una sola respuesta. payment_collection solo respeta fecha_desde/fecha_hasta '
            '(acota collected_amount por Payment.submitted_at); segment/campaign no aplican ahí '
            '(ver su campo "note").'
        ),
        tags=['Analytics'],
    )
    def get(self, request):
        params = request.query_params
        fecha_desde = parse_date(params.get('fecha_desde', '') or '')
        fecha_hasta = parse_date(params.get('fecha_hasta', '') or '')
        segment = params.get('segment') or None
        campaign = params.get('campaign') or None

        data = AnalyticsService().get_dashboard_kpis(
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            segment=segment,
            campaign=campaign,
        )
        return Response(data)


class LeadManagementMetricsView(APIView):
    """GET /api/analytics/lead-management/ — métricas de gestión por vendedor (CR-006, solo Admin)."""
    permission_classes = [IsAdministrator]

    @extend_schema(
        parameters=[
            OpenApiParameter('fecha_desde', str, description='Filtrar leads creados desde (YYYY-MM-DD).'),
            OpenApiParameter('fecha_hasta', str, description='Filtrar leads creados hasta (YYYY-MM-DD).'),
            OpenApiParameter('segment', str, description='Lead.source: INSTAGRAM, WHATSAPP, LANDING_PAGE, MANUAL'),
            OpenApiParameter('campaign', str, description='Interaction.campaign (coincidencia parcial, case-insensitive)'),
        ],
        responses={200: inline_serializer('LeadManagementMetricsResponse', fields={
            'filters_applied':                 drf_serializers.DictField(),
            'leads_considered':                drf_serializers.IntegerField(),
            'avg_retention_hours':             drf_serializers.FloatField(allow_null=True),
            'avg_time_to_first_contact_hours': drf_serializers.FloatField(allow_null=True),
            'by_salesperson':                  drf_serializers.ListField(),
        })},
        summary='Métricas de gestión de leads por vendedor (solo Admin)',
        description=(
            'Tiempo de retención (assigned_at → released_at, o hasta ahora si sigue asignado) '
            'y tiempo entre asignación y primer contacto, global y por vendedor. Solo considera '
            'leads que fueron asignados alguna vez. Los promedios son null cuando no hay datos.'
        ),
        tags=['Analytics'],
    )
    def get(self, request):
        params = request.query_params
        data = AnalyticsService().get_lead_management_metrics(
            fecha_desde=parse_date(params.get('fecha_desde', '') or ''),
            fecha_hasta=parse_date(params.get('fecha_hasta', '') or ''),
            segment=params.get('segment') or None,
            campaign=params.get('campaign') or None,
        )
        return Response(data)
