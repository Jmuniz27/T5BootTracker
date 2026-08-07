"""Reparto en lote del pool de cobro (#326).

La clienta objetó el reparto de a uno: en su día a día casi toda la cartera va a
la misma persona de Finanzas y sólo las empresas van a otra, así que asignar
individualmente son N clics para el mismo gesto.
"""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.payments.models import BootcamperAssignmentSetting

BULK_URL = '/api/payments/bootcampers/bulk-assign/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


@pytest.fixture
def pool(db, program):
    """Tres bootcampers sin responsable de cobro.

    Con inscripción activa a propósito: la tarjeta del pool se arma por par
    (bootcamper, programa), así que sin ella la respuesta vendría vacía aunque
    la asignación sí hubiera ocurrido.
    """
    from apps.programs.models import Enrollment

    bootcampers = [
        CustomUser.objects.create_user(
            email=f'pool{i}@test.com', password='testpass123',
            first_name=f'Pool{i}', last_name='Bootcamper',
            role=CustomUser.Role.BOOTCAMPER,
        )
        for i in range(3)
    ]
    for bootcamper in bootcampers:
        Enrollment.objects.create(
            bootcamper=bootcamper, bootcamp=program, status=Enrollment.Status.ACTIVE,
            start_date=program.start_date, agreed_price=program.total_cost,
        )
    return bootcampers


class TestBulkAssign:
    def test_el_admin_reparte_la_tanda_completa(self, db, admin_user, finance_user, pool):
        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [str(b.id) for b in pool],
            'finance_owner_id': str(finance_user.id),
        }, format='json')

        assert resp.status_code == 200
        assert len(resp.json()['assigned']) == 3
        assert resp.json()['failed'] == []
        for bootcamper in pool:
            bootcamper.refresh_from_db()
            assert bootcamper.finance_owner == finance_user
            assert bootcamper.finance_assigned_at is not None

    def test_finanzas_se_asigna_la_tanda_a_si_misma(self, db, finance_user, pool):
        resp = make_client(finance_user).patch(BULK_URL, {
            'bootcamper_ids': [str(b.id) for b in pool],
        }, format='json')

        assert resp.status_code == 200
        pool[0].refresh_from_db()
        assert pool[0].finance_owner == finance_user

    def test_uno_que_falla_no_tumba_al_resto(self, db, admin_user, finance_user, other_finance_user, pool):
        # El del medio ya lo tomó otra persona mientras se armaba la tanda.
        pool[1].finance_owner = other_finance_user
        pool[1].save(update_fields=['finance_owner'])

        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [str(b.id) for b in pool],
            'finance_owner_id': str(finance_user.id),
        }, format='json')

        assert resp.status_code == 200
        data = resp.json()
        assert len(data['assigned']) == 2
        assert len(data['failed']) == 1
        assert data['failed'][0]['code'] == 'BOOTCAMPER_ALREADY_ASSIGNED'
        assert data['failed'][0]['bootcamper_id'] == str(pool[1].id)

        # Los otros dos sí quedaron asignados: no se revirtió la tanda.
        pool[0].refresh_from_db()
        pool[2].refresh_from_db()
        assert pool[0].finance_owner == finance_user
        assert pool[2].finance_owner == finance_user
        # Y el conflictivo mantiene a su dueño original.
        pool[1].refresh_from_db()
        assert pool[1].finance_owner == other_finance_user

    def test_un_id_inexistente_se_reporta_sin_romper(self, db, admin_user, finance_user, pool):
        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [str(pool[0].id), '11111111-1111-1111-1111-111111111111'],
            'finance_owner_id': str(finance_user.id),
        }, format='json')

        assert resp.status_code == 200
        assert len(resp.json()['assigned']) == 1
        assert resp.json()['failed'][0]['code'] == 'BOOTCAMPER_NOT_FOUND'

    def test_una_lista_vacia_se_rechaza(self, db, admin_user, finance_user):
        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [], 'finance_owner_id': str(finance_user.id),
        }, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'BOOTCAMPER_IDS_REQUIRED'

    def test_una_tanda_desmedida_se_rechaza(self, db, admin_user, finance_user):
        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [str(finance_user.id)] * 201,
            'finance_owner_id': str(finance_user.id),
        }, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'BULK_LIMIT_EXCEEDED'

    def test_el_admin_debe_decir_a_quien_asigna(self, db, admin_user, pool):
        # No tiene cartera propia: asignárselo a sí mismo no querría decir nada.
        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [str(pool[0].id)],
        }, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'FINANCE_OWNER_REQUIRED'

    def test_no_se_puede_asignar_a_alguien_que_no_es_de_finanzas(self, db, admin_user, salesperson_user, pool):
        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [str(pool[0].id)],
            'finance_owner_id': str(salesperson_user.id),
        }, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_FINANCE_OWNER'

    def test_un_bootcamper_no_puede_repartir(self, db, bootcamper_user, pool):
        resp = make_client(bootcamper_user).patch(BULK_URL, {
            'bootcamper_ids': [str(pool[0].id)],
        }, format='json')

        assert resp.status_code == 403

    def test_respeta_el_control_de_auto_asignacion(self, db, finance_user, pool):
        # Mismo gate que la asignación individual: si el admin lo apagó, el lote
        # tampoco puede ser la puerta de atrás.
        setting = BootcamperAssignmentSetting.get_solo()
        setting.self_assign_enabled = False
        setting.save(update_fields=['self_assign_enabled'])

        resp = make_client(finance_user).patch(BULK_URL, {
            'bootcamper_ids': [str(pool[0].id)],
        }, format='json')

        assert resp.status_code == 403
        assert resp.json()['code'] == 'SELF_ASSIGNMENT_DISABLED'

    def test_el_admin_reparte_aunque_la_auto_asignacion_este_apagada(self, db, admin_user, finance_user, pool):
        # Apagarla es justamente dejar el reparto en manos del administrador.
        setting = BootcamperAssignmentSetting.get_solo()
        setting.self_assign_enabled = False
        setting.save(update_fields=['self_assign_enabled'])

        resp = make_client(admin_user).patch(BULK_URL, {
            'bootcamper_ids': [str(pool[0].id)],
            'finance_owner_id': str(finance_user.id),
        }, format='json')

        assert resp.status_code == 200
