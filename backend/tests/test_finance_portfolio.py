"""Cartera de bootcampers por persona de Finanzas, para el panel del administrador.

El vínculo es `finance_owner`: quien tomó al bootcamper del pool. Antes esta
cartera se derivaba de `Lead.owner`, que responde otra pregunta —quién trajo al
bootcamper— y desde que Finanzas se asigna la suya dejaron de coincidir.
"""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead
from apps.payments.models import Payment

PORTFOLIO_URL = '/api/users/finance/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def bootcampers_url(finance_user):
    return f'/api/users/finance/{finance_user.id}/bootcampers/'


def portfolios(admin_user):
    return make_client(admin_user).get(PORTFOLIO_URL).json()['portfolios']


@pytest.fixture
def bootcamper_factory(db):
    def _make(email, owner=None, cedula=None):
        return CustomUser.objects.create_user(
            email=email, password='testpass123',
            first_name='Boot', last_name=email.split('@')[0],
            role=CustomUser.Role.BOOTCAMPER, cedula=cedula,
            finance_owner=owner,
        )
    return _make


def pay(bootcamper, program, amount, status=Payment.Status.APPROVED):
    return Payment.objects.create(
        bootcamper=bootcamper, program=program,
        receipt_file='receipts/t.jpg', receipt_file_type='image',
        status=status, confirmed_amount=amount,
    )


class TestPortfolioPermissions:
    def test_unauthenticated_rejected(self, db):
        assert APIClient().get(PORTFOLIO_URL).status_code == 401

    def test_salesperson_rejected(self, db, salesperson_user):
        assert make_client(salesperson_user).get(PORTFOLIO_URL).status_code == 403

    def test_bootcamper_rejected(self, db, bootcamper_user):
        assert make_client(bootcamper_user).get(PORTFOLIO_URL).status_code == 403

    def test_finance_cannot_read_even_their_own(self, db, finance_user):
        """No es una vista de Finanzas: es del administrador sobre Finanzas."""
        resp = make_client(finance_user).get(bootcampers_url(finance_user))
        assert resp.status_code == 403

    def test_admin_allowed(self, db, admin_user):
        assert make_client(admin_user).get(PORTFOLIO_URL).status_code == 200

    @pytest.mark.parametrize('method', ['post', 'put', 'patch', 'delete'])
    def test_no_write_methods(self, db, admin_user, finance_user, method):
        """El administrador mira y no interviene: sólo GET."""
        client = make_client(admin_user)
        resp = getattr(client, method)(bootcampers_url(finance_user))
        assert resp.status_code == 405


