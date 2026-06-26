"""Tests for lead-to-bootcamper conversion and returning bootcamper endpoints."""
from unittest.mock import patch
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.authentication.validators import validate_cedula_ecuatoriana
from apps.leads.models import Lead
from apps.programs.models import Enrollment

CONVERT_URL    = '/api/leads/{id}/convert/'
RETURNING_URL  = '/api/leads/returning-bootcamper/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


# ──────────────────────────────────────────────────────────────────────────────
# Cedula validation unit tests
# ──────────────────────────────────────────────────────────────────────────────

class TestCedulaValidator:
    def test_valid_cedula(self):
        assert validate_cedula_ecuatoriana('1713175071') is True

    def test_invalid_cedula_wrong_check_digit(self):
        assert validate_cedula_ecuatoriana('1713175070') is False

    def test_invalid_cedula_non_numeric(self):
        assert validate_cedula_ecuatoriana('171317507X') is False

    def test_invalid_cedula_wrong_length(self):
        assert validate_cedula_ecuatoriana('171317507') is False

    def test_invalid_cedula_bad_province(self):
        assert validate_cedula_ecuatoriana('9913175071') is False

    def test_invalid_cedula_empty(self):
        assert validate_cedula_ecuatoriana('') is False


# ──────────────────────────────────────────────────────────────────────────────
# ConvertLeadView tests
# ──────────────────────────────────────────────────────────────────────────────

class TestConvertLead:
    def test_convert_lead_success_creates_bootcamper(self, db, salesperson_user, program):
        lead = Lead.objects.create(
            name='Juan Pérez', phone='0991234567',
            email='juan.perez@test.com',
            status=Lead.Status.QUALIFIED,
            owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'):
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula':     '1713175071',
                'program_id': str(program.id),
            }, format='json')

        assert resp.status_code == 201
        data = resp.json()
        assert data['is_returning'] is False
        assert data['temporary_password'] is not None
        assert data['lead_status'] == Lead.Status.CONVERTED

        lead.refresh_from_db()
        assert lead.status == Lead.Status.CONVERTED
        assert lead.program == program

        # <-- NUEVA ASERCIÓN: Verificar Enrollment -->
        new_user = CustomUser.objects.get(id=data['bootcamper_id'])
        enrollment = Enrollment.objects.get(bootcamper=new_user)
        assert enrollment.bootcamp == program
        assert enrollment.start_date == program.start_date
        assert enrollment.agreed_price == program.total_cost

    def test_convert_lead_invalid_cedula(self, db, salesperson_user, program):
        lead = Lead.objects.create(
            name='Test', phone='0992222222',
            status=Lead.Status.QUALIFIED,
            owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'):
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula': '0000000000', 'program_id': str(program.id),
            }, format='json')
        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_CEDULA'

    def test_convert_lead_program_not_found(self, db, salesperson_user):
        import uuid
        lead = Lead.objects.create(
            name='Test', phone='0993333333',
            status=Lead.Status.QUALIFIED,
            owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        resp = client.post(CONVERT_URL.format(id=lead.id), {
            'cedula': '1713175071', 'program_id': str(uuid.uuid4()),
        }, format='json')
        assert resp.status_code == 404
        assert resp.json()['code'] == 'PROGRAM_NOT_FOUND'

    def test_convert_lead_existing_bootcamper_is_returning(self, db, salesperson_user, program):
        existing = CustomUser.objects.create_user(
            email='returning@test.com', password='testpass123',
            first_name='Re', last_name='Turning',
            role=CustomUser.Role.BOOTCAMPER, cedula='1713175071',
        )
        lead = Lead.objects.create(
            name='Re Turning', phone='0994444444',
            email='returning@test.com',
            status=Lead.Status.QUALIFIED,
            owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'):
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula': '1713175071', 'program_id': str(program.id),
            }, format='json')

        assert resp.status_code == 201
        data = resp.json()
        assert data['is_returning'] is True
        assert data['bootcamper_id'] == str(existing.id)
        assert data['temporary_password'] is None

        # <-- NUEVA ASERCIÓN: Verificar Enrollment para bootcamper recurrente -->
        assert Enrollment.objects.filter(bootcamper=existing, bootcamp=program).exists()

    def test_convert_lead_email_conflict_non_bootcamper(self, db, salesperson_user, program):
        CustomUser.objects.create_user(
            email='admin.conflict@test.com', password='testpass123',
            first_name='Admin', last_name='Conflict',
            role=CustomUser.Role.ADMINISTRATOR,
        )
        lead = Lead.objects.create(
            name='Test Conflict', phone='0995555555',
            email='admin.conflict@test.com',
            status=Lead.Status.QUALIFIED,
            owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        resp = client.post(CONVERT_URL.format(id=lead.id), {
            'cedula': '1713175071', 'program_id': str(program.id),
        }, format='json')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'EMAIL_CONFLICT'

    def test_convert_lead_sends_celery_task(self, db, salesperson_user, program):
        lead = Lead.objects.create(
            name='Celery Test', phone='0996666666',
            email='celery.test@test.com',
            status=Lead.Status.QUALIFIED,
            owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay') as mock_delay:
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula': '1713175071', 'program_id': str(program.id),
            }, format='json')
        assert resp.status_code == 201
        mock_delay.assert_called_once()

    def test_convert_lead_unauthorized_bootcamper(self, db, bootcamper_user, program):
        lead = Lead.objects.create(name='Test', phone='0997777777', status=Lead.Status.QUALIFIED) # <-- CORREGIDO A QUALIFIED
        client = make_client(bootcamper_user)
        resp = client.post(CONVERT_URL.format(id=lead.id), {
            'cedula': '1713175071', 'program_id': str(program.id),
        }, format='json')
        assert resp.status_code == 403


