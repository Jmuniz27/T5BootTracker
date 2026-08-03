"""Business logic for the analytics KPI dashboard (CB-55)."""
import statistics
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.db.models.functions import TruncDay, TruncWeek
from django.utils import timezone

from apps.leads.models import Interaction, Lead
from apps.payments.models import Payment
from apps.payments.services import CRITICAL_DEFICIT_THRESHOLD
from apps.programs.models import Enrollment, Program

VELOCITY_DEFAULT_WINDOW_DAYS = 30
VELOCITY_WEEKLY_GRANULARITY_THRESHOLD_DAYS = 62  # > ~2 meses -> agrupar por semana en vez de día


class AnalyticsService:
    """Calcula los KPIs del dashboard de analítica (solo Admin)."""

    def get_dashboard_kpis(self, *, fecha_desde=None, fecha_hasta=None, segment=None, campaign=None) -> dict:
        return {
            'filters_applied': {
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None,
                'segment': segment,
                'campaign': campaign,
            },
            'conversion_rate': self._conversion_rate(fecha_desde, fecha_hasta, segment, campaign),
            'response_time': self._response_time(fecha_desde, fecha_hasta, segment, campaign),
            'lead_velocity': self._lead_velocity(fecha_desde, fecha_hasta, segment, campaign),
            'payment_collection': self._payment_collection(fecha_desde, fecha_hasta),
        }

    # ──────────────────────────────────────────────────────────────────────
    # Helpers compartidos
    # ──────────────────────────────────────────────────────────────────────

    def _leads_base_qs(self, fecha_desde, fecha_hasta, segment, campaign):
        qs = Lead.objects.all()  # manager por defecto ya excluye soft-deleted
        if fecha_desde:
            qs = qs.filter(created_at__date__gte=fecha_desde)
        if fecha_hasta:
            qs = qs.filter(created_at__date__lte=fecha_hasta)
        if segment:
            qs = qs.filter(source=segment)
        if campaign:
            # Interaction es FK inversa (related_name='interactions'): el join puede
            # multiplicar filas por Lead, distinct() es obligatorio en cuanto se aplica campaign.
            qs = qs.filter(interactions__campaign__icontains=campaign).distinct()
        return qs

    # ──────────────────────────────────────────────────────────────────────
    # 1. Conversion rate
    # ──────────────────────────────────────────────────────────────────────

    def _conversion_rate(self, fecha_desde, fecha_hasta, segment, campaign):
        qs = self._leads_base_qs(fecha_desde, fecha_hasta, segment, campaign)

        agg = qs.aggregate(
            total=Count('id', distinct=True),
            converted=Count('id', filter=Q(status=Lead.Status.CONVERTED), distinct=True),
        )
        total = agg['total'] or 0
        converted = agg['converted'] or 0
        rate = round(converted / total * 100, 2) if total else 0.0

        by_segment_raw = (
            qs.values('source')
              .annotate(
                  total=Count('id', distinct=True),
                  converted=Count('id', filter=Q(status=Lead.Status.CONVERTED), distinct=True),
              )
              .order_by('source')
        )
        by_segment = [
            {
                'segment': row['source'],
                'total_leads': row['total'],
                'converted_leads': row['converted'],
                'rate_percentage': round(row['converted'] / row['total'] * 100, 2) if row['total'] else 0.0,
            }
            for row in by_segment_raw
        ]

        return {
            'total_leads': total,
            'converted_leads': converted,
            'rate_percentage': rate,
            'by_segment': by_segment,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 2. Response time
    # ──────────────────────────────────────────────────────────────────────

    def _response_time(self, fecha_desde, fecha_hasta, segment, campaign):
        first_interaction_sq = (
            Interaction.objects.filter(lead=OuterRef('pk'))
            .order_by('created_at')
            .values('created_at')[:1]
        )
        qs = self._leads_base_qs(fecha_desde, fecha_hasta, segment, campaign).annotate(
            first_interaction_at=Subquery(first_interaction_sq)
        )

        total_considered = qs.count()
        pairs = list(qs.filter(first_interaction_at__isnull=False).values_list('created_at', 'first_interaction_at'))
        leads_without_response = qs.filter(first_interaction_at__isnull=True).count()

        hours = [(fi - c).total_seconds() / 3600 for c, fi in pairs]

        avg_hours = round(statistics.mean(hours), 1) if hours else None
        median_hours = round(statistics.median(hours), 1) if hours else None

        # Buckets semanales para el gráfico, sin zero-fill: una semana sin respuestas
        # no es "tiempo de respuesta cero", es ausencia del dato.
        buckets: dict = {}
        for created_at, first_interaction_at in pairs:
            week_start = created_at.date() - timedelta(days=created_at.weekday())
            delta_hours = (first_interaction_at - created_at).total_seconds() / 3600
            buckets.setdefault(week_start, []).append(delta_hours)
        series = [
            {'period_start': week_start.isoformat(), 'avg_hours': round(statistics.mean(vals), 1), 'count': len(vals)}
            for week_start, vals in sorted(buckets.items())
        ]

        return {
            'leads_considered': total_considered,
            'leads_with_response': len(hours),
            'leads_without_response': leads_without_response,
            'avg_hours': avg_hours,
            'median_hours': median_hours,
            'series': series,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 3. Lead velocity
    # ──────────────────────────────────────────────────────────────────────

    def _resolve_velocity_window(self, fecha_desde, fecha_hasta):
        if fecha_desde and fecha_hasta and fecha_desde <= fecha_hasta:
            current_from, current_to = fecha_desde, fecha_hasta
        else:
            current_to = timezone.localdate()
            current_from = current_to - timedelta(days=VELOCITY_DEFAULT_WINDOW_DAYS - 1)

        period_length = (current_to - current_from).days + 1
        previous_to = current_from - timedelta(days=1)
        previous_from = previous_to - timedelta(days=period_length - 1)
        return current_from, current_to, previous_from, previous_to

    def _lead_velocity(self, fecha_desde, fecha_hasta, segment, campaign):
        current_from, current_to, previous_from, previous_to = self._resolve_velocity_window(
            fecha_desde, fecha_hasta
        )

        def leads_qs(date_from, date_to):
            qs = Lead.objects.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
            if segment:
                qs = qs.filter(source=segment)
            if campaign:
                qs = qs.filter(interactions__campaign__icontains=campaign).distinct()
            return qs

        current_qs = leads_qs(current_from, current_to)
        previous_qs = leads_qs(previous_from, previous_to)

        current_count = current_qs.count()
        previous_count = previous_qs.count()

        if previous_count == 0:
            growth_rate_percentage = None if current_count > 0 else 0.0
        else:
            growth_rate_percentage = round((current_count - previous_count) / previous_count * 100, 1)

        period_days = (current_to - current_from).days + 1
        granularity = 'week' if period_days > VELOCITY_WEEKLY_GRANULARITY_THRESHOLD_DAYS else 'day'
        trunc_fn = TruncWeek if granularity == 'week' else TruncDay

        raw_series = (
            current_qs.annotate(period=trunc_fn('created_at'))
            .values('period')
            .annotate(count=Count('id', distinct=True))
            .order_by('period')
        )
        counts_by_period = {row['period'].date(): row['count'] for row in raw_series}

        # Zero-fill cada bucket del rango para que el gráfico no tenga huecos:
        # "0 leads ese día" es señal real, no ausencia de datos.
        series = []
        step = timedelta(days=7 if granularity == 'week' else 1)
        cursor = current_from if granularity == 'day' else current_from - timedelta(days=current_from.weekday())
        while cursor <= current_to:
            series.append({'period_start': cursor.isoformat(), 'count': counts_by_period.get(cursor, 0)})
            cursor += step

        return {
            'current_period': {'start': current_from.isoformat(), 'end': current_to.isoformat(), 'count': current_count},
            'previous_period': {'start': previous_from.isoformat(), 'end': previous_to.isoformat(), 'count': previous_count},
            'growth_rate_percentage': growth_rate_percentage,
            'granularity': granularity,
            'series': series,
        }

    # ──────────────────────────────────────────────────────────────────────
    # 4. Payment collection
    # ──────────────────────────────────────────────────────────────────────

    def _payment_collection(self, fecha_desde, fecha_hasta):
        results = []
        programs = Program.objects.all().order_by('-start_date')
        overall_expected = Decimal('0.00')
        overall_collected = Decimal('0.00')
        programs_with_no_enrollment = 0

        for program in programs:
            active_enrollments = Enrollment.objects.filter(bootcamp=program, status=Enrollment.Status.ACTIVE)
            expected = active_enrollments.aggregate(total=Sum('agreed_price'))['total'] or Decimal('0.00')
            active_enrollment_count = active_enrollments.count()

            # Enrollment (el "esperado") no tiene una fecha comparable al rango — es una
            # obligación fija, no un evento. fecha_desde/fecha_hasta sí aplican al lado
            # "cobrado": acota a los pagos APROBADOS *enviados* dentro de la ventana, para
            # responder "cuánto se cobró en este período" en vez de solo "estado actual".
            payments_qs = Payment.objects.filter(program=program, status=Payment.Status.APPROVED)
            if fecha_desde:
                payments_qs = payments_qs.filter(submitted_at__date__gte=fecha_desde)
            if fecha_hasta:
                payments_qs = payments_qs.filter(submitted_at__date__lte=fecha_hasta)
            collected = payments_qs.aggregate(total=Sum('confirmed_amount'))['total'] or Decimal('0.00')

            deficit = max(expected - collected, Decimal('0.00'))
            is_critical = expected > 0 and deficit > expected * CRITICAL_DEFICIT_THRESHOLD
            collection_rate_percentage = (
                round(float(collected / expected) * 100, 1) if expected > 0 else None
            )
            if expected == 0:
                programs_with_no_enrollment += 1

            overall_expected += expected
            overall_collected += collected

            results.append({
                'program_id': str(program.id),
                'program_name': program.name,
                'is_active': program.is_active,
                'active_enrollment_count': active_enrollment_count,
                'expected_amount': expected,
                'collected_amount': collected,
                'deficit_amount': deficit,
                'collection_rate_percentage': collection_rate_percentage,
                'is_critical': is_critical,
            })

        overall_deficit = max(overall_expected - overall_collected, Decimal('0.00'))
        overall_rate = (
            round(float(overall_collected / overall_expected) * 100, 1) if overall_expected > 0 else None
        )

        return {
            'overall': {
                'expected_amount': overall_expected,
                'collected_amount': overall_collected,
                'deficit_amount': overall_deficit,
                'collection_rate_percentage': overall_rate,
                'programs_with_no_active_enrollment': programs_with_no_enrollment,
            },
            'by_program': results,
            'note': (
                'fecha_desde/fecha_hasta acotan collected_amount a pagos APROBADOS enviados en '
                'esa ventana (expected_amount no cambia: es la obligación fija de Enrollment '
                'activos, no un evento con fecha). segment y campaign no aplican — no hay '
                'vínculo de Enrollment/Payment a Lead ni a campaña.'
            ),
        }

    # ──────────────────────────────────────────────────────────────────────
    # 5. Métricas de gestión de leads por vendedor (CR-006)
    # ──────────────────────────────────────────────────────────────────────

    def get_lead_management_metrics(self, *, fecha_desde=None, fecha_hasta=None, segment=None, campaign=None) -> dict:
        """Tiempo de retención y de primer contacto por vendedor (CR-006).

        Retención: para un lead liberado es `released_at - assigned_at`; para uno
        aún asignado, el tiempo transcurrido hasta ahora. Primer contacto:
        la interacción más antigua del lead menos `assigned_at`. `unassigned_leads`
        cuenta los que siguen sin dueño y por tanto faltan por asignar.

        `first_interaction_at` se resuelve con un Subquery anotado (no en un bucle
        por lead) para no reintroducir el N+1 de PERF-1.
        """
        first_interaction_sq = (
            Interaction.objects.filter(lead=OuterRef('pk'))
            .order_by('created_at')
            .values('created_at')[:1]
        )
        qs = (
            self._leads_base_qs(fecha_desde, fecha_hasta, segment, campaign)
            .filter(assigned_at__isnull=False)
            .annotate(first_interaction_at=Subquery(first_interaction_sq))
            .values_list(
                'owner_id', 'owner__first_name', 'owner__last_name',
                'assigned_at', 'released_at', 'first_interaction_at',
            )
        )

        # Leads que esperan que alguien los tome. `owner__isnull` y no
        # `assigned_at__isnull`: un lead liberado por el Administrador conserva su
        # assigned_at pero vuelve a la pila, así que también falta asignarlo.
        unassigned_leads = (
            self._leads_base_qs(fecha_desde, fecha_hasta, segment, campaign)
            .filter(owner__isnull=True)
            .count()
        )

        reference = timezone.now()
        by_owner: dict = {}
        retention_all: list = []
        contact_all: list = []

        for owner_id, first_name, last_name, assigned_at, released_at, first_interaction_at in qs:
            # Un lead liberado y nunca reasignado conserva owner=None: sus horas
            # cuentan en el total global, pero no hay vendedor al que atribuirlas.
            end = released_at or reference
            retention_hours = (end - assigned_at).total_seconds() / 3600
            retention_all.append(retention_hours)

            contact_hours = None
            if first_interaction_at and first_interaction_at >= assigned_at:
                contact_hours = (first_interaction_at - assigned_at).total_seconds() / 3600
                contact_all.append(contact_hours)

            if owner_id is None:
                continue

            bucket = by_owner.setdefault(owner_id, {
                'salesperson_id': str(owner_id),
                'salesperson': f'{first_name or ""} {last_name or ""}'.strip() or 'Sin nombre',
                'active_leads': 0,
                '_retention': [],
                '_contact': [],
            })
            bucket['_retention'].append(retention_hours)
            if contact_hours is not None:
                bucket['_contact'].append(contact_hours)
            if released_at is None:
                bucket['active_leads'] += 1

        by_salesperson = [
            {
                'salesperson_id': b['salesperson_id'],
                'salesperson': b['salesperson'],
                'active_leads': b['active_leads'],
                'avg_retention_hours': self._mean_hours(b['_retention']),
                'avg_time_to_first_contact_hours': self._mean_hours(b['_contact']),
            }
            for b in by_owner.values()
        ]
        by_salesperson.sort(key=lambda row: row['salesperson'])

        return {
            'filters_applied': {
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None,
                'segment': segment,
                'campaign': campaign,
            },
            'leads_considered': len(retention_all),
            'unassigned_leads': unassigned_leads,
            'avg_retention_hours': self._mean_hours(retention_all),
            'avg_time_to_first_contact_hours': self._mean_hours(contact_all),
            'by_salesperson': by_salesperson,
        }

    @staticmethod
    def _mean_hours(values):
        """Promedio redondeado a 1 decimal; None si no hay datos (0 sería engañoso)."""
        return round(statistics.mean(values), 1) if values else None
