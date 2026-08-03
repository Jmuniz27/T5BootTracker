"""Actividad comercial por vendedor, para el panel del administrador.

Mide volumen y resultado —leads, conversiones, sin contactar—, no plata: el
cobro es de Finanzas y se consulta en /api/users/finance/.
"""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Interaction, Lead

ACTIVITY_URL = '/api/users/salespeople/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def fila(admin_user, salesperson):
    cuerpo = make_client(admin_user).get(ACTIVITY_URL).json()
    return next(r for r in cuerpo if r['salesperson_id'] == str(salesperson.id))


@pytest.fixture
def lead_factory(db):
    contador = {'n': 0}

    def _make(owner=None, status=Lead.Status.NEW):
        contador['n'] += 1
        return Lead.objects.create(
            name=f'Lead {contador["n"]}',
            phone=f'09920000{contador["n"]:02d}',
            status=status,
            owner=owner,
        )

    return _make


def interactuar(lead, salesperson):
    return Interaction.objects.create(
        lead=lead,
        salesperson=salesperson,
        interaction_type=Interaction.InteractionType.CALL,
        outcome=Interaction.Outcome.CALL_AGAIN,
        notes='Llamada de prueba',
    )


class TestPermissions:
    def test_unauthenticated_rejected(self, db):
        assert APIClient().get(ACTIVITY_URL).status_code == 401

    def test_salesperson_rejected(self, db, salesperson_user):
        """No es una vista del vendedor: es del administrador sobre el vendedor."""
        assert make_client(salesperson_user).get(ACTIVITY_URL).status_code == 403

    def test_finance_rejected(self, db, finance_user):
        assert make_client(finance_user).get(ACTIVITY_URL).status_code == 403

    def test_bootcamper_rejected(self, db, bootcamper_user):
        assert make_client(bootcamper_user).get(ACTIVITY_URL).status_code == 403

    def test_admin_allowed(self, db, admin_user):
        assert make_client(admin_user).get(ACTIVITY_URL).status_code == 200

    @pytest.mark.parametrize('method', ['post', 'put', 'patch', 'delete'])
    def test_no_write_methods(self, db, admin_user, method):
        """El administrador mira y no interviene: sólo GET."""
        assert getattr(make_client(admin_user), method)(ACTIVITY_URL).status_code == 405


class TestActivityList:
    def test_admin_never_appears(self, db, admin_user):
        cuerpo = make_client(admin_user).get(ACTIVITY_URL).json()
        assert str(admin_user.id) not in [r['salesperson_id'] for r in cuerpo]

    def test_finance_never_appears(self, db, admin_user, finance_user):
        """Finanzas puede trabajar leads, pero acá se mide al equipo comercial."""
        cuerpo = make_client(admin_user).get(ACTIVITY_URL).json()
        assert str(finance_user.id) not in [r['salesperson_id'] for r in cuerpo]

    def test_salesperson_without_leads_shows_zeroes(self, db, admin_user, salesperson_user):
        row = fila(admin_user, salesperson_user)
        assert row['assigned_leads'] == 0
        assert row['converted_leads'] == 0
        assert row['uncontacted_leads'] == 0
        assert row['conversion_rate'] == 0.0

    def test_counts_only_their_own_leads(
        self, db, admin_user, salesperson_user, lead_factory
    ):
        otro = CustomUser.objects.create_user(
            email='vendedor.otro@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )
        lead_factory(owner=salesperson_user)
        lead_factory(owner=salesperson_user)
        lead_factory(owner=otro)
        lead_factory(owner=None)  # en el pool: no es de nadie

        cuerpo = make_client(admin_user).get(ACTIVITY_URL).json()
        by_id = {r['salesperson_id']: r for r in cuerpo}
        assert by_id[str(salesperson_user.id)]['assigned_leads'] == 2
        assert by_id[str(otro.id)]['assigned_leads'] == 1

    def test_converted_is_a_subset_of_assigned(
        self, db, admin_user, salesperson_user, lead_factory
    ):
        """El lead convertido conserva su dueño, así que sigue contando como asignado."""
        lead_factory(owner=salesperson_user)
        lead_factory(owner=salesperson_user, status=Lead.Status.CONVERTED)

        row = fila(admin_user, salesperson_user)
        assert row['assigned_leads'] == 2
        assert row['converted_leads'] == 1
        assert row['conversion_rate'] == 50.0

    def test_conversion_rate_is_rounded_to_one_decimal(
        self, db, admin_user, salesperson_user, lead_factory
    ):
        for _ in range(3):
            lead_factory(owner=salesperson_user)
        lead_factory(owner=salesperson_user, status=Lead.Status.CONVERTED)

        assert fila(admin_user, salesperson_user)['conversion_rate'] == 25.0

    def test_uncontacted_counts_leads_without_interactions(
        self, db, admin_user, salesperson_user, lead_factory
    ):
        sin_tocar = lead_factory(owner=salesperson_user)  # noqa: F841 — cuenta como sin contactar
        trabajado = lead_factory(owner=salesperson_user)
        interactuar(trabajado, salesperson_user)

        row = fila(admin_user, salesperson_user)
        assert row['assigned_leads'] == 2
        assert row['uncontacted_leads'] == 1

    def test_converted_leads_are_not_counted_as_uncontacted(
        self, db, admin_user, salesperson_user, lead_factory
    ):
        """Convertir sin registrar interacción es raro, pero no es 'sin arrancar'."""
        lead_factory(owner=salesperson_user, status=Lead.Status.CONVERTED)

        row = fila(admin_user, salesperson_user)
        assert row['converted_leads'] == 1
        assert row['uncontacted_leads'] == 0

    def test_interactions_do_not_inflate_the_counts(
        self, db, admin_user, salesperson_user, lead_factory
    ):
        """Regresión: contar sobre el JOIN de interacciones multiplicaba el lead.

        Un solo lead con tres interacciones tiene que seguir siendo un lead.
        """
        lead = lead_factory(owner=salesperson_user)
        for _ in range(3):
            interactuar(lead, salesperson_user)

        row = fila(admin_user, salesperson_user)
        assert row['assigned_leads'] == 1
        assert row['uncontacted_leads'] == 0

    def test_inactive_salesperson_is_omitted(self, db, admin_user, salesperson_user):
        salesperson_user.is_active = False
        salesperson_user.save(update_fields=['is_active'])

        cuerpo = make_client(admin_user).get(ACTIVITY_URL).json()
        assert str(salesperson_user.id) not in [r['salesperson_id'] for r in cuerpo]
