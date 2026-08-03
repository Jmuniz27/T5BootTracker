"""Cartera de bootcampers por vendedor, para el panel del administrador."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead
from apps.payments.models import Payment

PORTFOLIO_URL = '/api/users/salespeople/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def bootcampers_url(salesperson):
    return f'/api/users/salespeople/{salesperson.id}/bootcampers/'


@pytest.fixture
def bootcamper_factory(db):
    def _make(email, cedula=None):
        return CustomUser.objects.create_user(
            email=email, password='testpass123',
            first_name='Boot', last_name=email.split('@')[0],
            role=CustomUser.Role.BOOTCAMPER, cedula=cedula,
        )
    return _make


def link(salesperson, bootcamper, phone):
    """Un lead convertido: es lo que ata al bootcamper con su vendedor."""
    return Lead.objects.create(
        name=bootcamper.get_full_name(), phone=phone,
        status=Lead.Status.CONVERTED, owner=salesperson, bootcamper=bootcamper,
    )


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

    def test_salesperson_cannot_read_even_their_own(self, db, salesperson_user):
        """No es una vista del vendedor: es del administrador sobre el vendedor."""
        resp = make_client(salesperson_user).get(bootcampers_url(salesperson_user))
        assert resp.status_code == 403

    def test_admin_allowed(self, db, admin_user):
        assert make_client(admin_user).get(PORTFOLIO_URL).status_code == 200

    @pytest.mark.parametrize('method', ['post', 'put', 'patch', 'delete'])
    def test_no_write_methods(self, db, admin_user, salesperson_user, method):
        """El administrador mira y no interviene: sólo GET."""
        client = make_client(admin_user)
        resp = getattr(client, method)(bootcampers_url(salesperson_user))
        assert resp.status_code == 405


class TestPortfolioList:
    def test_admin_never_appears_as_a_salesperson(self, db, admin_user):
        rows = make_client(admin_user).get(PORTFOLIO_URL).json()
        assert str(admin_user.id) not in [r['salesperson_id'] for r in rows]

    def test_salesperson_without_bootcampers_shows_zeroes(self, db, admin_user, salesperson_user):
        rows = make_client(admin_user).get(PORTFOLIO_URL).json()
        row = next(r for r in rows if r['salesperson_id'] == str(salesperson_user.id))
        assert row['bootcamper_count'] == 0
        assert Decimal(row['total_paid']) == Decimal('0.00')
        assert row['critical_count'] == 0

    def test_counts_only_their_own_bootcampers(
        self, db, admin_user, salesperson_user, bootcamper_factory
    ):
        other = CustomUser.objects.create_user(
            email='vendedor.otro@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )
        link(salesperson_user, bootcamper_factory('uno@test.com'), '0990001')
        link(salesperson_user, bootcamper_factory('dos@test.com'), '0990002')
        link(other, bootcamper_factory('tres@test.com'), '0990003')

        rows = make_client(admin_user).get(PORTFOLIO_URL).json()
        by_id = {r['salesperson_id']: r for r in rows}
        assert by_id[str(salesperson_user.id)]['bootcamper_count'] == 2
        assert by_id[str(other.id)]['bootcamper_count'] == 1

    def test_released_lead_no_longer_counts(
        self, db, admin_user, salesperson_user, bootcamper_factory
    ):
        """Un lead liberado no le pertenece a nadie, así que su bootcamper tampoco."""
        lead = link(salesperson_user, bootcamper_factory('libre@test.com'), '0990004')
        lead.owner = None
        lead.save(update_fields=['owner'])

        rows = make_client(admin_user).get(PORTFOLIO_URL).json()
        row = next(r for r in rows if r['salesperson_id'] == str(salesperson_user.id))
        assert row['bootcamper_count'] == 0

    def test_money_adds_up_across_bootcampers(
        self, db, admin_user, salesperson_user, program, bootcamper_factory
    ):
        uno = bootcamper_factory('pago1@test.com')
        dos = bootcamper_factory('pago2@test.com')
        link(salesperson_user, uno, '0990005')
        link(salesperson_user, dos, '0990006')
        pay(uno, program, Decimal('400.00'))
        pay(dos, program, Decimal('200.00'))

        rows = make_client(admin_user).get(PORTFOLIO_URL).json()
        row = next(r for r in rows if r['salesperson_id'] == str(salesperson_user.id))
        assert Decimal(row['total_paid']) == Decimal('600.00')
        # Dos pares bootcamper/programa, cada uno esperando el costo del programa.
        assert Decimal(row['expected_amount']) == program.total_cost * 2

    def test_pending_payments_do_not_count_as_paid(
        self, db, admin_user, salesperson_user, program, bootcamper_factory
    ):
        bc = bootcamper_factory('pendiente@test.com')
        link(salesperson_user, bc, '0990007')
        pay(bc, program, Decimal('300.00'), status=Payment.Status.PENDING)

        rows = make_client(admin_user).get(PORTFOLIO_URL).json()
        row = next(r for r in rows if r['salesperson_id'] == str(salesperson_user.id))
        assert Decimal(row['total_paid']) == Decimal('0.00')

    def test_critical_is_counted_per_pair_not_over_the_total(
        self, db, admin_user, salesperson_user, program, bootcamper_factory
    ):
        """Uno al día no debe tapar a otro en crítico: se evalúa par por par."""
        al_dia = bootcamper_factory('aldia@test.com')
        critico = bootcamper_factory('critico@test.com')
        link(salesperson_user, al_dia, '0990008')
        link(salesperson_user, critico, '0990009')
        pay(al_dia, program, program.total_cost)          # sin déficit
        pay(critico, program, Decimal('0.00'))            # déficit total

        rows = make_client(admin_user).get(PORTFOLIO_URL).json()
        row = next(r for r in rows if r['salesperson_id'] == str(salesperson_user.id))
        assert row['critical_count'] == 1


class TestSalespersonBootcampers:
    def test_lists_their_bootcampers_with_summary(
        self, db, admin_user, salesperson_user, program, bootcamper_factory
    ):
        bc = bootcamper_factory('detalle@test.com')
        link(salesperson_user, bc, '0990010')
        pay(bc, program, Decimal('500.00'))
        pay(bc, program, Decimal('100.00'), status=Payment.Status.PENDING)

        body = make_client(admin_user).get(bootcampers_url(salesperson_user)).json()
        assert body['salesperson_id'] == str(salesperson_user.id)
        assert len(body['bootcampers']) == 1

        row = body['bootcampers'][0]
        assert row['bootcamper_id'] == str(bc.id)
        assert Decimal(row['total_paid']) == Decimal('500.00')
        assert row['pending_payments'] == 1
        assert row['program_count'] == 1

    def test_empty_for_a_salesperson_without_bootcampers(self, db, admin_user, salesperson_user):
        body = make_client(admin_user).get(bootcampers_url(salesperson_user)).json()
        assert body['bootcampers'] == []

    def test_asking_for_an_admin_is_404(self, db, admin_user):
        """Pedir la cartera de un administrador no es una lista vacía: no aplica."""
        resp = make_client(admin_user).get(bootcampers_url(admin_user))
        assert resp.status_code == 404

    def test_asking_for_a_bootcamper_is_404(self, db, admin_user, bootcamper_user):
        resp = make_client(admin_user).get(bootcampers_url(bootcamper_user))
        assert resp.status_code == 404


class TestConversionLeavesTheLink:
    def test_converting_a_lead_records_the_bootcamper(
        self, db, salesperson_user, program, assigned_lead
    ):
        """Sin este enlace no se puede reconstruir quién trajo a cada bootcamper."""
        from apps.leads.services import convert_lead_to_bootcamper

        result = convert_lead_to_bootcamper(assigned_lead, {
            'cedula': '1713175071',
            'program_id': str(program.id),
            'email': 'converted.link@test.com',
        })

        assigned_lead.refresh_from_db()
        assert assigned_lead.bootcamper is not None
        assert str(assigned_lead.bootcamper_id) == result['bootcamper_id']
        assert assigned_lead.owner == salesperson_user
