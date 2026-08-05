"""Tests for the bootcamper onboarding token and activation endpoints (#253)."""
from unittest.mock import patch

from django.core import signing
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.authentication.services import (
    ONBOARDING_TOKEN_SALT,
    make_onboarding_token,
    read_onboarding_token,
)
from apps.leads.models import Lead

CONVERT_URL = '/api/leads/{id}/convert/'
ONBOARDING_URL = '/api/auth/onboarding/{token}/'
ACTIVATE_URL = '/api/auth/onboarding/{token}/activate/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def convert_lead(salesperson, program, *, name='Ana Invitada', phone='0991234567', email='ana.invitada@test.com'):
    """Runs a real conversion over HTTP so the invitation token is issued exactly
    as it would be in production, and returns (bootcamper, invitation_link)."""
    lead = Lead.objects.create(
        name=name, phone=phone, status=Lead.Status.QUALIFIED, owner=salesperson,
    )
    client = make_client(salesperson)
    with patch('apps.notifications.tasks.send_conversion_notification.delay'):
        resp = client.post(CONVERT_URL.format(id=lead.id), {
            'cedula': '1713175071', 'program_id': str(program.id), 'email': email,
        }, format='json')
    assert resp.status_code == 201, resp.json()
    data = resp.json()
    bootcamper = CustomUser.objects.get(id=data['bootcamper_id'])
    token = data['invitation_link'].rsplit('/', 1)[-1]
    return bootcamper, token


class TestConversionIssuesInvitation:
    def test_conversion_response_has_invitation_link_and_no_password(self, db, salesperson_user, program):
        bootcamper, token = convert_lead(salesperson_user, program)
        assert token
        assert bootcamper.has_usable_password() is False
        assert bootcamper.verification_status == CustomUser.VerificationStatus.INVITED

    def test_returning_bootcamper_has_no_invitation_link(self, db, salesperson_user, program, converted_bootcamper):
        lead = Lead.objects.create(
            name='Otra vez', phone='0991110000',
            email=converted_bootcamper.email,
            status=Lead.Status.QUALIFIED, owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'):
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula': '1713175071', 'program_id': str(program.id),
                'email': converted_bootcamper.email,
            }, format='json')
        assert resp.status_code == 201
        assert resp.json()['invitation_link'] is None
        converted_bootcamper.refresh_from_db()
        # No se toca la contraseña de un bootcamper recurrente.
        assert converted_bootcamper.has_usable_password() is True


class TestOnboardingGet:
    def test_valid_token_returns_prefillable_data(self, db, salesperson_user, program):
        bootcamper, token = convert_lead(salesperson_user, program, name='Carla Onboarding')
        cache.clear()
        client = APIClient()
        resp = client.get(ONBOARDING_URL.format(token=token))
        assert resp.status_code == 200
        data = resp.json()
        assert data['email'] == bootcamper.email
        assert data['first_name'] == 'Carla'

    def test_tampered_token_is_invalid(self, db):
        cache.clear()
        client = APIClient()
        resp = client.get(ONBOARDING_URL.format(token='not-a-real-token'))
        assert resp.status_code == 400
        assert resp.json()['code'] == 'TOKEN_INVALID'

    def test_expired_token(self, db, salesperson_user, program):
        bootcamper, _ = convert_lead(salesperson_user, program)
        # Firma un token con el mismo iat pero max_age=0 para forzar la
        # rama SignatureExpired sin depender de tiempo real transcurrido.
        stale_token = signing.dumps(
            {'uid': str(bootcamper.id), 'iat': bootcamper.onboarding_token_issued_at.isoformat()},
            salt=ONBOARDING_TOKEN_SALT,
        )
        cache.clear()
        with patch('apps.authentication.services.ONBOARDING_TOKEN_MAX_AGE', -1):
            client = APIClient()
            resp = client.get(ONBOARDING_URL.format(token=stale_token))
        assert resp.status_code == 400
        assert resp.json()['code'] == 'TOKEN_EXPIRED'

    def test_get_has_no_side_effects(self, db, salesperson_user, program):
        bootcamper, token = convert_lead(salesperson_user, program)
        cache.clear()
        client = APIClient()
        client.get(ONBOARDING_URL.format(token=token))
        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.INVITED
        assert bootcamper.has_usable_password() is False


