"""Tests for duplicate-lead detection on manual creation (CB-127 / CR-011)."""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.leads.models import Lead

LEADS_URL = '/api/leads/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


class TestLeadDuplicateDetection:
    def test_create_lead_duplicate_by_phone_returns_409_without_creating(self, db, salesperson_user):
        Lead.objects.create(name='Original', phone='0991234567')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Duplicado',
            'phone': '0991234567',
        }, format='json')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'POSSIBLE_DUPLICATE'
        assert Lead.objects.filter(name='Duplicado').count() == 0

    def test_create_lead_duplicate_by_email_returns_409_without_creating(self, db, salesperson_user):
        Lead.objects.create(name='Original', phone='0990000000', email='dup@test.com')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Duplicado',
            'phone': '0991111111',
            'email': 'dup@test.com',
        }, format='json')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'POSSIBLE_DUPLICATE'
        assert resp.json()['duplicate']['email'] == 'dup@test.com'
        assert Lead.objects.filter(name='Duplicado').count() == 0

    def test_create_lead_no_duplicate_creates_normally(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Lead Nuevo',
            'phone': '0995551234',
        }, format='json')
        assert resp.status_code == 201
        assert Lead.objects.filter(name='Lead Nuevo').exists()

    def test_create_lead_with_confirm_duplicate_creates_despite_duplicate(self, db, salesperson_user):
        Lead.objects.create(name='Original', phone='0991234567')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Duplicado Confirmado',
            'phone': '0991234567',
            'confirm_duplicate': True,
        }, format='json')
        assert resp.status_code == 201
        assert Lead.objects.filter(name='Duplicado Confirmado').exists()

    def test_duplicate_check_ignores_blank_email(self, db, salesperson_user):
        Lead.objects.create(name='Sin Email A', phone='0990000001')
        client = make_client(salesperson_user)
        resp = client.post(LEADS_URL, {
            'name': 'Sin Email B',
            'phone': '0990000002',
        }, format='json')
        assert resp.status_code == 201
        assert Lead.objects.filter(name='Sin Email B').exists()
