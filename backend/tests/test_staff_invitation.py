"""Tests for the staff invitation email flow (#295).

Reuses the bootcamper onboarding mechanism (make_onboarding_token /
build_invitation_link / read_onboarding_token) for any role: creating a
staff user without a password sends an invitation link instead of an
unusable password with no way in.
"""
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser

USER_LIST_URL = '/api/users/'
ONBOARDING_URL = '/api/auth/onboarding/{token}/'
ACTIVATE_URL = '/api/auth/onboarding/{token}/activate/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def create_staff_user(admin_user, *, role=CustomUser.Role.SALESPERSON, email='nuevo.staff@test.com'):
    """Creates a user with no password over HTTP, capturing the real invitation
    link the same way the frontend would receive it (via the sent email)."""
    client = make_client(admin_user)
    with patch('apps.notifications.tasks.send_staff_invitation_email.delay') as mock_delay:
        resp = client.post(USER_LIST_URL, {
            'email': email, 'first_name': 'Nuevo', 'last_name': 'Staff', 'role': role,
        }, format='json')
    assert resp.status_code == 201, resp.json()
    user_id = resp.json()['id']
    invitation_link = mock_delay.call_args[0][1]
    token = invitation_link.rsplit('/', 1)[-1]
    return CustomUser.objects.get(id=user_id), token


class TestCreateUserWithoutPasswordSendsInvitation:
    def test_dispatches_invitation_task_with_link(self, db, admin_user):
        client = make_client(admin_user)
        with patch('apps.notifications.tasks.send_staff_invitation_email.delay') as mock_delay:
            resp = client.post(USER_LIST_URL, {
                'email': 'finanzas.nueva@test.com', 'first_name': 'Fina', 'last_name': 'Nueva',
                'role': CustomUser.Role.FINANCE,
            }, format='json')
        assert resp.status_code == 201
        created = CustomUser.objects.get(email='finanzas.nueva@test.com')
        mock_delay.assert_called_once()
        assert mock_delay.call_args[0][0] == str(created.id)
        assert 'onboarding' in mock_delay.call_args[0][1]

    def test_user_starts_invited_with_unusable_password(self, db, admin_user):
        user, _ = create_staff_user(admin_user)
        assert user.verification_status == CustomUser.VerificationStatus.INVITED
        assert user.has_usable_password() is False

    def test_coordinator_without_password_is_not_invited(self, db, admin_user):
        """El coordinador no entra a la app: sigue sin invitación ni correo."""
        client = make_client(admin_user)
        with patch('apps.notifications.tasks.send_staff_invitation_email.delay') as mock_delay:
            resp = client.post(USER_LIST_URL, {
                'email': 'coord.nuevo@test.com', 'first_name': 'Coord', 'last_name': 'Nuevo',
                'role': CustomUser.Role.COORDINATOR, 'coordinator_scope': 'GENERAL',
            }, format='json')
        assert resp.status_code == 201
        mock_delay.assert_not_called()

    def test_email_is_actually_sent_with_the_link(self, db, admin_user):
        from apps.notifications.tasks import send_staff_invitation_email

        client = make_client(admin_user)
        with patch('apps.notifications.tasks.send_staff_invitation_email.delay'):
            resp = client.post(USER_LIST_URL, {
                'email': 'correo.real.staff@test.com', 'first_name': 'Correo', 'last_name': 'Real',
                'role': CustomUser.Role.SALESPERSON,
            }, format='json')
        from apps.authentication.services import build_invitation_link, make_onboarding_token

        user_id = resp.json()['id']
        user = CustomUser.objects.get(id=user_id)
        link = build_invitation_link(make_onboarding_token(user))

        send_staff_invitation_email(str(user.id), link)

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == ['correo.real.staff@test.com']
        assert link in msg.body


class TestStaffOnboardingActivation:
    def test_staff_can_activate_and_log_in(self, db, admin_user):
        user, token = create_staff_user(admin_user, role=CustomUser.Role.FINANCE)
        cache.clear()
        client = APIClient()

        resp = client.post(ACTIVATE_URL.format(token=token), {
            'password': 'nueva-clave-123',
            'password_confirm': 'nueva-clave-123',
            'data_consent': True,
        }, format='json')
        assert resp.status_code == 200

        user.refresh_from_db()
        assert user.has_usable_password() is True
        assert user.check_password('nueva-clave-123') is True

        login = client.post('/api/auth/login/', {
            'email': user.email, 'password': 'nueva-clave-123',
        }, format='json')
        assert login.status_code == 200

    def test_staff_activation_does_not_set_bootcamper_pending_verification(self, db, admin_user):
        """PENDING_VERIFICATION sólo tiene sentido para bootcampers (issue #254);
        un vendedor/finanzas/admin activado debe quedar VERIFIED directamente."""
        user, token = create_staff_user(admin_user, role=CustomUser.Role.SALESPERSON)
        cache.clear()
        client = APIClient()

        client.post(ACTIVATE_URL.format(token=token), {
            'password': 'otra-clave-456',
            'password_confirm': 'otra-clave-456',
            'data_consent': True,
        }, format='json')

        user.refresh_from_db()
        assert user.verification_status == CustomUser.VerificationStatus.VERIFIED

    def test_onboarding_get_works_for_staff_without_enrollment(self, db, admin_user):
        """El GET de preview no debe romperse por no tener Enrollment (eso
        sólo existe para bootcampers)."""
        user, token = create_staff_user(admin_user, role=CustomUser.Role.SALESPERSON)
        cache.clear()
        client = APIClient()
        resp = client.get(ONBOARDING_URL.format(token=token))
        assert resp.status_code == 200
        assert resp.json()['email'] == user.email
        assert resp.json()['program_name'] is None