class TestOnboardingActivate:
    def test_activation_succeeds_and_sets_password(self, db, salesperson_user, program):
        bootcamper, token = convert_lead(salesperson_user, program)
        cache.clear()  # el endpoint comparte el scope 'auth' (5/min)
        client = APIClient()
        resp = client.post(ACTIVATE_URL.format(token=token), {
            'password': 'nueva-clave-123',
            'password_confirm': 'nueva-clave-123',
        }, format='json')
        assert resp.status_code == 200

        bootcamper.refresh_from_db()
        assert bootcamper.has_usable_password() is True
        assert bootcamper.check_password('nueva-clave-123') is True
        assert bootcamper.verification_status == CustomUser.VerificationStatus.PENDING_VERIFICATION
        assert bootcamper.onboarding_completed_at is not None

    def test_second_activation_attempt_is_rejected(self, db, salesperson_user, program):
        bootcamper, token = convert_lead(salesperson_user, program)
        cache.clear()
        client = APIClient()
        first = client.post(ACTIVATE_URL.format(token=token), {
            'password': 'primera-clave-1',
            'password_confirm': 'primera-clave-1',
        }, format='json')
        assert first.status_code == 200

        cache.clear()
        second = client.post(ACTIVATE_URL.format(token=token), {
            'password': 'segunda-clave-2',
            'password_confirm': 'segunda-clave-2',
        }, format='json')
        assert second.status_code == 400
        assert second.json()['code'] == 'ALREADY_ACTIVATED'

        bootcamper.refresh_from_db()
        # La segunda contraseña nunca se aplicó.
        assert bootcamper.check_password('primera-clave-1') is True

    def test_password_mismatch_is_rejected(self, db, salesperson_user, program):
        _, token = convert_lead(salesperson_user, program)
        cache.clear()
        client = APIClient()
        resp = client.post(ACTIVATE_URL.format(token=token), {
            'password': 'una-clave-123',
            'password_confirm': 'otra-clave-456',
        }, format='json')
        assert resp.status_code == 400

    def test_tampered_token_cannot_activate(self, db):
        cache.clear()
        client = APIClient()
        resp = client.post(ACTIVATE_URL.format(token='garbage-token'), {
            'password': 'cualquier-clave1',
            'password_confirm': 'cualquier-clave1',
        }, format='json')
        assert resp.status_code == 400
        assert resp.json()['code'] == 'TOKEN_INVALID'

    def test_resend_supersedes_the_previous_token(self, db, salesperson_user, program):
        bootcamper, old_token = convert_lead(salesperson_user, program)
        # Simula un reenvío (#255): se emite un token nuevo para el mismo usuario.
        make_onboarding_token(bootcamper)

        cache.clear()
        client = APIClient()
        resp = client.post(ACTIVATE_URL.format(token=old_token), {
            'password': 'clave-vieja-123',
            'password_confirm': 'clave-vieja-123',
        }, format='json')
        assert resp.status_code == 400
        assert resp.json()['code'] == 'TOKEN_SUPERSEDED'


class TestReadOnboardingTokenUnit:
    def test_read_onboarding_token_rejects_unknown_user(self, db):
        token = signing.dumps({'uid': '00000000-0000-0000-0000-000000000000', 'iat': 'x'}, salt=ONBOARDING_TOKEN_SALT)
        try:
            read_onboarding_token(token)
            assert False, 'expected ValidationError'
        except Exception as exc:
            assert exc.detail['code'] == 'TOKEN_INVALID'
