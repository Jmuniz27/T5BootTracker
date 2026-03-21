"""Shared pytest fixtures for Boot-Tracker backend tests."""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead


@pytest.fixture
def salesperson_user(db):
    user = CustomUser.objects.create_user(
        email='salesperson@test.com',
        password='testpass123',
        first_name='Sale',
        last_name='Person',
        role=CustomUser.Role.SALESPERSON,
    )
    return user


@pytest.fixture
def bootcamper_user(db):
    user = CustomUser.objects.create_user(
        email='bootcamper@test.com',
        password='testpass123',
        first_name='Boot',
        last_name='Camper',
        role=CustomUser.Role.BOOTCAMPER,
    )
    return user


@pytest.fixture
def admin_user(db):
    user = CustomUser.objects.create_user(
        email='admin@test.com',
        password='testpass123',
        first_name='Admin',
        last_name='User',
        role=CustomUser.Role.ADMINISTRATOR,
        is_staff=True,
    )
    return user


@pytest.fixture
def auth_client(db):
    """Factory that returns an authenticated APIClient for a given user."""
    def _make_client(user):
        client = APIClient()
        refresh = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        return client
    return _make_client


@pytest.fixture
def sample_lead(db):
    return Lead.objects.create(
        name='Test Lead',
        phone='0999000001',
        source=Lead.Source.MANUAL,
        status=Lead.Status.NEW,
    )


@pytest.fixture
def assigned_lead(db, salesperson_user):
    from django.utils.timezone import now
    return Lead.objects.create(
        name='Assigned Lead',
        phone='0999000002',
        source=Lead.Source.INSTAGRAM,
        status=Lead.Status.CONTACTED,
        owner=salesperson_user,
        assigned_at=now(),
    )
