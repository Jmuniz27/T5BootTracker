"""Cierre de leads con motivo obligatorio (#324).

La clienta lo pidió para poder "rayar los que ya no los llames" y saber por qué
se cae cada uno. NOT_INTERESTED no servía: mezclaba a quien nunca mostró interés
con quien se cayó al final, y no guardaba la razón.
"""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Interaction, Lead

LEADS_URL = '/api/leads/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def discard_url(lead):
    return f'{LEADS_URL}{lead.id}/discard/'


def restore_url(lead):
    return f'{LEADS_URL}{lead.id}/restore/'


class TestDiscardLead:
    def test_descarta_con_motivo_y_detalle(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)

        resp = client.patch(discard_url(assigned_lead), {
            'reason': 'NO_BUDGET', 'detail': 'Dijo que no le alcanza este año.',
        }, format='json')

        assert resp.status_code == 200
        assigned_lead.refresh_from_db()
        assert assigned_lead.status == Lead.Status.DISCARDED
        assert assigned_lead.discard_reason == 'NO_BUDGET'
        assert assigned_lead.discard_detail == 'Dijo que no le alcanza este año.'
        assert assigned_lead.discarded_by == salesperson_user
        assert assigned_lead.discarded_at is not None

    def test_descartar_desasigna_el_lead(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)

        resp = client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')

        assert resp.status_code == 200
        assigned_lead.refresh_from_db()
        # Al descartar, el lead se desasigna del vendedor (queda disponible al reactivar).
        assert assigned_lead.owner is None
        assert assigned_lead.released_at is not None

    def test_el_motivo_es_obligatorio(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)

        resp = client.patch(discard_url(assigned_lead), {}, format='json')

        assert resp.status_code == 400
        assigned_lead.refresh_from_db()
        assert assigned_lead.status != Lead.Status.DISCARDED

    def test_un_motivo_inventado_se_rechaza(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)

        resp = client.patch(discard_url(assigned_lead), {'reason': 'PORQUE_SI'}, format='json')

        assert resp.status_code == 400

    def test_con_otro_el_detalle_es_obligatorio(self, db, salesperson_user, assigned_lead):
        # "Otro" sin explicación no aporta nada al reporte.
        client = make_client(salesperson_user)

        resp = client.patch(discard_url(assigned_lead), {'reason': 'OTHER'}, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'DISCARD_DETAIL_REQUIRED'

    def test_con_otro_y_detalle_pasa(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)

        resp = client.patch(discard_url(assigned_lead), {
            'reason': 'OTHER', 'detail': 'Se mudó del país.',
        }, format='json')

        assert resp.status_code == 200

    def test_deja_rastro_de_sistema_en_el_historial(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'SCHEDULE'}, format='json')

        evento = Interaction.objects.filter(
            lead=assigned_lead, interaction_type=Interaction.InteractionType.SYSTEM,
        ).latest('created_at')
        assert evento.outcome == Interaction.Outcome.DISCARDED
        assert 'horarios' in evento.notes.lower()

    def test_no_se_puede_descartar_dos_veces(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_RESPONSE'}, format='json')

        resp = client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'LEAD_ALREADY_DISCARDED'

    def test_no_se_puede_descartar_un_convertido(self, db, salesperson_user, assigned_lead):
        # Ya es bootcamper: cerrarlo dejaría su inscripción colgando.
        assigned_lead.status = Lead.Status.CONVERTED
        assigned_lead.save(update_fields=['status'])
        client = make_client(salesperson_user)

        resp = client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'LEAD_ALREADY_CONVERTED'

    def test_un_vendedor_ajeno_no_puede_descartarlo(self, db, assigned_lead):
        otro = CustomUser.objects.create_user(
            email='otro.sales@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )

        resp = make_client(otro).patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')

        assert resp.status_code == 403

    def test_el_administrador_puede_descartar_cualquiera(self, db, admin_user, assigned_lead):
        resp = make_client(admin_user).patch(
            discard_url(assigned_lead), {'reason': 'FREE_ONLY'}, format='json',
        )

        assert resp.status_code == 200

    def test_el_patch_generico_no_puede_descartar(self, db, salesperson_user, assigned_lead):
        # Si se pudiera, sería una puerta trasera para cerrar leads sin motivo.
        client = make_client(salesperson_user)

        resp = client.patch(
            f'{LEADS_URL}{assigned_lead.id}/', {'status': 'DISCARDED'}, format='json',
        )

        assert resp.status_code == 400
        assigned_lead.refresh_from_db()
        assert assigned_lead.status != Lead.Status.DISCARDED

    def test_un_lead_descartado_no_se_puede_convertir(self, db, salesperson_user, assigned_lead, program):
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')

        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/convert/', {
            'cedula': '0919184141', 'program_id': str(program.id), 'email': 'x@test.com',
        }, format='json')

        # Descartado y desasignado: la conversión queda bloqueada y no se convierte.
        assert resp.status_code in (400, 403)
        assigned_lead.refresh_from_db()
        assert assigned_lead.status == Lead.Status.DISCARDED


