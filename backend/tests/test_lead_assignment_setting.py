"""Tests for the global lead self-assignment toggle (CB-125 / CR-004)."""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.leads.models import LeadAssignmentSetting

SETTING_URL = '/api/leads/settings/self-assignment/'
LEADS_URL = '/api/leads/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


class TestLeadAssignmentSettingGet:
    def test_get_setting_visible_to_any_authenticated_role(self, db, salesperson_user, admin_user, bootcamper_user):
        for user in (salesperson_user, admin_user, bootcamper_user):
            client = make_client(user)
            resp = client.get(SETTING_URL)
            assert resp.status_code == 200
            assert resp.json()['self_assign_enabled'] is True

    def test_get_setting_creates_default_row_on_first_read(self, db, admin_user):
        assert not LeadAssignmentSetting.objects.exists()
        client = make_client(admin_user)
        resp = client.get(SETTING_URL)
        assert resp.status_code == 200
        assert LeadAssignmentSetting.objects.count() == 1


class TestLeadAssignmentSettingPatch:
    def test_admin_can_disable_self_assignment(self, db, admin_user):
        client = make_client(admin_user)
        resp = client.patch(SETTING_URL, {'self_assign_enabled': False}, format='json')
        assert resp.status_code == 200
        assert resp.json()['self_assign_enabled'] is False
        setting = LeadAssignmentSetting.get_solo()
        assert setting.self_assign_enabled is False
        assert setting.updated_by == admin_user
        assert setting.updated_at is not None

    def test_admin_can_enable_self_assignment(self, db, admin_user):
        LeadAssignmentSetting.objects.create(pk=1, self_assign_enabled=False)
        client = make_client(admin_user)
        resp = client.patch(SETTING_URL, {'self_assign_enabled': True}, format='json')
        assert resp.status_code == 200
        assert LeadAssignmentSetting.get_solo().self_assign_enabled is True

    def test_non_admin_cannot_change_setting(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.patch(SETTING_URL, {'self_assign_enabled': False}, format='json')
        assert resp.status_code == 403
        assert LeadAssignmentSetting.get_solo().self_assign_enabled is True

    def test_setting_records_updated_by_and_updated_at(self, db, admin_user):
        client = make_client(admin_user)
        resp = client.patch(SETTING_URL, {'self_assign_enabled': False}, format='json')
        assert resp.json()['updated_by_name'] == admin_user.get_full_name()
        assert resp.json()['updated_at'] is not None


class TestSelfAssignGatedByToggle:
    def test_salesperson_can_self_assign_when_enabled(self, db, salesperson_user, sample_lead):
        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 200
        sample_lead.refresh_from_db()
        assert sample_lead.owner == salesperson_user

    def test_salesperson_blocked_when_disabled(self, db, salesperson_user, sample_lead):
        LeadAssignmentSetting.objects.create(pk=1, self_assign_enabled=False)
        client = make_client(salesperson_user)
        resp = client.patch(f'{LEADS_URL}{sample_lead.id}/assign/')
        assert resp.status_code == 403
        assert resp.json()['code'] == 'SELF_ASSIGNMENT_DISABLED'
        sample_lead.refresh_from_db()
        assert sample_lead.owner is None