class TestPortfolioList:
    def test_admin_never_appears_as_a_portfolio(self, db, admin_user):
        assert str(admin_user.id) not in [r['finance_id'] for r in portfolios(admin_user)]

    def test_salesperson_never_appears_as_a_portfolio(
        self, db, admin_user, salesperson_user
    ):
        """El vendedor ya no cobra: no tiene cartera que mostrar."""
        assert str(salesperson_user.id) not in [r['finance_id'] for r in portfolios(admin_user)]

    def test_finance_without_bootcampers_shows_zeroes(self, db, admin_user, finance_user):
        row = next(r for r in portfolios(admin_user) if r['finance_id'] == str(finance_user.id))
        assert row['bootcamper_count'] == 0
        assert Decimal(row['total_paid']) == Decimal('0.00')
        assert row['critical_count'] == 0

    def test_counts_only_their_own_bootcampers(
        self, db, admin_user, finance_user, other_finance_user, bootcamper_factory
    ):
        bootcamper_factory('uno@test.com', owner=finance_user)
        bootcamper_factory('dos@test.com', owner=finance_user)
        bootcamper_factory('tres@test.com', owner=other_finance_user)

        by_id = {r['finance_id']: r for r in portfolios(admin_user)}
        assert by_id[str(finance_user.id)]['bootcamper_count'] == 2
        assert by_id[str(other_finance_user.id)]['bootcamper_count'] == 1

    def test_released_bootcamper_no_longer_counts(
        self, db, admin_user, finance_user, bootcamper_factory
    ):
        """Devuelto al pool, el bootcamper deja de ser responsabilidad de nadie."""
        bootcamper = bootcamper_factory('libre@test.com', owner=finance_user)
        bootcamper.finance_owner = None
        bootcamper.save(update_fields=['finance_owner'])

        row = next(r for r in portfolios(admin_user) if r['finance_id'] == str(finance_user.id))
        assert row['bootcamper_count'] == 0

    def test_unassigned_count_exposes_the_pool(
        self, db, admin_user, finance_user, bootcamper_factory
    ):
        """El admin tiene que ver lo que nadie está cobrando."""
        bootcamper_factory('asignado@test.com', owner=finance_user)
        bootcamper_factory('enpool1@test.com')
        bootcamper_factory('enpool2@test.com')

        body = make_client(admin_user).get(PORTFOLIO_URL).json()
        assert body['unassigned_bootcampers'] == 2

    def test_money_adds_up_across_bootcampers(
        self, db, admin_user, finance_user, program, bootcamper_factory
    ):
        uno = bootcamper_factory('pago1@test.com', owner=finance_user)
        dos = bootcamper_factory('pago2@test.com', owner=finance_user)
        pay(uno, program, Decimal('400.00'))
        pay(dos, program, Decimal('200.00'))

        row = next(r for r in portfolios(admin_user) if r['finance_id'] == str(finance_user.id))
        assert Decimal(row['total_paid']) == Decimal('600.00')
        # Dos pares bootcamper/programa, cada uno esperando el costo del programa.
        assert Decimal(row['expected_amount']) == program.total_cost * 2

    def test_pending_payments_do_not_count_as_paid(
        self, db, admin_user, finance_user, program, bootcamper_factory
    ):
        bc = bootcamper_factory('pendiente@test.com', owner=finance_user)
        pay(bc, program, Decimal('300.00'), status=Payment.Status.PENDING)

        row = next(r for r in portfolios(admin_user) if r['finance_id'] == str(finance_user.id))
        assert Decimal(row['total_paid']) == Decimal('0.00')

    def test_critical_is_counted_per_pair_not_over_the_total(
        self, db, admin_user, finance_user, program, bootcamper_factory
    ):
        """Uno al día no debe tapar a otro en crítico: se evalúa par por par."""
        al_dia = bootcamper_factory('aldia@test.com', owner=finance_user)
        critico = bootcamper_factory('critico@test.com', owner=finance_user)
        pay(al_dia, program, program.total_cost)          # sin déficit
        pay(critico, program, Decimal('0.00'))            # déficit total

        row = next(r for r in portfolios(admin_user) if r['finance_id'] == str(finance_user.id))
        assert row['critical_count'] == 1


class TestFinanceBootcampers:
    def test_lists_their_bootcampers_with_summary(
        self, db, admin_user, finance_user, program, bootcamper_factory
    ):
        bc = bootcamper_factory('detalle@test.com', owner=finance_user)
        pay(bc, program, Decimal('500.00'))
        pay(bc, program, Decimal('100.00'), status=Payment.Status.PENDING)

        body = make_client(admin_user).get(bootcampers_url(finance_user)).json()
        assert body['finance_id'] == str(finance_user.id)
        assert len(body['bootcampers']) == 1

        row = body['bootcampers'][0]
        assert row['bootcamper_id'] == str(bc.id)
        assert Decimal(row['total_paid']) == Decimal('500.00')
        assert row['pending_payments'] == 1
        assert row['program_count'] == 1

    def test_empty_for_finance_without_bootcampers(self, db, admin_user, finance_user):
        body = make_client(admin_user).get(bootcampers_url(finance_user)).json()
        assert body['bootcampers'] == []

    def test_asking_for_an_admin_is_404(self, db, admin_user):
        """Pedir la cartera de un administrador no es una lista vacía: no aplica."""
        assert make_client(admin_user).get(bootcampers_url(admin_user)).status_code == 404

    def test_asking_for_a_salesperson_is_404(self, db, admin_user, salesperson_user):
        assert make_client(admin_user).get(bootcampers_url(salesperson_user)).status_code == 404

    def test_asking_for_a_bootcamper_is_404(self, db, admin_user, bootcamper_user):
        assert make_client(admin_user).get(bootcampers_url(bootcamper_user)).status_code == 404


class TestConversionLeavesTheLink:
    def test_converting_a_lead_records_the_bootcamper(
        self, db, salesperson_user, program, assigned_lead
    ):
        """`Lead.bootcamper` sigue guardando quién trajo a cada bootcamper.

        Ya no alimenta la cartera de cobro, pero es el único rastro del vendedor
        que hizo la conversión.
        """
        from apps.leads.services import convert_lead_to_bootcamper

        assigned_lead.status = Lead.Status.QUALIFIED
        assigned_lead.save(update_fields=['status'])

        result = convert_lead_to_bootcamper(assigned_lead, {
            'cedula': '1713175071',
            'program_id': str(program.id),
            'email': 'converted.link@test.com',
        })

        assigned_lead.refresh_from_db()
        assert assigned_lead.bootcamper is not None
        assert str(assigned_lead.bootcamper_id) == result['bootcamper_id']
        assert assigned_lead.owner == salesperson_user