class TestDiscardedLeadVisibility:
    def test_no_aparece_en_el_listado_por_defecto(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_RESPONSE'}, format='json')

        data = client.get(LEADS_URL).json()
        todas = data['my_leads'] + data['available_leads']
        assert str(assigned_lead.id) not in [row['id'] for row in todas]

    def test_se_ve_al_filtrar_por_el_estado(self, db, salesperson_user, assigned_lead):
        # Es lo que la clienta va a exportar: "los que ya no los llames".
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_RESPONSE'}, format='json')

        data = client.get(LEADS_URL, {'estado': 'DISCARDED'}).json()
        # Descartar desasigna: el lead se ve al filtrar, ahora en available_leads.
        fila = next(r for r in data['available_leads'] if r['id'] == str(assigned_lead.id))
        assert fila['discard_reason'] == 'NO_RESPONSE'
        assert fila['discard_reason_display'] == 'No responde / los correos rebotan'

    def test_los_no_descartados_siguen_apareciendo(self, db, salesperson_user, assigned_lead, sample_lead):
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')

        data = client.get(LEADS_URL).json()
        disponibles = [row['id'] for row in data['available_leads']]
        assert str(sample_lead.id) in disponibles


class TestRestoreLead:
    def test_devuelve_el_lead_al_estado_que_tenia(self, db, salesperson_user, assigned_lead):
        # assigned_lead nace INTERESTED; tras deshacer debe volver a serlo, no a NEW.
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')

        resp = client.patch(restore_url(assigned_lead), {}, format='json')

        assert resp.status_code == 200
        assigned_lead.refresh_from_db()
        assert assigned_lead.status == Lead.Status.INTERESTED
        assert assigned_lead.discard_reason == ''
        assert assigned_lead.discarded_at is None
        assert assigned_lead.discarded_by is None

    def test_no_se_puede_reactivar_uno_que_no_esta_descartado(self, db, salesperson_user, assigned_lead):
        resp = make_client(salesperson_user).patch(restore_url(assigned_lead), {}, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'LEAD_NOT_DISCARDED'

    def test_deja_rastro_de_sistema(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')
        client.patch(restore_url(assigned_lead), {}, format='json')

        evento = Interaction.objects.filter(
            lead=assigned_lead, interaction_type=Interaction.InteractionType.SYSTEM,
        ).latest('created_at')
        assert evento.outcome == Interaction.Outcome.RESTORED

    def test_vuelve_a_aparecer_en_el_listado(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        client.patch(discard_url(assigned_lead), {'reason': 'NO_BUDGET'}, format='json')
        client.patch(restore_url(assigned_lead), {}, format='json')

        data = client.get(LEADS_URL).json()
        # Al descartar se desasignó, así que reactivado vuelve a Disponibles, no a Mis leads.
        assert str(assigned_lead.id) in [row['id'] for row in data['available_leads']]
        assert str(assigned_lead.id) not in [row['id'] for row in data['my_leads']]


@pytest.mark.parametrize('reason', [c.value for c in Lead.DiscardReason])
def test_todas_las_causales_del_modelo_son_aceptadas(db, salesperson_user, assigned_lead, reason):
    resp = make_client(salesperson_user).patch(
        discard_url(assigned_lead), {'reason': reason, 'detail': 'detalle'}, format='json',
    )
    assert resp.status_code == 200
