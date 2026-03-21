"""Tests for authentication endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser

LOGIN_URL            = '/api/auth/login/'
LOGOUT_URL           = '/api/auth/logout/'
REFRESH_URL          = '/api/auth/token/refresh/'
PASSWORD_RESET_URL   = '/api/auth/password-reset/'
PASSWORD_CONFIRM_URL = '/api/auth/password-reset/confirm/'


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
        client = APIClient()
        resp = client.post(LOGIN_URL, {'email': 'inactive@test.com', 'password': 'validpass123'}, format='json')
        assert resp.status_code == 403
        assert resp.json()['code'] == 'ACCOUNT_INACTIVE'


class TestLogout:
    def test_logout_blacklists_token(self, active_user):
        client = APIClient()
        refresh = RefreshToken.for_user(active_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')

        # Logout with the refresh token
        resp = client.post(LOGOUT_URL, {'refresh': str(refresh)}, format='json')
        assert resp.status_code == 204

        # Using the same refresh token again should fail
        client2 = APIClient()
        resp2 = client2.post(REFRESH_URL, {'refresh': str(refresh)}, format='json')
        assert resp2.status_code == 401


class TestTokenRefresh:
    def test_token_refresh(self, active_user):
        refresh = RefreshToken.for_user(active_user)
        client = APIClient()
        resp = client.post(REFRESH_URL, {'refresh': str(refresh)}, format='json')
        assert resp.status_code == 200
        assert 'access' in resp.json()


class TestPasswordReset:
    def test_password_reset_request_always_200(self, db):
        client = APIClient()
        # Non-existent email
        resp = client.post(PASSWORD_RESET_URL, {'email': 'nobody@test.com'}, format='json')
        assert resp.status_code == 200

    def test_password_reset_request_existing_email(self, active_user):
        client = APIClient()
        with patch('apps.authentication.views._get_redis') as mock_redis_fn:
            mock_r = MagicMock()
            mock_redis_fn.return_value = mock_r
            resp = client.post(PASSWORD_RESET_URL, {'email': 'user@test.com'}, format='json')
        assert resp.status_code == 200
        mock_r.setex.assert_called_once()

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
