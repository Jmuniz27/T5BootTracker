"""Cada interacción sella el estado en que quedó el lead (#325).

La propuesta salió en la demo del 05 ago y la clienta la dio por buena: "incluso
si tienen varias interacciones y en varias se mantiene como interesada, la última
puede ser que diga que ya no está interesado".
"""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.leads.models import Interaction, Lead
from apps.leads.services import discard_lead, reassign_lead_by_admin, restore_lead

LEADS_URL = '/api/leads/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def registrar(client, lead, outcome, notes='Conversación'):
    return client.post(f'{LEADS_URL}{lead.id}/interactions/', {
        'interaction_type': 'WHATSAPP',
        'outcome': outcome,
        'interest_level': 3,
        'notes': notes,
    }, format='json')


class TestInteractionLeadStatus:
    def test_sella_el_estado_resultante_no_el_anterior(self, db, salesperson_user, assigned_lead):
        # SCHEDULE_VISIT mueve el lead a QUALIFIED. La interacción se crea
        # antes de recalcular el estado, así que este test es el que evita que se
        # grabe el estado viejo.
        assigned_lead.status = Lead.Status.INTERESTED
        assigned_lead.save(update_fields=['status'])

        resp = registrar(make_client(salesperson_user), assigned_lead, 'SCHEDULE_VISIT')

        assert resp.status_code == 201
        assigned_lead.refresh_from_db()
        interaccion = Interaction.objects.get(pk=resp.json()['id'])
        assert interaccion.lead_status == assigned_lead.status
        assert interaccion.lead_status == Lead.Status.QUALIFIED

    def test_el_historial_muestra_la_evolucion(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        assigned_lead.status = Lead.Status.INTERESTED
        assigned_lead.save(update_fields=['status'])

        registrar(client, assigned_lead, 'SEND_INFO', 'Sigue interesada')
        registrar(client, assigned_lead, 'SCHEDULE_VISIT', 'Lista para convertir')

        historial = client.get(f'{LEADS_URL}{assigned_lead.id}/interactions/').json()
        # El endpoint ordena de la más nueva a la más vieja.
        assert [i['lead_status'] for i in historial] == [
            Lead.Status.QUALIFIED, Lead.Status.INTERESTED,
        ]

    def test_expone_la_etiqueta_legible(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        registrar(client, assigned_lead, 'SCHEDULE_VISIT')

        historial = client.get(f'{LEADS_URL}{assigned_lead.id}/interactions/').json()
        assert historial[0]['lead_status_display'] == 'Calificado'

    def test_un_lead_nuevo_queda_interesado_y_se_sella_asi(self, db, salesperson_user, sample_lead):
        # Registrar cualquier interacción sobre un lead NEW lo pasa a INTERESTED.
        sample_lead.owner = salesperson_user
        sample_lead.save(update_fields=['owner'])

        resp = registrar(make_client(salesperson_user), sample_lead, 'AWAIT_REPLY')

        interaccion = Interaction.objects.get(pk=resp.json()['id'])
        assert interaccion.lead_status == Lead.Status.INTERESTED

    def test_el_cliente_no_puede_escribir_el_estado(self, db, salesperson_user, assigned_lead):
        # Es de sólo lectura: aceptarlo sería dejar escribir historia.
        resp = make_client(salesperson_user).post(
            f'{LEADS_URL}{assigned_lead.id}/interactions/', {
                'interaction_type': 'WHATSAPP',
                'outcome': 'AWAIT_REPLY',
                'interest_level': 3,
                'notes': 'Intento de forzar el estado',
                'lead_status': Lead.Status.CONVERTED,
            }, format='json')

        assert resp.status_code == 201
        interaccion = Interaction.objects.get(pk=resp.json()['id'])
        assert interaccion.lead_status != Lead.Status.CONVERTED

    def test_la_reasignacion_tambien_lo_registra(self, db, admin_user, salesperson_user, assigned_lead):
        # Una reasignación no cambia el estado, pero si no lo sellara el historial
        # tendría huecos y no se podría leer de corrido.
        reassign_lead_by_admin(assigned_lead.pk, admin_user, None)

        evento = Interaction.objects.filter(
            lead=assigned_lead, interaction_type=Interaction.InteractionType.SYSTEM,
        ).first()
        assert evento.lead_status == Lead.Status.INTERESTED

    def test_el_descarte_y_su_reversion_quedan_sellados(self, db, salesperson_user, assigned_lead):
        discard_lead(assigned_lead.pk, salesperson_user, 'NO_BUDGET', '')
        descarte = Interaction.objects.filter(
            lead=assigned_lead, outcome=Interaction.Outcome.DISCARDED,
        ).first()
        assert descarte.lead_status == Lead.Status.DISCARDED

        restore_lead(assigned_lead.pk, salesperson_user)
        reactivacion = Interaction.objects.filter(
            lead=assigned_lead, outcome=Interaction.Outcome.RESTORED,
        ).first()
        # Vuelve al estado que tenía, y eso es lo que se sella.
        assert reactivacion.lead_status == Lead.Status.INTERESTED
