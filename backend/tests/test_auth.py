"""Tests for authentication endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser

LOGIN_URL            = '/api/auth/login/'
LOGOUT_URL           = '/api/auth/logout/'
REFRESH_URL          = '/api/auth/token/refresh/'
PASSWORD_RESET_URL   = '/api/auth/password-reset/'
PASSWORD_CONFIRM_URL = '/api/auth/password-reset/confirm/'
ME_URL               = '/api/auth/me/'


@pytest.fixture
def active_user(db):
    return CustomUser.objects.create_user(
        email='user@test.com',
        password='validpass123',
        first_name='Test',
        last_name='User',
        role=CustomUser.Role.SALESPERSON,
    )


@pytest.fixture
def inactive_user(db):
    return CustomUser.objects.create_user(
        email='inactive@test.com',
        password='validpass123',
        first_name='Inactive',
        last_name='User',
        role=CustomUser.Role.SALESPERSON,
        is_active=False,
    )


class TestLogin:
    def test_login_success(self, active_user):
        client = APIClient()
        resp = client.post(LOGIN_URL, {'email': 'user@test.com', 'password': 'validpass123'}, format='json')
        assert resp.status_code == 200
        data = resp.json()
        assert 'access' in data
        assert 'refresh' in data
        assert data['user']['email'] == 'user@test.com'
        assert data['user']['role'] == CustomUser.Role.SALESPERSON

    def test_login_invalid_credentials(self, active_user):
        client = APIClient()
        resp = client.post(LOGIN_URL, {'email': 'user@test.com', 'password': 'wrongpass'}, format='json')
        assert resp.status_code == 401
        assert resp.json()['code'] == 'INVALID_CREDENTIALS'

    def test_login_inactive_user(self, inactive_user):
        """Quien conoce la contraseña sí merece saber que la cuenta está desactivada."""
        client = APIClient()
        resp = client.post(LOGIN_URL, {'email': 'inactive@test.com', 'password': 'validpass123'}, format='json')
        assert resp.status_code == 403
        assert resp.json()['code'] == 'ACCOUNT_INACTIVE'

    def test_login_inactive_user_with_wrong_password_does_not_leak(self, inactive_user):
        """Sin la contraseña correcta, una cuenta desactivada es indistinguible
        de una inexistente (SEC-3: enumeración de usuarios).

        Antes se consultaba `is_active` antes de validar la contraseña, así que
        bastaba con probar cualquier clave para saber si un email existía.
        """
        client = APIClient()
        resp = client.post(
            LOGIN_URL, {'email': 'inactive@test.com', 'password': 'wrongpass'}, format='json'
        )
        assert resp.status_code == 401
        assert resp.json()['code'] == 'INVALID_CREDENTIALS'

    def test_login_unknown_email_matches_inactive_response(self, inactive_user):
        """La respuesta para un email inexistente es idéntica a la de una cuenta
        desactivada con contraseña incorrecta: mismo código y mismo mensaje."""
        client = APIClient()
        desconocido = client.post(
            LOGIN_URL, {'email': 'nadie@test.com', 'password': 'wrongpass'}, format='json'
        )
        desactivado = client.post(
            LOGIN_URL, {'email': 'inactive@test.com', 'password': 'wrongpass'}, format='json'
        )
        assert desconocido.status_code == desactivado.status_code == 401
        assert desconocido.json() == desactivado.json()


class TestLogout:
    def test_logout_blacklists_token(self, active_user):
        cache.clear()
        client = APIClient()
        refresh = RefreshToken.for_user(active_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')

        # Logout with the refresh token
        resp = client.post(
            LOGOUT_URL,
            {'refresh': str(refresh)},
            format='json',
            REMOTE_ADDR='10.10.10.1',
        )
        assert resp.status_code == 204

        # Using the same refresh token again should fail
        client2 = APIClient()
        resp2 = client2.post(
            REFRESH_URL,
            {'refresh': str(refresh)},
            format='json',
            REMOTE_ADDR='10.10.10.1',
        )
        assert resp2.status_code == 401


class TestTokenRefresh:
    def test_token_refresh_requires_token(self):
        cache.clear()
        client = APIClient()
        resp = client.post(REFRESH_URL, {}, format='json', REMOTE_ADDR='10.10.10.2')
        assert resp.status_code == 400
        assert resp.json()['code'] == 'MISSING_REFRESH_TOKEN'

    def test_token_refresh(self, active_user):
        cache.clear()
        refresh = RefreshToken.for_user(active_user)
        client = APIClient()
        resp = client.post(
            REFRESH_URL,
            {'refresh': str(refresh)},
            format='json',
            REMOTE_ADDR='10.10.10.3',
        )
        assert resp.status_code == 200
        data = resp.json()
        assert 'access' in data
        assert 'refresh' in data

    def test_token_refresh_rotates_and_invalidates_old_token(self, active_user):
        cache.clear()
        refresh = RefreshToken.for_user(active_user)
        client = APIClient()

        first = client.post(
            REFRESH_URL,
            {'refresh': str(refresh)},
            format='json',
            REMOTE_ADDR='10.10.10.4',
        )
        assert first.status_code == 200
        first_data = first.json()
        assert first_data['refresh'] != str(refresh)

        second = client.post(
            REFRESH_URL,
            {'refresh': str(refresh)},
            format='json',
            REMOTE_ADDR='10.10.10.4',
        )
        assert second.status_code == 401
        assert second.json()['code'] == 'INVALID_TOKEN'

        third = client.post(
            REFRESH_URL,
            {'refresh': first_data['refresh']},
            format='json',
            REMOTE_ADDR='10.10.10.4',
        )
        assert third.status_code == 200
        assert 'access' in third.json()

    def test_token_refresh_rate_limited(self, db):
        cache.clear()
        client = APIClient()

        for _ in range(5):
            resp = client.post(
                REFRESH_URL,
                {'refresh': 'not-a-valid-token'},
                format='json',
                REMOTE_ADDR='10.10.10.5',
            )
            assert resp.status_code == 401

        limited = client.post(
            REFRESH_URL,
            {'refresh': 'not-a-valid-token'},
            format='json',
            REMOTE_ADDR='10.10.10.5',
        )
        assert limited.status_code == 429


class TestMeUpdate:
    def _auth_client(self, user):
        client = APIClient()
        refresh = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        return client

    def test_me_patch_allows_profile_fields(self, active_user):
        client = self._auth_client(active_user)
        resp = client.patch(ME_URL, {
            'first_name': 'Nuevo',
            'last_name':  'Nombre',
            'phone':      '0999999999',
        }, format='json')
        assert resp.status_code == 200
        active_user.refresh_from_db()
        assert active_user.first_name == 'Nuevo'
        assert active_user.last_name == 'Nombre'
        assert active_user.phone == '0999999999'

    def test_me_patch_cannot_escalate_role(self, active_user):
        client = self._auth_client(active_user)
        resp = client.patch(ME_URL, {'role': CustomUser.Role.ADMINISTRATOR}, format='json')
        assert resp.status_code == 200
        active_user.refresh_from_db()
        assert active_user.role == CustomUser.Role.SALESPERSON
        assert resp.json()['role'] == CustomUser.Role.SALESPERSON

    def test_me_patch_cannot_change_email(self, active_user):
        client = self._auth_client(active_user)
        resp = client.patch(ME_URL, {'email': 'hacker@test.com'}, format='json')
        assert resp.status_code == 200
        active_user.refresh_from_db()
        assert active_user.email == 'user@test.com'

    def test_me_patch_cannot_change_is_active(self, active_user):
        client = self._auth_client(active_user)
        resp = client.patch(ME_URL, {'is_active': False, 'first_name': 'Sigo'}, format='json')
        assert resp.status_code == 200
        active_user.refresh_from_db()
        assert active_user.is_active is True
        assert active_user.first_name == 'Sigo'


class TestPasswordReset:
    def test_password_reset_request_always_200(self, db):
        client = APIClient()
        # Non-existent email
        resp = client.post(PASSWORD_RESET_URL, {'email': 'nobody@test.com'}, format='json')
        assert resp.status_code == 200

    def test_password_reset_request_existing_email(self, active_user):
        client = APIClient()
        with patch('apps.authentication.views._get_redis') as mock_redis_fn, \
             patch('apps.notifications.tasks.send_password_reset_email') as mock_task:
            mock_r = MagicMock()
            mock_redis_fn.return_value = mock_r
            resp = client.post(PASSWORD_RESET_URL, {'email': 'user@test.com'}, format='json')
        assert resp.status_code == 200
        mock_r.setex.assert_called_once()
        mock_task.delay.assert_called_once()
        email_arg, link_arg = mock_task.delay.call_args[0]
        assert email_arg == 'user@test.com'
        assert 'reset-password?token=' in link_arg

    def test_password_reset_confirm_success(self, active_user):
        client = APIClient()
        token = 'test-reset-token-uuid'
        with patch('apps.authentication.views._get_redis') as mock_redis_fn:
            mock_r = MagicMock()
            mock_r.get.return_value = str(active_user.pk).encode()
            mock_redis_fn.return_value = mock_r

            resp = client.post(PASSWORD_CONFIRM_URL, {
                'token':            token,
                'password':         'newpassword123',
                'password_confirm': 'newpassword123',
            }, format='json')

        assert resp.status_code == 200
        active_user.refresh_from_db()
        assert active_user.check_password('newpassword123')

    def test_password_reset_confirm_expired_token(self, db):
        client = APIClient()
        with patch('apps.authentication.views._get_redis') as mock_redis_fn:
            mock_r = MagicMock()
            mock_r.get.return_value = None  # Token not in Redis
            mock_redis_fn.return_value = mock_r

            resp = client.post(PASSWORD_CONFIRM_URL, {
                'token':            'expired-token',
                'password':         'newpassword123',
                'password_confirm': 'newpassword123',
            }, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'TOKEN_EXPIRED'

    def test_password_reset_confirm_password_mismatch(self, db):
        client = APIClient()
        with patch('apps.authentication.views._get_redis') as mock_redis_fn:
            mock_r = MagicMock()
            mock_r.get.return_value = b'some-user-pk'
            mock_redis_fn.return_value = mock_r

            resp = client.post(PASSWORD_CONFIRM_URL, {
                'token':            'some-token',
                'password':         'newpassword123',
                'password_confirm': 'differentpassword',
            }, format='json')

        assert resp.status_code == 400
