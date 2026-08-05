"""Control global de auto-asignación del pool de bootcampers.

Espejo del de leads (CR-004), aplicado al cobro.
"""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.payments.models import BootcamperAssignmentSetting

SETTING_URL = '/api/payments/settings/self-assignment/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def assign_url(bootcamper):
    return f'/api/payments/bootcampers/{bootcamper.id}/assign/'


@pytest.fixture
def finance_user(db):
    return CustomUser.objects.create_user(
        email='finanzas.toggle@test.com', password='testpass123',
        first_name='Finanzas', last_name='Toggle', role=CustomUser.Role.FINANCE,
    )


def disable(admin):
    make_client(admin).patch(SETTING_URL, {'self_assign_enabled': False}, format='json')


class TestSettingPermissions:
    def test_unauthenticated_rejected(self, db):
        assert APIClient().get(SETTING_URL).status_code == 401

    def test_finance_can_read(self, db, finance_user):
        """Finanzas necesita saber si su botón está habilitado."""
        assert make_client(finance_user).get(SETTING_URL).status_code == 200

    def test_admin_can_read(self, db, admin_user):
        assert make_client(admin_user).get(SETTING_URL).status_code == 200

    def test_salesperson_cannot_read(self, db, salesperson_user):
        assert make_client(salesperson_user).get(SETTING_URL).status_code == 403

    def test_finance_cannot_change_it(self, db, finance_user):
        """Es un control del Administrador sobre Finanzas, no de Finanzas."""
        resp = make_client(finance_user).patch(
            SETTING_URL, {'self_assign_enabled': False}, format='json',
        )
        assert resp.status_code == 403

    def test_admin_can_change_it(self, db, admin_user):
        resp = make_client(admin_user).patch(
            SETTING_URL, {'self_assign_enabled': False}, format='json',
        )
        assert resp.status_code == 200
        assert resp.json()['self_assign_enabled'] is False


class TestSettingContent:
    def test_enabled_by_default(self, db, admin_user):
        """Nadie queda bloqueado por no haber tocado nunca el control."""
        assert make_client(admin_user).get(SETTING_URL).json()['self_assign_enabled'] is True

    def test_records_who_changed_it(self, db, admin_user):
        make_client(admin_user).patch(SETTING_URL, {'self_assign_enabled': False}, format='json')

        body = make_client(admin_user).get(SETTING_URL).json()
        assert body['updated_by_name'] == admin_user.get_full_name()
        assert body['updated_at'] is not None

    def test_missing_field_is_rejected(self, db, admin_user):
        resp = make_client(admin_user).patch(SETTING_URL, {}, format='json')
        assert resp.status_code == 400
        assert resp.json()['code'] == 'MISSING_FIELD'

    def test_it_is_a_singleton(self, db, admin_user):
        make_client(admin_user).patch(SETTING_URL, {'self_assign_enabled': False}, format='json')
        make_client(admin_user).patch(SETTING_URL, {'self_assign_enabled': True}, format='json')

        assert BootcamperAssignmentSetting.objects.count() == 1


class TestGateOnAssign:
    def test_finance_cannot_self_assign_when_disabled(
        self, db, admin_user, finance_user, converted_bootcamper
    ):
        disable(admin_user)

        resp = make_client(finance_user).patch(assign_url(converted_bootcamper))

        assert resp.status_code == 403
        assert resp.json()['code'] == 'SELF_ASSIGNMENT_DISABLED'
        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id is None

    def test_finance_can_self_assign_when_enabled(
        self, db, finance_user, converted_bootcamper
    ):
        resp = make_client(finance_user).patch(assign_url(converted_bootcamper))

        assert resp.status_code == 200
        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id == finance_user.id

    def test_admin_still_distributes_when_disabled(
        self, db, admin_user, finance_user, converted_bootcamper
    ):
        """Apagarlo deja el reparto en manos del Administrador: no puede bloquearlo a él."""
        disable(admin_user)

        resp = make_client(admin_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': str(finance_user.id)},
            format='json',
        )

        assert resp.status_code == 200
        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id == finance_user.id

    def test_releasing_still_works_when_disabled(
        self, db, admin_user, finance_user, converted_bootcamper
    ):
        """El control es sobre tomar del pool, no sobre devolver."""
        converted_bootcamper.finance_owner = finance_user
        converted_bootcamper.save(update_fields=['finance_owner'])
        disable(admin_user)

        resp = make_client(finance_user).patch(
            f'/api/payments/bootcampers/{converted_bootcamper.id}/release/'
        )

        assert resp.status_code == 200

    def test_already_assigned_is_untouched_when_disabled(
        self, db, admin_user, finance_user, converted_bootcamper
    ):
        """No reasigna nada de lo ya repartido: sólo frena tomar del pool."""
        converted_bootcamper.finance_owner = finance_user
        converted_bootcamper.save(update_fields=['finance_owner'])

        disable(admin_user)

        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id == finance_user.id
