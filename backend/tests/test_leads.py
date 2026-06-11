"""Tests for leads API endpoints."""
import threading
from unittest.mock import patch
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
def interested_lead(db, salesperson_user):
    """Fixture for a lead ready to be converted (Status: INTERESTED)."""
    return Lead.objects.create(
        name='Juan Perez',
        phone='0991234567',
        email='juan.perez@test.com',
        status=Lead.Status.INTERESTED,
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


# ==========================================
# INTERACTIONS TESTS
# ==========================================

class TestInteractions:
    def test_interaction_create_updates_lead_status(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome': Interaction.Outcome.INTERESTED,
            'notes': 'El cliente está muy interesado.',
        }, format='json')
        assert resp.status_code == 201
        assigned_lead.refresh_from_db()
        assert assigned_lead.status == Lead.Status.INTERESTED

    def test_interaction_includes_days_as_lead(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.NOTE,
            'outcome': Interaction.Outcome.CALLBACK,
        }, format='json')
        assert resp.status_code == 201
        assert 'days_as_lead' in resp.json()
        assert isinstance(resp.json()['days_as_lead'], int)

    def test_interaction_updates_last_contact(self, db, salesperson_user, assigned_lead):
        assert assigned_lead.last_contact is None
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome': Interaction.Outcome.CALLBACK,
        }, format='json')
        assert resp.status_code == 201
        assigned_lead.refresh_from_db()
        assert assigned_lead.last_contact is not None

    def test_visit_interaction_with_duration_and_next_action(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.VISIT,
            'outcome': Interaction.Outcome.INTERESTED,
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
            'outcome': Interaction.Outcome.INTERESTED,
            'interest_level': 9,
        }, format='json')
        assert resp.status_code == 400

    def test_interaction_list_ordered_desc(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        for outcome in (Interaction.Outcome.NO_ANSWER, Interaction.Outcome.CALLBACK, Interaction.Outcome.INTERESTED):
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
            'outcome': Interaction.Outcome.INTERESTED,
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


# ==========================================
# CONVERSION TESTS
# ==========================================

class TestConvertLead:

    @patch('apps.notifications.tasks.send_conversion_notification.delay')
    @patch('apps.leads.views.validate_cedula_ecuatoriana', return_value=True)
    def test_convert_lead_success_new_bootcamper(self, mock_notify, mock_validator, db, salesperson_user, interested_lead, program):
        client = make_client(salesperson_user)
        payload = {
            'cedula': '0955555555',
            'program_id': str(program.id)
        }

        resp = client.post(f'{LEADS_URL}{interested_lead.id}/convert/', payload, format='json')

        assert resp.status_code == 201
        data = resp.json()

        assert data['is_returning'] is False
        assert data['temporary_password'] is not None
        assert data['lead_status'] == Lead.Status.CONVERTED
        assert data['email'] == interested_lead.email

        interested_lead.refresh_from_db()
        assert interested_lead.status == Lead.Status.CONVERTED
        assert interested_lead.program == program

        new_user = CustomUser.objects.get(id=data['bootcamper_id'])
        assert new_user.role == CustomUser.Role.BOOTCAMPER
        assert new_user.cedula == '0955555555'

        mock_notify.assert_called_once_with(str(interested_lead.id), str(new_user.id))

    @patch('apps.notifications.tasks.send_conversion_notification.delay')
    @patch('apps.leads.views.validate_cedula_ecuatoriana', return_value=True)
    def test_convert_lead_success_returning_bootcamper(self, mock_notify, mock_validator, db, salesperson_user, interested_lead, program):
        existing_bootcamper = CustomUser.objects.create_user(
            email=interested_lead.email,
            password='oldpassword123',
            role=CustomUser.Role.BOOTCAMPER,
            cedula='0944444444'
        )

        client = make_client(salesperson_user)
        payload = {
            'cedula': '0944444444',
            'program_id': str(program.id)
        }

        resp = client.post(f'{LEADS_URL}{interested_lead.id}/convert/', payload, format='json')

        assert resp.status_code == 201
        data = resp.json()

        assert data['is_returning'] is True
        assert data['temporary_password'] is None
        assert data['bootcamper_id'] == str(existing_bootcamper.id)

        interested_lead.refresh_from_db()
        assert interested_lead.status == Lead.Status.CONVERTED

    def test_convert_lead_fails_if_status_not_interested(self, db, salesperson_user, program):
        not_ready_lead = Lead.objects.create(
            name='Ana Gomez',
            phone='0990000000',
            status=Lead.Status.NEW,
            owner=salesperson_user
        )

        client = make_client(salesperson_user)
        payload = {'cedula': '0955555555', 'program_id': str(program.id)}

        resp = client.post(f'{LEADS_URL}{not_ready_lead.id}/convert/', payload, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_STATUS'

    @patch('apps.leads.views.validate_cedula_ecuatoriana', return_value=False)
    def test_convert_lead_fails_invalid_cedula(self, mock_validator, db, salesperson_user, interested_lead, program):
        client = make_client(salesperson_user)
        payload = {'cedula': '123', 'program_id': str(program.id)}

        resp = client.post(f'{LEADS_URL}{interested_lead.id}/convert/', payload, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_CEDULA'

    @patch('apps.leads.views.validate_cedula_ecuatoriana', return_value=True)
    def test_convert_lead_fails_email_conflict_with_staff(self, mock_validator, db, salesperson_user, interested_lead, program):
        CustomUser.objects.create_user(
            email=interested_lead.email,
            password='adminpassword',
            role=CustomUser.Role.ADMINISTRATOR
        )

        client = make_client(salesperson_user)
        payload = {'cedula': '0955555555', 'program_id': str(program.id)}

        resp = client.post(f'{LEADS_URL}{interested_lead.id}/convert/', payload, format='json')

        assert resp.status_code == 409
        assert resp.json()['code'] == 'EMAIL_CONFLICT'

    @patch('apps.leads.views.validate_cedula_ecuatoriana', return_value=True)
    def test_convert_lead_fails_duplicate_cedula(self, mock_validator, db, salesperson_user, interested_lead, program):
        CustomUser.objects.create_user(
            email='otro.correo@test.com',
            password='somepassword',
            role=CustomUser.Role.BOOTCAMPER,
            cedula='0955555555'
        )

        client = make_client(salesperson_user)
        payload = {
            'cedula': '0955555555',
            'program_id': str(program.id)
        }

        resp = client.post(f'{LEADS_URL}{interested_lead.id}/convert/', payload, format='json')

        assert resp.status_code == 409
        assert resp.json()['code'] == 'CEDULA_ALREADY_EXISTS'


# ==========================================
# ADMIN PRIVILEGES TESTS
# ==========================================

class TestAdminPrivileges:

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