# ──────────────────────────────────────────────────────────────────────────────
# ReturningBootcamperView tests
# ──────────────────────────────────────────────────────────────────────────────

class TestReturningBootcamper:
    def test_returning_bootcamper_creates_lead(self, db, salesperson_user, program, converted_bootcamper):
        client = make_client(salesperson_user)
        resp = client.post(RETURNING_URL, {
            'bootcamper_email': converted_bootcamper.email,
            'program_id':       str(program.id),
        }, format='json')
        assert resp.status_code == 201
        data = resp.json()
        assert data['name'] == converted_bootcamper.get_full_name()
        assert Lead.objects.filter(email=converted_bootcamper.email, program=program).exists()

    def test_returning_bootcamper_not_found(self, db, salesperson_user, program):
        client = make_client(salesperson_user)
        resp = client.post(RETURNING_URL, {
            'bootcamper_email': 'nobody@test.com',
            'program_id':       str(program.id),
        }, format='json')
        assert resp.status_code == 404
        assert resp.json()['code'] == 'BOOTCAMPER_NOT_FOUND'

    def test_returning_bootcamper_creates_note_interaction(self, db, salesperson_user, program, converted_bootcamper):
        client = make_client(salesperson_user)
        resp = client.post(RETURNING_URL, {
            'bootcamper_email': converted_bootcamper.email,
            'program_id':       str(program.id),
            'notes':            'El bootcamper regresa para el nuevo programa.',
        }, format='json')
        assert resp.status_code == 201
        lead = Lead.objects.get(id=resp.json()['id'])
        assert lead.interactions.filter(notes__icontains='regresa').exists()

    def test_returning_bootcamper_wrong_role(self, db, salesperson_user, program, salesperson_user_2=None):
        # A salesperson email should be rejected (not a bootcamper)
        other = CustomUser.objects.create_user(
            email='sales2@test.com', password='testpass123',
            first_name='Sales', last_name='Two',
            role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(salesperson_user)
        resp = client.post(RETURNING_URL, {
            'bootcamper_email': other.email,
            'program_id':       str(program.id),
        }, format='json')
        assert resp.status_code == 404

    def test_returning_bootcamper_program_not_found(self, db, salesperson_user, converted_bootcamper):
        import uuid
        client = make_client(salesperson_user)
        resp = client.post(RETURNING_URL, {
            'bootcamper_email': converted_bootcamper.email,
            'program_id':       str(uuid.uuid4()),
        }, format='json')
        assert resp.status_code == 404
        assert resp.json()['code'] == 'PROGRAM_NOT_FOUND'

    def test_returning_bootcamper_duplicate_active_lead(self, db, salesperson_user, program, converted_bootcamper):
        Lead.objects.create(
            name=converted_bootcamper.get_full_name(),
            phone='0998888888',
            email=converted_bootcamper.email,
            status=Lead.Status.NEW,
            program=program,
        )
        client = make_client(salesperson_user)
        resp = client.post(RETURNING_URL, {
            'bootcamper_email': converted_bootcamper.email,
            'program_id':       str(program.id),
        }, format='json')
        assert resp.status_code == 409
        assert resp.json()['code'] == 'ACTIVE_LEAD_EXISTS'
