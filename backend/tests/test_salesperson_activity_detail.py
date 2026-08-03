"""Rendimiento de un vendedor, para la pestaña Vendedor de Analítica."""
import datetime
import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Interaction, Lead


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def url(user):
    return f'/api/users/salespeople/{user.id}/activity/'


def make_lead(owner, phone, status=Lead.Status.NEW, assigned_at=None):
    lead = Lead.objects.create(
        name=f'Lead {phone}', phone=phone, owner=owner, status=status,
        assigned_at=assigned_at or timezone.now(),
    )
    return lead


class TestPermissions:
    def test_unauthenticated_rejected(self, db, salesperson_user):
        assert APIClient().get(url(salesperson_user)).status_code == 401

    def test_salesperson_cannot_read_even_their_own(self, db, salesperson_user):
        """Es una vista del administrador sobre el vendedor, no del vendedor."""
        assert make_client(salesperson_user).get(url(salesperson_user)).status_code == 403

    def test_bootcamper_rejected(self, db, bootcamper_user, salesperson_user):
        assert make_client(bootcamper_user).get(url(salesperson_user)).status_code == 403

    @pytest.mark.parametrize('method', ['post', 'put', 'patch', 'delete'])
    def test_no_write_methods(self, db, admin_user, salesperson_user, method):
        resp = getattr(make_client(admin_user), method)(url(salesperson_user))
        assert resp.status_code == 405

    def test_asking_for_an_admin_is_404(self, db, admin_user):
        assert make_client(admin_user).get(url(admin_user)).status_code == 404

    def test_unknown_id_is_404(self, db, admin_user):
        resp = make_client(admin_user).get(f'/api/users/salespeople/{uuid.uuid4()}/activity/')
        assert resp.status_code == 404


class TestTotals:
    def test_zeroes_for_a_salesperson_without_leads(self, db, admin_user, salesperson_user):
        body = make_client(admin_user).get(url(salesperson_user)).json()
        assert body['assigned_leads'] == 0
        assert body['conversion_rate'] == 0.0
        # Promedios ausentes, no cero: un 0 se leería como "responde al instante".
        assert body['avg_time_to_first_contact_hours'] is None
        assert body['avg_retention_hours'] is None

    def test_counts_and_rate(self, db, admin_user, salesperson_user):
        make_lead(salesperson_user, '0990001', status=Lead.Status.CONVERTED)
        make_lead(salesperson_user, '0990002')
        make_lead(salesperson_user, '0990003')

        body = make_client(admin_user).get(url(salesperson_user)).json()
        assert body['assigned_leads'] == 3
        assert body['converted_leads'] == 1
        assert body['conversion_rate'] == 33.3

    def test_uncontacted_excludes_converted_and_contacted(
        self, db, admin_user, salesperson_user
    ):
        make_lead(salesperson_user, '0990004')                                   # cuenta
        contacted = make_lead(salesperson_user, '0990005')
        Interaction.objects.create(
            lead=contacted, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.CALL,
            outcome=Interaction.Outcome.CALL_AGAIN,
        )
        make_lead(salesperson_user, '0990006', status=Lead.Status.CONVERTED)      # no cuenta

        body = make_client(admin_user).get(url(salesperson_user)).json()
        assert body['uncontacted_leads'] == 1
        assert body['interactions'] == 1

    def test_leads_of_another_salesperson_are_not_counted(self, db, admin_user, salesperson_user):
        other = CustomUser.objects.create_user(
            email='otro.vendedor@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )
        make_lead(salesperson_user, '0990007')
        make_lead(other, '0990008')

        body = make_client(admin_user).get(url(salesperson_user)).json()
        assert body['assigned_leads'] == 1


class TestCharts:
    def test_by_status_includes_every_status_even_at_zero(self, db, admin_user, salesperson_user):
        """Si faltaran los vacíos, el gráfico cambiaría de forma según los datos."""
        make_lead(salesperson_user, '0990009')

        body = make_client(admin_user).get(url(salesperson_user)).json()
        labels = [row['status'] for row in body['by_status']]
        assert labels == [value for value, _ in Lead.Status.choices]

        by_status = {row['status']: row['count'] for row in body['by_status']}
        assert by_status[Lead.Status.NEW] == 1
        assert by_status[Lead.Status.CONVERTED] == 0

    def test_by_month_is_ordered_oldest_first(self, db, admin_user, salesperson_user):
        now = timezone.now()
        make_lead(salesperson_user, '0990010', assigned_at=now - datetime.timedelta(days=70))
        make_lead(salesperson_user, '0990011', assigned_at=now)

        body = make_client(admin_user).get(url(salesperson_user)).json()
        months = [row['month'] for row in body['by_month']]
        assert months == sorted(months)

    def test_by_month_separates_converted(self, db, admin_user, salesperson_user):
        now = timezone.now()
        make_lead(salesperson_user, '0990012', status=Lead.Status.CONVERTED, assigned_at=now)
        make_lead(salesperson_user, '0990013', assigned_at=now)

        body = make_client(admin_user).get(url(salesperson_user)).json()
        assert body['by_month'][-1]['assigned'] == 2
        assert body['by_month'][-1]['converted'] == 1

    def test_by_month_skips_leads_without_assignment_date(self, db, admin_user, salesperson_user):
        """La serie responde cuándo tomó el lead: sin fecha no hay mes."""
        Lead.objects.create(
            name='Sin fecha', phone='0990014', owner=salesperson_user,
            status=Lead.Status.NEW, assigned_at=None,
        )

        body = make_client(admin_user).get(url(salesperson_user)).json()
        assert body['assigned_leads'] == 1
        assert body['by_month'] == []
