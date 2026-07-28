"""Tests for the analytics KPI endpoint (CB-55)."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Interaction, Lead
from apps.payments.models import Payment
from apps.programs.models import Enrollment, Program

ANALYTICS_KPIS_URL = '/api/analytics/kpis/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def _set_created_at(instance, when):
    """created_at es auto_now_add — .update() lo puede pisar, .save() no."""
    type(instance).objects.filter(pk=instance.pk).update(created_at=when)
    instance.refresh_from_db()


def _make_lead(name, phone, source=Lead.Source.MANUAL, status=Lead.Status.NEW, created_at=None):
    lead = Lead.objects.create(name=name, phone=phone, source=source, status=status)
    if created_at:
        _set_created_at(lead, created_at)
    return lead


def _make_interaction(lead, salesperson, created_at=None, campaign=''):
    interaction = Interaction.objects.create(
        lead=lead,
        salesperson=salesperson,
        interaction_type=Interaction.InteractionType.CALL,
        outcome=Interaction.Outcome.CALL_AGAIN,
        campaign=campaign,
    )
    if created_at:
        _set_created_at(interaction, created_at)
    return interaction


def _make_bootcamper(email):
    return CustomUser.objects.create_user(
        email=email, password='testpass123', first_name='Boot', last_name='Camper',
        role=CustomUser.Role.BOOTCAMPER,
    )


def _make_program(name, total_cost=Decimal('1200.00')):
    today = date.today()
    return Program.objects.create(
        name=name,
        start_date=today - timedelta(days=30),
        end_date=today + timedelta(days=60),
        total_cost=total_cost,
    )


def _make_enrollment(bootcamper, program, agreed_price, status=Enrollment.Status.ACTIVE):
    return Enrollment.objects.create(
        bootcamper=bootcamper, bootcamp=program,
        start_date=program.start_date, agreed_price=agreed_price, status=status,
    )


def _make_payment(bootcamper, program, status=Payment.Status.APPROVED, confirmed_amount=None, submitted_at=None):
    payment = Payment.objects.create(
        bootcamper=bootcamper, program=program,
        receipt_file='receipts/test.jpg', receipt_file_type='image',
        status=status, confirmed_amount=confirmed_amount,
    )
    if submitted_at:
        Payment.objects.filter(pk=payment.pk).update(submitted_at=submitted_at)
        payment.refresh_from_db()
    return payment


# ==========================================
# PERMISOS
# ==========================================

class TestAnalyticsPermissions:
    def test_unauthenticated_rejected(self, db):
        resp = APIClient().get(ANALYTICS_KPIS_URL)
        assert resp.status_code == 401

    def test_salesperson_rejected(self, db, salesperson_user):
        resp = make_client(salesperson_user).get(ANALYTICS_KPIS_URL)
        assert resp.status_code == 403

    def test_bootcamper_rejected(self, db, bootcamper_user):
        resp = make_client(bootcamper_user).get(ANALYTICS_KPIS_URL)
        assert resp.status_code == 403

    def test_admin_allowed_with_all_kpi_keys(self, db, admin_user):
        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert set(data.keys()) == {
            'filters_applied', 'conversion_rate', 'response_time', 'lead_velocity', 'payment_collection',
        }

    def test_filters_applied_echoes_query_params(self, db, admin_user):
        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': '2026-06-01', 'fecha_hasta': '2026-07-01',
            'segment': 'INSTAGRAM', 'campaign': 'verano',
        })
        assert resp.status_code == 200
        assert resp.json()['filters_applied'] == {
            'fecha_desde': '2026-06-01', 'fecha_hasta': '2026-07-01',
            'segment': 'INSTAGRAM', 'campaign': 'verano',
        }


# ==========================================
# CONVERSION RATE
# ==========================================

class TestConversionRate:
    def test_no_leads_in_range(self, db, admin_user):
        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {'fecha_desde': '2099-01-01'})
        cr = resp.json()['conversion_rate']
        assert cr == {'total_leads': 0, 'converted_leads': 0, 'rate_percentage': 0.0, 'by_segment': []}

    def test_mixed_statuses_computes_rate(self, db, admin_user):
        now = timezone.now()
        _make_lead('A', '111', status=Lead.Status.CONVERTED, created_at=now)
        _make_lead('B', '222', status=Lead.Status.NEW, created_at=now)
        _make_lead('C', '333', status=Lead.Status.INTERESTED, created_at=now)
        _make_lead('D', '444', status=Lead.Status.NOT_INTERESTED, created_at=now)

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        cr = resp.json()['conversion_rate']
        assert cr['total_leads'] == 4
        assert cr['converted_leads'] == 1
        assert cr['rate_percentage'] == 25.0

    def test_date_range_excludes_leads_outside_window(self, db, admin_user):
        now = timezone.now()
        _make_lead('Adentro', '111', created_at=now)
        _make_lead('Afuera', '222', created_at=now - timedelta(days=90))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': (now.date() - timedelta(days=1)).isoformat(),
        })
        assert resp.json()['conversion_rate']['total_leads'] == 1

    def test_segment_filter_narrows_population(self, db, admin_user):
        now = timezone.now()
        _make_lead('IG', '111', source=Lead.Source.INSTAGRAM, created_at=now)
        _make_lead('WA', '222', source=Lead.Source.WHATSAPP, created_at=now)

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {'segment': Lead.Source.INSTAGRAM})
        cr = resp.json()['conversion_rate']
        assert cr['total_leads'] == 1
        assert cr['by_segment'] == [
            {'segment': 'INSTAGRAM', 'total_leads': 1, 'converted_leads': 0, 'rate_percentage': 0.0}
        ]

    def test_campaign_filter_dedupes_leads_with_multiple_matching_interactions(self, db, admin_user, salesperson_user):
        now = timezone.now()
        lead = _make_lead('Multi', '111', created_at=now)
        _make_interaction(lead, salesperson_user, created_at=now, campaign='verano2026')
        _make_interaction(lead, salesperson_user, created_at=now + timedelta(hours=1), campaign='verano2026')

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {'campaign': 'verano'})
        assert resp.json()['conversion_rate']['total_leads'] == 1


# ==========================================
# RESPONSE TIME
# ==========================================

class TestResponseTime:
    def test_lead_without_interactions_excluded_but_counted(self, db, admin_user):
        now = timezone.now()
        _make_lead('Sin respuesta', '111', created_at=now)

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        rt = resp.json()['response_time']
        assert rt['leads_considered'] == 1
        assert rt['leads_with_response'] == 0
        assert rt['leads_without_response'] == 1
        assert rt['avg_hours'] is None
        assert rt['median_hours'] is None

    def test_avg_hours_computed_correctly(self, db, admin_user, salesperson_user):
        created = timezone.now() - timedelta(days=1)
        lead = _make_lead('Respondido', '111', created_at=created)
        _make_interaction(lead, salesperson_user, created_at=created + timedelta(hours=5))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        rt = resp.json()['response_time']
        assert rt['leads_with_response'] == 1
        assert rt['avg_hours'] == pytest.approx(5.0, abs=0.05)
        assert rt['median_hours'] == pytest.approx(5.0, abs=0.05)

    def test_uses_earliest_interaction_not_latest(self, db, admin_user, salesperson_user):
        created = timezone.now() - timedelta(days=2)
        lead = _make_lead('DosInteracciones', '111', created_at=created)
        _make_interaction(lead, salesperson_user, created_at=created + timedelta(hours=10))
        _make_interaction(lead, salesperson_user, created_at=created + timedelta(hours=2))  # la más temprana

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        assert resp.json()['response_time']['avg_hours'] == pytest.approx(2.0, abs=0.05)

    def test_ignores_assigned_at_uses_created_at(self, db, admin_user, salesperson_user):
        created = timezone.now() - timedelta(days=3)
        lead = _make_lead('ConAssignedAt', '111', created_at=created)
        lead.assigned_at = created + timedelta(days=1)  # lejos de created_at y de la interacción
        lead.owner = salesperson_user
        lead.save()
        _make_interaction(lead, salesperson_user, created_at=created + timedelta(hours=3))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        assert resp.json()['response_time']['avg_hours'] == pytest.approx(3.0, abs=0.05)

    def test_segment_and_campaign_filters_apply(self, db, admin_user, salesperson_user):
        now = timezone.now()
        ig_lead = _make_lead('IG', '111', source=Lead.Source.INSTAGRAM, created_at=now)
        _make_interaction(ig_lead, salesperson_user, created_at=now + timedelta(hours=1))
        wa_lead = _make_lead('WA', '222', source=Lead.Source.WHATSAPP, created_at=now)
        _make_interaction(wa_lead, salesperson_user, created_at=now + timedelta(hours=2))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {'segment': Lead.Source.INSTAGRAM})
        assert resp.json()['response_time']['leads_considered'] == 1


# ==========================================
# LEAD VELOCITY
# ==========================================

class TestLeadVelocity:
    def test_default_window_is_last_30_days_when_no_dates_given(self, db, admin_user):
        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        current = resp.json()['lead_velocity']['current_period']
        today = timezone.localdate()
        assert current['end'] == today.isoformat()
        assert current['start'] == (today - timedelta(days=29)).isoformat()

    def test_explicit_range_defines_current_and_previous_period(self, db, admin_user):
        today = timezone.localdate()
        current_from = today - timedelta(days=9)
        current_to = today
        previous_from = current_from - timedelta(days=10)
        previous_to = current_from - timedelta(days=1)

        _make_lead('Actual', '111', created_at=timezone.now())
        _make_lead('Anterior', '222', created_at=timezone.now() - timedelta(days=15))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': current_from.isoformat(), 'fecha_hasta': current_to.isoformat(),
        })
        velocity = resp.json()['lead_velocity']
        assert velocity['previous_period']['start'] == previous_from.isoformat()
        assert velocity['previous_period']['end'] == previous_to.isoformat()
        assert velocity['current_period']['count'] == 1
        assert velocity['previous_period']['count'] == 1

    def test_growth_rate_positive(self, db, admin_user):
        # Ventana actual = [today-4, today] (5 días) -> ventana anterior = [today-9, today-5].
        today = timezone.localdate()
        current_from = today - timedelta(days=4)
        for _ in range(4):
            _make_lead('C', '1110', created_at=timezone.now())
        for _ in range(2):
            _make_lead('P', '2220', created_at=timezone.now() - timedelta(days=7))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': current_from.isoformat(), 'fecha_hasta': today.isoformat(),
        })
        velocity = resp.json()['lead_velocity']
        assert velocity['current_period']['count'] == 4
        assert velocity['previous_period']['count'] == 2
        assert velocity['growth_rate_percentage'] == 100.0

    def test_growth_rate_none_when_previous_zero_and_current_positive(self, db, admin_user):
        _make_lead('Nuevo', '111', created_at=timezone.now())
        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        assert resp.json()['lead_velocity']['growth_rate_percentage'] is None

    def test_growth_rate_zero_when_both_periods_empty(self, db, admin_user):
        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        velocity = resp.json()['lead_velocity']
        assert velocity['current_period']['count'] == 0
        assert velocity['previous_period']['count'] == 0
        assert velocity['growth_rate_percentage'] == 0.0

    def test_series_is_zero_filled(self, db, admin_user):
        today = timezone.localdate()
        current_from = today - timedelta(days=2)
        _make_lead('Dia1', '111', created_at=timezone.now() - timedelta(days=2))
        _make_lead('Dia3', '222', created_at=timezone.now())

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': current_from.isoformat(), 'fecha_hasta': today.isoformat(),
        })
        series = resp.json()['lead_velocity']['series']
        assert len(series) == 3
        counts = [pt['count'] for pt in series]
        assert counts == [1, 0, 1]

    def test_granularity_switches_to_week_for_long_range(self, db, admin_user):
        today = timezone.localdate()
        current_from = today - timedelta(days=70)
        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': current_from.isoformat(), 'fecha_hasta': today.isoformat(),
        })
        assert resp.json()['lead_velocity']['granularity'] == 'week'

    def test_segment_filter_applies_to_both_periods(self, db, admin_user):
        # Ventana actual = [today-4, today] (5 días) -> ventana anterior = [today-9, today-5].
        today = timezone.localdate()
        current_from = today - timedelta(days=4)
        _make_lead('IGActual', '111', source=Lead.Source.INSTAGRAM, created_at=timezone.now())
        _make_lead('WAActual', '222', source=Lead.Source.WHATSAPP, created_at=timezone.now())
        _make_lead('IGAnterior', '333', source=Lead.Source.INSTAGRAM, created_at=timezone.now() - timedelta(days=7))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': current_from.isoformat(), 'fecha_hasta': today.isoformat(),
            'segment': Lead.Source.INSTAGRAM,
        })
        velocity = resp.json()['lead_velocity']
        assert velocity['current_period']['count'] == 1
        assert velocity['previous_period']['count'] == 1


# ==========================================
# PAYMENT COLLECTION
# ==========================================

class TestPaymentCollection:
    def test_uses_agreed_price_not_program_total_cost(self, db, admin_user):
        program = _make_program('Programa X', total_cost=Decimal('1200.00'))
        bootcamper = _make_bootcamper('bc1@test.com')
        _make_enrollment(bootcamper, program, agreed_price=Decimal('900.00'))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        row = next(p for p in resp.json()['payment_collection']['by_program'] if p['program_id'] == str(program.id))
        assert row['expected_amount'] == 900.0

    def test_program_with_zero_active_enrollments(self, db, admin_user):
        program = _make_program('Sin inscripciones')

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        row = next(p for p in resp.json()['payment_collection']['by_program'] if p['program_id'] == str(program.id))
        assert row['active_enrollment_count'] == 0
        assert row['expected_amount'] == 0.0
        assert row['collection_rate_percentage'] is None
        assert row['is_critical'] is False

    def test_critical_threshold_boundary(self, db, admin_user):
        program_exact = _make_program('Exacto 10%')
        bc1 = _make_bootcamper('bc_exact@test.com')
        _make_enrollment(bc1, program_exact, agreed_price=Decimal('1000.00'))
        _make_payment(bc1, program_exact, confirmed_amount=Decimal('900.00'))  # deficit=100 = 10%

        program_over = _make_program('Sobre 10%')
        bc2 = _make_bootcamper('bc_over@test.com')
        _make_enrollment(bc2, program_over, agreed_price=Decimal('1000.00'))
        _make_payment(bc2, program_over, confirmed_amount=Decimal('899.90'))  # deficit=100.10 > 10%

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        by_program = {p['program_id']: p for p in resp.json()['payment_collection']['by_program']}
        assert by_program[str(program_exact.id)]['is_critical'] is False
        assert by_program[str(program_over.id)]['is_critical'] is True

    def test_only_active_enrollments_counted_in_expected(self, db, admin_user):
        program = _make_program('Mixto')
        bc_active = _make_bootcamper('bc_active@test.com')
        bc_dropped = _make_bootcamper('bc_dropped@test.com')
        _make_enrollment(bc_active, program, agreed_price=Decimal('500.00'), status=Enrollment.Status.ACTIVE)
        _make_enrollment(bc_dropped, program, agreed_price=Decimal('700.00'), status=Enrollment.Status.DROPPED)

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        row = next(p for p in resp.json()['payment_collection']['by_program'] if p['program_id'] == str(program.id))
        assert row['expected_amount'] == 500.0
        assert row['active_enrollment_count'] == 1

    def test_only_approved_payments_counted_in_collected(self, db, admin_user):
        program = _make_program('Pagos mixtos')
        bootcamper = _make_bootcamper('bc_payments@test.com')
        _make_enrollment(bootcamper, program, agreed_price=Decimal('1000.00'))
        _make_payment(bootcamper, program, status=Payment.Status.DRAFT, confirmed_amount=None)
        _make_payment(bootcamper, program, status=Payment.Status.PENDING, confirmed_amount=None)
        _make_payment(bootcamper, program, status=Payment.Status.REJECTED, confirmed_amount=None)
        _make_payment(bootcamper, program, status=Payment.Status.APPROVED, confirmed_amount=Decimal('300.00'))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        row = next(p for p in resp.json()['payment_collection']['by_program'] if p['program_id'] == str(program.id))
        assert row['collected_amount'] == 300.0

    def test_segment_and_campaign_do_not_affect_payment_collection(self, db, admin_user):
        program = _make_program('Sin filtros de segmento')
        bootcamper = _make_bootcamper('bc_nofilter@test.com')
        _make_enrollment(bootcamper, program, agreed_price=Decimal('400.00'))

        unfiltered = make_client(admin_user).get(ANALYTICS_KPIS_URL).json()['payment_collection']
        filtered = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'segment': 'INSTAGRAM', 'campaign': 'nope',
        }).json()['payment_collection']
        assert unfiltered == filtered

    def test_fecha_desde_hasta_scope_collected_amount_by_submitted_at(self, db, admin_user):
        program = _make_program('Con ventana de fechas')
        bootcamper = _make_bootcamper('bc_datefilter@test.com')
        _make_enrollment(bootcamper, program, agreed_price=Decimal('1000.00'))
        now = timezone.now()
        _make_payment(bootcamper, program, confirmed_amount=Decimal('300.00'), submitted_at=now)
        _make_payment(bootcamper, program, confirmed_amount=Decimal('200.00'), submitted_at=now - timedelta(days=90))

        unfiltered = make_client(admin_user).get(ANALYTICS_KPIS_URL).json()['payment_collection']
        row_unfiltered = next(p for p in unfiltered['by_program'] if p['program_id'] == str(program.id))
        assert row_unfiltered['collected_amount'] == 500.0
        assert row_unfiltered['expected_amount'] == 1000.0

        filtered = make_client(admin_user).get(ANALYTICS_KPIS_URL, {
            'fecha_desde': (now.date() - timedelta(days=1)).isoformat(),
        }).json()['payment_collection']
        row_filtered = next(p for p in filtered['by_program'] if p['program_id'] == str(program.id))
        assert row_filtered['collected_amount'] == 300.0
        assert row_filtered['expected_amount'] == 1000.0  # expected no cambia con la ventana

    def test_multiple_programs_appear_in_breakdown(self, db, admin_user):
        p1 = _make_program('Programa Uno')
        p2 = _make_program('Programa Dos')

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        ids = {p['program_id'] for p in resp.json()['payment_collection']['by_program']}
        assert {str(p1.id), str(p2.id)} <= ids

    def test_overall_aggregates_sum_across_programs(self, db, admin_user):
        p1 = _make_program('Suma Uno')
        p2 = _make_program('Suma Dos')
        bc1 = _make_bootcamper('bc_sum1@test.com')
        bc2 = _make_bootcamper('bc_sum2@test.com')
        _make_enrollment(bc1, p1, agreed_price=Decimal('500.00'))
        _make_enrollment(bc2, p2, agreed_price=Decimal('300.00'))
        _make_payment(bc1, p1, confirmed_amount=Decimal('200.00'))
        _make_payment(bc2, p2, confirmed_amount=Decimal('100.00'))

        resp = make_client(admin_user).get(ANALYTICS_KPIS_URL)
        payment_collection = resp.json()['payment_collection']
        by_program_total_expected = sum(p['expected_amount'] for p in payment_collection['by_program'])
        by_program_total_collected = sum(p['collected_amount'] for p in payment_collection['by_program'])
        assert payment_collection['overall']['expected_amount'] == pytest.approx(by_program_total_expected)
        assert payment_collection['overall']['collected_amount'] == pytest.approx(by_program_total_collected)
