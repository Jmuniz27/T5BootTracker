"""Tests for leads API endpoints."""
import threading
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead, Interaction

LEADS_URL = '/api/leads/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


class TestLeadList:
    def test_lead_list_returns_my_and_available(self, db, salesperson_user, sample_lead, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.get(LEADS_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert 'my_leads' in data
        assert 'available_leads' in data
        # sample_lead is unassigned → available; assigned_lead belongs to salesperson_user → my
        my_ids        = [lead['id'] for lead in data['my_leads']]
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
            'name':       'Test Corp',
            'phone':      '0999999999',
            'is_company': True,
            'source':     Lead.Source.MANUAL,
        }, format='json')
        assert resp.status_code == 201
        assert resp.json()['is_company'] is True
        assert Lead.objects.filter(name='Test Corp', is_company=True).exists()


class TestLeadAssign:
    def test_lead_assign_success(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 200
        sample_lead.refresh_from_db()
        assert sample_lead.owner == salesperson_user
        assert sample_lead.version == 1

    def test_lead_assign_already_owned(self, db, salesperson_user, admin_user, sample_lead):
        # First assign to admin
        sample_lead.owner = admin_user
        sample_lead.save()

        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'LEAD_ALREADY_ASSIGNED'

    @pytest.mark.django_db(transaction=True)
    def test_lead_assign_race_condition(self):
        """Only one of two concurrent assign requests should succeed."""
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

        def do_assign(client):
            resp = client.patch(f'{LEADS_URL}{lead.id}/assign/')
            results.append(resp.status_code)

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


class TestInteractions:
    def test_interaction_create_updates_lead_status(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome':          Interaction.Outcome.INTERESTED,
            'notes':            'El cliente está muy interesado.',
        }, format='json')
        assert resp.status_code == 201
        assigned_lead.refresh_from_db()
        assert assigned_lead.status == Lead.Status.INTERESTED

    def test_interaction_includes_days_as_lead(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.NOTE,
            'outcome':          Interaction.Outcome.CALLBACK,
        }, format='json')
        assert resp.status_code == 201
        assert 'days_as_lead' in resp.json()
        assert isinstance(resp.json()['days_as_lead'], int)

    def test_interaction_updates_last_contact(self, db, salesperson_user, assigned_lead):
        assert assigned_lead.last_contact is None
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.CALL,
            'outcome':          Interaction.Outcome.CALLBACK,
        }, format='json')
        assert resp.status_code == 201
        assigned_lead.refresh_from_db()
        assert assigned_lead.last_contact is not None

    def test_visit_interaction_with_duration_and_next_action(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
            'interaction_type': Interaction.InteractionType.VISIT,
            'outcome':          Interaction.Outcome.INTERESTED,
            'duration_minutes': 45,
            'next_action':      'Enviar propuesta',
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
            'outcome':          Interaction.Outcome.INTERESTED,
            'interest_level':   9,
        }, format='json')
        assert resp.status_code == 400

    def test_interaction_list_ordered_desc(self, db, salesperson_user, assigned_lead):
        client = make_client(salesperson_user)
        for outcome in (Interaction.Outcome.NO_ANSWER, Interaction.Outcome.CALLBACK, Interaction.Outcome.INTERESTED):
            resp = client.post(f'{LEADS_URL}{assigned_lead.id}/interactions/', {
                'interaction_type': Interaction.InteractionType.CALL,
                'outcome':          outcome,
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
            'outcome':          Interaction.Outcome.INTERESTED,
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
        Lead.objects.create(name='Other Lead',   phone='555000002')
        client = make_client(salesperson_user)
        resp = client.get(f'{LEADS_URL}?search=Unicorn')
        assert resp.status_code == 200
        data = resp.json()
        all_leads = data['my_leads'] + data['available_leads']
        assert len(all_leads) == 1
        assert all_leads[0]['name'] == 'Unicorn Corp'
