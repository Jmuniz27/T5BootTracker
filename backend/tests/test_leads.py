"""Tests for leads API endpoints."""
import threading
from datetime import timedelta

import pytest
from django.utils import timezone
from django.db import connection
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead, Interaction
from apps.programs.models import Program

LEADS_URL = '/api/leads/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


# ==========================================
# FIXTURES
# ==========================================

@pytest.fixture
def program(db):
    """Fixture para crear un programa de prueba con todos sus campos requeridos."""
    start = timezone.now().date() + timedelta(days=10)
    return Program.objects.create(
        name='Full Stack Bootcamp',
        start_date=start,
        end_date=start + timedelta(days=100),
        total_cost=1500.00
    )

@pytest.fixture
def qualified_lead(db, salesperson_user):
    """Fixture for a lead ready to be converted (Status: QUALIFIED)."""
    return Lead.objects.create(
        name='Juan Perez',
        phone='0991234567',
        email='juan.perez@test.com',
        status=Lead.Status.QUALIFIED,
        owner=salesperson_user
    )

# ==========================================
# LEAD CRUD & LISTING TESTS
# ==========================================

class TestLeadList:
    def test_lead_list_returns_my_and_available(self, db, salesperson_user, sample_lead, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert 'my_leads' in data
        assert 'available_leads' in data

        my_ids = [lead['id'] for lead in data['my_leads']]
        available_ids = [lead['id'] for lead in data['available_leads']]
        assert str(assigned_lead.id) in my_ids
        assert str(sample_lead.id) in available_ids

    def test_lead_list_unauthorized_for_bootcamper(self, db, bootcamper_user):
        client = make_client(bootcamper_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 403

    def test_converted_leads_visible_to_all_with_converter_name(self, db, salesperson_user):
        other = CustomUser.objects.create_user(
            email='other.sales@test.com',
            password='testpass123',
            first_name='Zahid',
            last_name='Diaz',
            role=CustomUser.Role.SALESPERSON,
        )
        converted = Lead.objects.create(
            name='Converted Lead',
            phone='0993334444',
            status=Lead.Status.CONVERTED,
            owner=other,
        )

        client = make_client(salesperson_user)
        data = client.get(LEADS_URL).json()

        converted_ids = [lead['id'] for lead in data['converted_leads']]
        assert str(converted.id) in converted_ids
        # No es mío ni está disponible: solo aparece en converted_leads.
        assert str(converted.id) not in [lead['id'] for lead in data['my_leads']]
        assert str(converted.id) not in [lead['id'] for lead in data['available_leads']]
        row = next(lead for lead in data['converted_leads'] if lead['id'] == str(converted.id))
        assert row['owner_name'] == 'Zahid Diaz'

    def test_converted_lead_row_includes_bootcamper_profile(self, db, salesperson_user):
        # El dashboard web arma "Ver lead" con el row del listado (no pide el
        # detalle); sin bootcamper_profile no puede mostrar el estado de la
        # cuenta (Invitado/Pendiente/Verificado) ni el botón de verificar.
        bootcamper = CustomUser.objects.create_user(
            email='boot.profile@test.com', password='testpass123',
            first_name='Boot', last_name='Camper', role=CustomUser.Role.BOOTCAMPER,
            verification_status=CustomUser.VerificationStatus.INVITED,
        )
        converted = Lead.objects.create(
            name='Con Perfil', phone='0993335555',
            status=Lead.Status.CONVERTED, owner=salesperson_user, bootcamper=bootcamper,
        )

        data = make_client(salesperson_user).get(LEADS_URL).json()

        row = next(lead for lead in data['converted_leads'] if lead['id'] == str(converted.id))
        assert row['bootcamper_profile'] is not None
        assert row['bootcamper_profile']['verification_status'] == 'INVITED'

    def test_converted_leads_excludes_active_leads(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        data = client.get(LEADS_URL).json()
        assert str(assigned_lead.id) not in [lead['id'] for lead in data['converted_leads']]

    def test_system_interactions_excluded_from_history_and_count(self, db, salesperson_user, assigned_lead):
        Interaction.objects.create(
            lead=assigned_lead, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.WHATSAPP,
            outcome=Interaction.Outcome.SEND_INFO, interest_level=4, notes='Hola',
        )
        Interaction.objects.create(
            lead=assigned_lead, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.SYSTEM,
            outcome=Interaction.Outcome.REASSIGNED, notes='Reasignado por admin',
        )
        client = make_client(salesperson_user)

        history = client.get(f'{LEADS_URL}{assigned_lead.id}/interactions/').json()
        assert [i['interaction_type'] for i in history] == ['WHATSAPP']

        data = client.get(LEADS_URL).json()
        row = next(lead for lead in data['my_leads'] if lead['id'] == str(assigned_lead.id))
        assert row['interaction_count'] == 1


class TestLeadListReportFields:
    """Campos que el reporte de leads (CB-58) exporta desde el listado.

    La clienta pidió tres fechas —asignación, primera y última interacción— más
    el último comentario registrado. Se anotan en LeadsListView._annotated_qs.
    """

    def _row(self, user, lead):
        data = make_client(user).get(LEADS_URL).json()
        todas = data['my_leads'] + data['available_leads']
        return next(row for row in todas if row['id'] == str(lead.id))

    def test_primera_y_ultima_interaccion_son_distintas(self, db, salesperson_user, assigned_lead):
        vieja = Interaction.objects.create(
            lead=assigned_lead, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.WHATSAPP,
            outcome=Interaction.Outcome.SEND_INFO, notes='Primer contacto',
        )
        nueva = Interaction.objects.create(
            lead=assigned_lead, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.CALL,
            outcome=Interaction.Outcome.CALL_AGAIN, notes='Le volví a escribir',
        )
        # auto_now_add las deja casi simultáneas; se separan para que el orden
        # sea inequívoco y el test no dependa de la resolución del reloj.
        vieja.created_at = timezone.now() - timedelta(days=10)
        vieja.save(update_fields=['created_at'])
        nueva.created_at = timezone.now() - timedelta(days=1)
        nueva.save(update_fields=['created_at'])

        row = self._row(salesperson_user, assigned_lead)
        assert row['first_interaction_at'][:10] == str(timezone.localtime(vieja.created_at).date())
        assert row['last_interaction_at'][:10] == str(timezone.localtime(nueva.created_at).date())
        assert row['last_note'] == 'Le volví a escribir'

    def test_una_sola_interaccion_deja_ambas_fechas_iguales(self, db, salesperson_user, assigned_lead):
        # La clienta lo dijo explícitamente: "si la última es igual a la primera
        # no importa, pero igual que estén ahí las fechas".
        Interaction.objects.create(
            lead=assigned_lead, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.WHATSAPP,
            outcome=Interaction.Outcome.AWAIT_REPLY, notes='Único contacto',
        )

        row = self._row(salesperson_user, assigned_lead)
        assert row['first_interaction_at'] == row['last_interaction_at']
        assert row['first_interaction_at'] is not None

    def test_lead_sin_interacciones_devuelve_nulos(self, db, salesperson_user, sample_lead):
        # Sin esto el reporte imprimiría "Invalid Date" en vez de una celda vacía.
        row = self._row(salesperson_user, sample_lead)
        assert row['first_interaction_at'] is None
        assert row['last_interaction_at'] is None
        assert row['last_note'] is None

    def test_los_eventos_de_sistema_no_cuentan_como_contacto(self, db, salesperson_user, assigned_lead):
        # Una reasignación no es un contacto con la persona: si contara, el
        # reporte diría que se le escribió cuando en realidad nadie lo hizo.
        Interaction.objects.create(
            lead=assigned_lead, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.SYSTEM,
            outcome=Interaction.Outcome.REASSIGNED, notes='Reasignado por admin',
        )

        row = self._row(salesperson_user, assigned_lead)
        assert row['first_interaction_at'] is None
        assert row['last_interaction_at'] is None
        assert row['last_note'] is None

    def test_el_listado_expone_la_fecha_de_asignacion(self, db, salesperson_user, assigned_lead):
        # Vivía sólo en el serializer de detalle; el reporte la necesita por fila.
        # La fecha la sella el service al asignar, así que acá se pone a mano.
        assigned_lead.assigned_at = timezone.now() - timedelta(days=7)
        assigned_lead.save(update_fields=['assigned_at'])

        row = self._row(salesperson_user, assigned_lead)
        assert row['assigned_at'][:10] == str(timezone.localtime(assigned_lead.assigned_at).date())
        # #323: la tarjeta muestra la fecha y los días juntos, así que el
        # listado tiene que traer los dos.
        assert row['days_assigned'] == 7

    def test_un_lead_sin_dueno_no_trae_fecha_de_asignacion(self, db, salesperson_user, sample_lead):
        row = self._row(salesperson_user, sample_lead)
        assert row['assigned_at'] is None
        assert row['days_assigned'] is None


class TestLeadCreate:
    def test_lead_create_manual_with_is_company(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Test Corp',
            'phone': '0999999999',
            'is_company': True,
            'source': Lead.Source.MANUAL,
        }, format='json')
        assert resp.status_code == 201
        assert resp.json()['is_company'] is True
        assert Lead.objects.filter(name='Test Corp', is_company=True).exists()


class TestLeadFilters:
    def test_lead_filter_by_status(self, db, salesperson_user):
        Lead.objects.create(name='A', phone='111', status=Lead.Status.INTERESTED)
        Lead.objects.create(name='B', phone='222', status=Lead.Status.NEW)
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?status=INTERESTED')
        assert resp.status_code == 200
        data = resp.json()
        all_leads = data['my_leads'] + data['available_leads']
        assert all(lead['status'] == 'INTERESTED' for lead in all_leads)

    def test_lead_search(self, db, salesperson_user):
        Lead.objects.create(name='Unicorn Corp', phone='555000001', email='uni@corp.com')
        Lead.objects.create(name='Other Lead', phone='555000002')
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?search=Unicorn')
        assert resp.status_code == 200
        data = resp.json()
        all_leads = data['my_leads'] + data['available_leads']
        assert len(all_leads) == 1
        assert all_leads[0]['name'] == 'Unicorn Corp'


class TestLeadDetail:
    def test_get_lead_detail(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}{assigned_lead.id}/')
        assert resp.status_code == 200
        data = resp.json()
        assert data['id'] == str(assigned_lead.id)
        assert 'interaction_count' in data
        assert 'last_contact' in data

    def test_salesperson_cannot_view_another_sellers_lead(self, db, assigned_lead):
        other = CustomUser.objects.create_user(
            email='peek@test.com', password='testpass123',
            first_name='Peek', last_name='Er', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(other)
        resp = client.get(f'{LEADS_URL}{assigned_lead.id}/')
        assert resp.status_code == 403
        assert resp.json()['code'] == 'FORBIDDEN'

    def test_salesperson_can_view_unassigned_lead_detail(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}{sample_lead.id}/')
        assert resp.status_code == 200

    def test_admin_can_view_any_lead_detail(self, db, admin_user, assigned_lead):
        client = make_client(admin_user)
        resp = client.get(f'{LEADS_URL}{assigned_lead.id}/')
        assert resp.status_code == 200

    def test_get_lead_detail_404(self, db, salesperson_user):
        import uuid as _uuid
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}{_uuid.uuid4()}/')
        assert resp.status_code == 404


class TestLeadUpdatePermissions:
    def test_salesperson_can_update_own_lead(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        # Cambiamos CONTACTED por INTERESTED
        resp = client.patch(f'{LEADS_URL}{assigned_lead.id}/', {'status': Lead.Status.INTERESTED}, format='json')
        assert resp.status_code == 200

    def test_salesperson_can_update_unassigned_lead(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        # Cambiamos CONTACTED por INTERESTED
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/', {'status': Lead.Status.INTERESTED}, format='json')
        assert resp.status_code == 200

    def test_salesperson_cannot_update_another_sellers_lead(self, db, assigned_lead):
        other = CustomUser.objects.create_user(
            email='intruder@test.com', password='testpass123',
            first_name='Intru', last_name='Der', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(other)
        resp = client.patch(f'{LEADS_URL}{assigned_lead.id}/', {'status': Lead.Status.NOT_INTERESTED}, format='json')
        assert resp.status_code == 403
        assert resp.json()['code'] == 'NOT_OWNER'
        assigned_lead.refresh_from_db()
        # Asegúrate de que esta línea verifique el estado inicial de tu fixture (ahora INTERESTED)
        assert assigned_lead.status == Lead.Status.INTERESTED


class TestLeadSoftDelete:
    def test_admin_can_soft_delete(self, db, admin_user, sample_lead):
        client = make_client(admin_user)
        resp = client.delete(f'{LEADS_URL}{sample_lead.id}/')
        assert resp.status_code == 204
        sample_lead.refresh_from_db()
        assert sample_lead.deleted_at is not None

    def test_soft_deleted_lead_hidden_from_default_manager(self, db, admin_user, sample_lead):
        client = make_client(admin_user)
        client.delete(f'{LEADS_URL}{sample_lead.id}/')
        assert not Lead.objects.filter(id=sample_lead.id).exists()
        assert Lead.all_objects.filter(id=sample_lead.id).exists()

    def test_soft_deleted_lead_not_in_list(self, db, admin_user, sample_lead):
        client = make_client(admin_user)
        client.delete(f'{LEADS_URL}{sample_lead.id}/')
        resp = client.get(LEADS_URL)
        data = resp.json()
        all_ids = [lead['id'] for lead in data['my_leads']] + [lead['id'] for lead in data['available_leads']]
        assert str(sample_lead.id) not in all_ids

    def test_soft_deleted_lead_detail_404(self, db, admin_user, sample_lead):
        client = make_client(admin_user)
        client.delete(f'{LEADS_URL}{sample_lead.id}/')
        resp = client.get(f'{LEADS_URL}{sample_lead.id}/')
        assert resp.status_code == 404

    def test_salesperson_cannot_delete(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.delete(f'{LEADS_URL}{sample_lead.id}/')
        assert resp.status_code == 403
        sample_lead.refresh_from_db()
        assert sample_lead.deleted_at is None


class TestLeadExtraFilters:
    def test_my_leads_filter_returns_only_owned(self, db, salesperson_user, sample_lead, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?my_leads=true')
        assert resp.status_code == 200
        data = resp.json()
        assert data['available_leads'] == []
        my_ids = [lead['id'] for lead in data['my_leads']]
        assert str(assigned_lead.id) in my_ids
        assert str(sample_lead.id) not in my_ids

    def test_is_company_filter(self, db, salesperson_user):
        Lead.objects.create(name='ACME', phone='111', is_company=True)
        Lead.objects.create(name='Persona', phone='222', is_company=False)
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?is_company=true')
        all_leads = resp.json()['my_leads'] + resp.json()['available_leads']
        assert len(all_leads) == 1
        assert all_leads[0]['is_company'] is True

    def test_vendedor_filter_admin_only(self, db, admin_user, salesperson_user, assigned_lead, sample_lead):
        client = make_client(admin_user)
        resp = client.get(f'{LEADS_URL}?vendedor={salesperson_user.id}')
        assert resp.status_code == 200
        data = resp.json()
        ids = [lead['id'] for lead in data['my_leads']] + [lead['id'] for lead in data['available_leads']]
        assert str(assigned_lead.id) in ids
        assert str(sample_lead.id) not in ids

    def test_estado_alias_filter(self, db, salesperson_user):
        Lead.objects.create(name='A', phone='111', status=Lead.Status.INTERESTED)
        Lead.objects.create(name='B', phone='222', status=Lead.Status.NEW)
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?estado=INTERESTED')
        all_leads = resp.json()['my_leads'] + resp.json()['available_leads']
        assert len(all_leads) == 1
        assert all(lead['status'] == 'INTERESTED' for lead in all_leads)

    def test_fecha_desde_future_excludes_all(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?fecha_desde=2999-01-01')
        all_leads = resp.json()['my_leads'] + resp.json()['available_leads']
        assert all_leads == []

    def test_fecha_hasta_past_excludes_all(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?fecha_hasta=2000-01-01')
        all_leads = resp.json()['my_leads'] + resp.json()['available_leads']
        assert all_leads == []


class TestLeadPagination:
    def test_lead_list_includes_pagination_metadata(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 200
        pagination = resp.json()['pagination']
        assert pagination['page'] == 1
        assert pagination['page_size'] == 20
        assert pagination['available_leads_count'] == 1

    def test_lead_list_respects_page_size(self, db, salesperson_user):
        for i in range(25):
            Lead.objects.create(name=f'Lead {i}', phone=f'09900{i:05d}')
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?page_size=10')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data['available_leads']) == 10
        assert data['pagination']['available_leads_count'] == 25
        assert data['pagination']['available_leads_total_pages'] == 3

    def test_lead_list_second_page_returns_remainder(self, db, salesperson_user):
        for i in range(25):
            Lead.objects.create(name=f'Lead {i}', phone=f'09900{i:05d}')
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?page_size=10&page=3')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data['available_leads']) == 5
        assert data['pagination']['page'] == 3

    def test_lead_list_page_size_is_capped(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?page_size=99999')
        assert resp.status_code == 200
        assert resp.json()['pagination']['page_size'] == 100

    def test_lead_list_invalid_page_size_falls_back_to_default(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?page_size=abc')
        assert resp.status_code == 200
        assert resp.json()['pagination']['page_size'] == 20

    def test_lead_list_page_size_zero_falls_back_to_default(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?page_size=0')
        assert resp.status_code == 200
        assert resp.json()['pagination']['page_size'] == 20

    def test_lead_list_negative_page_clamped_to_one(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?page=-5')
        assert resp.status_code == 200
        assert resp.json()['pagination']['page'] == 1


# ==========================================
# ASSIGNMENT & RELEASE TESTS
# ==========================================

class TestLeadAssign:
    def test_lead_assign_success(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 200
        sample_lead.refresh_from_db()
        assert sample_lead.owner == salesperson_user
        assert sample_lead.version == 1

    def test_lead_assign_already_owned(self, db, salesperson_user, admin_user, sample_lead):
        sample_lead.owner = admin_user
        sample_lead.save()

        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'LEAD_ALREADY_ASSIGNED'

    @pytest.mark.django_db(transaction=True)
    def test_lead_assign_race_condition(self):
        lead = Lead.objects.create(name='Race Lead', phone='0777000001')
        v1 = CustomUser.objects.create_user(
            email='race_v1@test.com', password='testpass123',
            first_name='Race', last_name='V1', role=CustomUser.Role.SALESPERSON,
        )
        v2 = CustomUser.objects.create_user(
            email='race_v2@test.com', password='testpass123',
            first_name='Race', last_name='V2', role=CustomUser.Role.SALESPERSON,
        )
        client1 = make_client(v1)
        client2 = make_client(v2)

        results = []

        def do_assign(client_instance):
            try:
                resp = client_instance.patch(f'{LEADS_URL}{lead.id}/assign/')
                results.append(resp.status_code)
            finally:
                connection.close()

        t1 = threading.Thread(target=do_assign, args=(client1,))
        t2 = threading.Thread(target=do_assign, args=(client2,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert sorted(results) == [200, 409]
        lead.refresh_from_db()
        assert lead.owner is not None


class TestLeadRelease:
    def test_lead_release(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{assigned_lead.id}/release/')
        assert resp.status_code == 200
        assigned_lead.refresh_from_db()
        assert assigned_lead.owner is None
        assert assigned_lead.assigned_at is None


class TestLeadReleasedAtTracking:
    """CR-006: released_at debe quedar registrado en los tres caminos que cambian owner."""

    def test_release_by_salesperson_sets_released_at(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        client.patch(f'{LEADS_URL}{assigned_lead.id}/release/')
        assigned_lead.refresh_from_db()
        assert assigned_lead.released_at is not None

    def test_admin_release_sets_released_at(self, db, admin_user, assigned_lead):
        client = make_client(admin_user)
        client.patch(f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {}, format='json')
        assigned_lead.refresh_from_db()
        assert assigned_lead.released_at is not None

    def test_admin_reassign_clears_released_at(self, db, admin_user, assigned_lead):
        """Al reasignar arranca una tenencia nueva: released_at vuelve a null."""
        other = CustomUser.objects.create_user(
            email='vendor_released@test.com', password='testpass123',
            first_name='Nuevo', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(admin_user)
        client.patch(f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {}, format='json')
        client.patch(
            f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {'owner_id': str(other.id)}, format='json'
        )
        assigned_lead.refresh_from_db()
        assert assigned_lead.owner == other
        assert assigned_lead.released_at is None

    def test_self_assign_clears_released_at(self, db, salesperson_user, sample_lead):
        sample_lead.released_at = timezone.now()
        sample_lead.save(update_fields=['released_at'])

        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 200
        sample_lead.refresh_from_db()
        assert sample_lead.released_at is None


class TestLeadAdminReassign:
    """PATCH /leads/{id}/admin-reassign/ — liberación/reasignación forzada por Admin (CR-005)."""

    def test_admin_releases_assigned_lead(self, db, admin_user, salesperson_user, assigned_lead):
        client = make_client(admin_user)
        resp = client.patch(f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {}, format='json')
        assert resp.status_code == 200
        assigned_lead.refresh_from_db()
        assert assigned_lead.owner is None
        assert assigned_lead.assigned_at is None
        assert assigned_lead.version == 1

        audit = assigned_lead.interactions.filter(interaction_type=Interaction.InteractionType.SYSTEM).first()
        assert audit is not None
        assert audit.outcome == Interaction.Outcome.REASSIGNED
        assert admin_user.get_full_name() in audit.notes
        assert salesperson_user.get_full_name() in audit.notes

    def test_admin_reassigns_to_specific_vendor(self, db, admin_user, salesperson_user, assigned_lead):
        other = CustomUser.objects.create_user(
            email='other_vendor@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(admin_user)
        resp = client.patch(
            f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {'owner_id': str(other.id)}, format='json'
        )
        assert resp.status_code == 200
        assigned_lead.refresh_from_db()
        assert assigned_lead.owner == other
        assert assigned_lead.assigned_at is not None
        assert assigned_lead.version == 1

        other_client = make_client(other)
        list_resp = other_client.get(LEADS_URL)
        my_ids = [lead['id'] for lead in list_resp.json()['my_leads']]
        assert str(assigned_lead.id) in my_ids

    def test_previous_interactions_preserved_after_reassign(self, db, admin_user, salesperson_user, assigned_lead):
        Interaction.objects.create(
            lead=assigned_lead, salesperson=salesperson_user,
            interaction_type=Interaction.InteractionType.CALL, outcome=Interaction.Outcome.CALL_AGAIN,
        )
        client = make_client(admin_user)
        resp = client.patch(f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {}, format='json')
        assert resp.status_code == 200
        assert assigned_lead.interactions.filter(interaction_type=Interaction.InteractionType.CALL).exists()

    def test_salesperson_cannot_use_admin_reassign(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {}, format='json')
        assert resp.status_code == 403

    def test_reassign_to_non_salesperson_rejected(self, db, admin_user, bootcamper_user, assigned_lead):
        client = make_client(admin_user)
        resp = client.patch(
            f'{LEADS_URL}{assigned_lead.id}/admin-reassign/', {'owner_id': str(bootcamper_user.id)}, format='json'
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_OWNER'

    def test_reassign_lead_not_found(self, db, admin_user):
        import uuid as _uuid
        client = make_client(admin_user)
        resp = client.patch(f'{LEADS_URL}{_uuid.uuid4()}/admin-reassign/', {}, format='json')
        assert resp.status_code == 404

    def test_generic_admin_patch_also_creates_audit_entry(self, db, admin_user, sample_lead):
        other = CustomUser.objects.create_user(
            email='generic_reassign@test.com', password='testpass123',
            first_name='Generic', last_name='Vendor', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(admin_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/', {'owner': str(other.id)}, format='json')
        assert resp.status_code == 200
        sample_lead.refresh_from_db()
        assert sample_lead.owner == other
        assert sample_lead.interactions.filter(
            interaction_type=Interaction.InteractionType.SYSTEM,
            outcome=Interaction.Outcome.REASSIGNED,
        ).exists()

    @pytest.mark.django_db(transaction=True)
    def test_admin_reassign_concurrent_calls_do_not_lose_updates(self):
        admin = CustomUser.objects.create_user(
            email='race_admin@test.com', password='testpass123',
            first_name='Race', last_name='Admin', role=CustomUser.Role.ADMINISTRATOR,
        )
        v1 = CustomUser.objects.create_user(
            email='race_target1@test.com', password='testpass123',
            first_name='Target', last_name='One', role=CustomUser.Role.SALESPERSON,
        )
        v2 = CustomUser.objects.create_user(
            email='race_target2@test.com', password='testpass123',
            first_name='Target', last_name='Two', role=CustomUser.Role.SALESPERSON,
        )
        lead = Lead.objects.create(name='Race Reassign', phone='0777000002', owner=v1)
        client1 = make_client(admin)
        client2 = make_client(admin)

        results = []

        def do_reassign(client_instance, owner_id):
            try:
                resp = client_instance.patch(
                    f'{LEADS_URL}{lead.id}/admin-reassign/', {'owner_id': owner_id}, format='json'
                )
                results.append(resp.status_code)
            finally:
                connection.close()

        t1 = threading.Thread(target=do_reassign, args=(client1, str(v2.id)))
        t2 = threading.Thread(target=do_reassign, args=(client2, None))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert sorted(results) == [200, 200]
        lead.refresh_from_db()
        assert lead.version == 2


# ==========================================
# INTERACTIONS TESTS
# ==========================================

class TestInteractions:
    def test_interaction_create_updates_lead_status(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome': Interaction.Outcome.SEND_INFO,  # <-- ACTUALIZADO
            'notes': 'Se envió la información, el cliente está muy interesado.',
        }, format='json')
        assert resp.status_code == 201
        assigned_lead.refresh_from_db()
        # Esto asume que en OUTCOME_TO_STATUS mapeaste SEND_INFO a Lead.Status.INTERESTED
        assert assigned_lead.status == Lead.Status.INTERESTED

    def test_interaction_includes_days_as_lead(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.NOTE,
            'outcome': Interaction.Outcome.CALL_AGAIN,
        }, format='json')
        assert resp.status_code == 201
        assert 'days_as_lead' in resp.json()
        assert isinstance(resp.json()['days_as_lead'], int)

    def test_interaction_updates_last_contact(self, db, salesperson_user, assigned_lead):
        assert assigned_lead.last_contact is None
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome': Interaction.Outcome.CALL_AGAIN,
        }, format='json')
        assert resp.status_code == 201
        assigned_lead.refresh_from_db()
        assert assigned_lead.last_contact is not None

    def test_visit_interaction_with_duration_and_next_action(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.VISIT,
            'outcome': Interaction.Outcome.SCHEDULE_VISIT,  # <-- ACTUALIZADO
            'duration_minutes': 45,
            'next_action': 'Enviar propuesta',
            'next_action_date': '2026-06-20',
        }, format='json')
        assert resp.status_code == 201
        body = resp.json()
        assert body['interaction_type'] == Interaction.InteractionType.VISIT
        assert body['duration_minutes'] == 45
        assert body['next_action'] == 'Enviar propuesta'

    def test_interest_level_out_of_range_rejected(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome': Interaction.Outcome.SEND_INFO,  # <-- ACTUALIZADO
            'interest_level': 9,
        }, format='json')
        assert resp.status_code == 400

    def test_interaction_list_ordered_desc(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        # <-- ACTUALIZADO: Se usan los nuevos outcomes
        for outcome in (Interaction.Outcome.AWAIT_REPLY, Interaction.Outcome.CALL_AGAIN, Interaction.Outcome.SEND_INFO):
            resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
                'interaction_type': Interaction.InteractionType.CALL,
                'outcome': outcome,
            }, format='json')
            assert resp.status_code == 201

        resp = client.get(f'{LEADS_URL}{assigned_lead.id}/interactions/')
        assert resp.status_code == 200
        timestamps = [row['created_at'] for row in resp.json()]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_non_owner_cannot_create_interaction(self, db, assigned_lead):
        other = CustomUser.objects.create_user(
            email='other@test.com', password='testpass123',
            first_name='Other', last_name='Seller',
            role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(other)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome': Interaction.Outcome.SEND_INFO,  # <-- ACTUALIZADO
        }, format='json')
        assert resp.status_code == 403
        assert resp.json()['code'] == 'NOT_OWNER'

    def test_non_owner_cannot_view_interactions(self, db, assigned_lead):
        other = CustomUser.objects.create_user(
            email='viewer@test.com', password='testpass123',
            first_name='View', last_name='Er',
            role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(other)
        resp = client.get(f'{LEADS_URL}{assigned_lead.id}/interactions/')
        assert resp.status_code == 403

    def test_converted_lead_info_and_history_visible_to_other_salesperson(self, db, salesperson_user):
        other = CustomUser.objects.create_user(
            email='conv.owner@test.com', password='testpass123',
            first_name='Owner', last_name='X', role=CustomUser.Role.SALESPERSON,
        )
        lead = Lead.objects.create(
            name='Convertido', phone='0990001111', status=Lead.Status.CONVERTED, owner=other,
        )
        Interaction.objects.create(
            lead=lead, salesperson=other,
            interaction_type=Interaction.InteractionType.WHATSAPP,
            outcome=Interaction.Outcome.SEND_INFO, notes='hola',
        )
        client = make_client(salesperson_user)
        # Info e historial de un convertido son visibles para todo el equipo comercial.
        assert client.get(f'{LEADS_URL}{lead.id}/').status_code == 200
        assert client.get(f'{LEADS_URL}{lead.id}/interactions/').status_code == 200

    def test_available_lead_history_visible_to_other_salesperson(self, db, salesperson_user, sample_lead):
        worker = CustomUser.objects.create_user(
            email='worker@test.com', password='testpass123',
            first_name='W', last_name='K', role=CustomUser.Role.SALESPERSON,
        )
        Interaction.objects.create(
            lead=sample_lead, salesperson=worker,
            interaction_type=Interaction.InteractionType.CALL,
            outcome=Interaction.Outcome.CALL_AGAIN, notes='llamada',
        )
        client = make_client(salesperson_user)
        # sample_lead está sin asignar: su historial es visible para todo el equipo.
        resp = client.get(f'{LEADS_URL}{sample_lead.id}/interactions/')
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ==========================================
# ADMIN PRIVILEGES TESTS
# ==========================================

class TestAdminPrivileges:

    def test_admin_sees_all_leads(self, db, admin_user, sample_lead, assigned_lead):
        client = make_client(admin_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 200
        data = resp.json()
        all_ids = (
            [lead['id'] for lead in data['my_leads']] +
            [lead['id'] for lead in data['available_leads']]
        )
        assert str(sample_lead.id) in all_ids
        assert str(assigned_lead.id) in all_ids

    def test_admin_can_view_any_leads_interactions(self, db, admin_user, assigned_lead):
        client = make_client(admin_user)
        resp = client.get(f'{LEADS_URL}{assigned_lead.id}/interactions/')
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_admin_can_update_any_lead(self, db, admin_user, assigned_lead):
        client = make_client(admin_user)
        payload = {
            'status': Lead.Status.NOT_INTERESTED
        }
        resp = client.patch(f'{LEADS_URL}{assigned_lead.id}/', payload, format='json')
        assert resp.status_code == 200
        assigned_lead.refresh_from_db()
        assert assigned_lead.status == Lead.Status.NOT_INTERESTED

    def test_admin_cannot_assign_leads_to_himself(self, db, admin_user, sample_lead):
        client = make_client(admin_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 403


class TestAdminLeadPartitions:
    """CB-223 / HST-025: particiones reales (all/assigned/unassigned) para el admin."""

    def test_admin_gets_real_partitions_with_correct_counts(self, db, admin_user, sample_lead, assigned_lead):
        client = make_client(admin_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 200
        data = resp.json()

        all_ids        = {lead['id'] for lead in data['all_leads']}
        assigned_ids   = {lead['id'] for lead in data['assigned_leads']}
        unassigned_ids = {lead['id'] for lead in data['unassigned_leads']}

        assert str(sample_lead.id) in all_ids
        assert str(assigned_lead.id) in all_ids
        assert str(assigned_lead.id) in assigned_ids
        assert str(sample_lead.id) not in assigned_ids
        assert str(sample_lead.id) in unassigned_ids
        assert str(assigned_lead.id) not in unassigned_ids

        pagination = data['pagination']
        assert pagination['all_leads_count'] == 2
        assert pagination['assigned_leads_count'] == 1
        assert pagination['unassigned_leads_count'] == 1

    def test_salesperson_response_has_no_admin_partition_keys(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert 'all_leads' not in data
        assert 'assigned_leads' not in data
        assert 'unassigned_leads' not in data
        assert 'all_leads_count' not in data['pagination']

    def test_salesperson_contract_unchanged(self, db, salesperson_user, sample_lead, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert 'my_leads' in data
        assert 'available_leads' in data
        my_ids = [lead['id'] for lead in data['my_leads']]
        available_ids = [lead['id'] for lead in data['available_leads']]
        assert str(assigned_lead.id) in my_ids
        assert str(sample_lead.id) in available_ids

    def test_vendedor_filter_still_admin_only_with_partitions(self, db, admin_user, salesperson_user, assigned_lead, sample_lead):
        other = CustomUser.objects.create_user(
            email='partitions_other@test.com', password='testpass123',
            first_name='Other', last_name='Vendor', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(admin_user)
        resp = client.get(f'{LEADS_URL}?vendedor={other.id}')
        assert resp.status_code == 200
        data = resp.json()
        all_ids = {lead['id'] for lead in data['all_leads']}
        assert str(assigned_lead.id) not in all_ids
        assert str(sample_lead.id) not in all_ids

    def test_vendedor_filter_ignored_for_salesperson_even_with_partitions(self, db, salesperson_user, assigned_lead):
        other = CustomUser.objects.create_user(
            email='partitions_intruder@test.com', password='testpass123',
            first_name='Intruder', last_name='Vendor', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?vendedor={other.id}')
        assert resp.status_code == 200
        assert 'all_leads' not in resp.json()
