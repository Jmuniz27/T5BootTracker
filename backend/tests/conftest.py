"""Shared pytest fixtures for Boot-Tracker backend tests."""
import pytest
from decimal import Decimal
from datetime import date, timedelta
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
def finance_user(db):
    """Finanzas: hace todo lo del vendedor y además monitorea los pagos."""
    return CustomUser.objects.create_user(
        email='finance@test.com',
        password='testpass123',
        first_name='Fina',
        last_name='Nzas',
        role=CustomUser.Role.FINANCE,
    )


@pytest.fixture
def other_finance_user(db):
    """Segunda persona de Finanzas, para probar carreras y carteras ajenas."""
    return CustomUser.objects.create_user(
        email='finance2@test.com',
        password='testpass123',
        first_name='Otra',
        last_name='Finanzas',
        role=CustomUser.Role.FINANCE,
    )


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
    return Lead.objects.create(
        name='Assigned Lead',
        phone='0991112222',
        status=Lead.Status.INTERESTED,
        owner=salesperson_user
    )


@pytest.fixture
def program(db):
    from apps.programs.models import Program
    return Program.objects.create(
        name='Python Full Stack Abril 2026',
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() + timedelta(days=60),
        total_cost=Decimal('1200.00'),
    )


@pytest.fixture
def active_enrollment(db, converted_bootcamper, program):
    from apps.programs.models import Enrollment
    return Enrollment.objects.create(
        bootcamper=converted_bootcamper,
        bootcamp=program,
        status=Enrollment.Status.ACTIVE,
        start_date=date.today() - timedelta(days=30),
        agreed_price=program.total_cost,
    )


@pytest.fixture
def coordinator_config(db, program):
    from apps.programs.models import CoordinatorEmailConfig
    CoordinatorEmailConfig.objects.create(
        program=program,
        email='coord.to@espol.edu.ec',
        name='Coordinador Principal',
        recipient_type='TO',
    )
    CoordinatorEmailConfig.objects.create(
        program=program,
        email='coord.cc@espol.edu.ec',
        name='Coordinador Copia',
        recipient_type='CC',
    )
    return program


@pytest.fixture
def converted_bootcamper(db):
    return CustomUser.objects.create_user(
        email='bootcamper.conv@test.com',
        password='testpass123',
        first_name='Boot',
        last_name='Camper',
        role=CustomUser.Role.BOOTCAMPER,
        cedula='1713175071',
    )


@pytest.fixture
def draft_payment(db, converted_bootcamper, program):
    from apps.payments.models import Payment
    return Payment.objects.create(
        bootcamper=converted_bootcamper,
        program=program,
        receipt_file='receipts/test_draft.jpg',
        receipt_file_type='image',
        status=Payment.Status.DRAFT,
        ocr_bank_name='Banco Pichincha',
        ocr_amount=Decimal('150.00'),
        ocr_raw_text='Banco Pichincha\nTransferencia exitosa\nMonto: $150.00',
    )


@pytest.fixture
def pending_payment(db, converted_bootcamper, program):
    from apps.payments.models import Payment
    return Payment.objects.create(
        bootcamper=converted_bootcamper,
        program=program,
        receipt_file='receipts/test.jpg',
        receipt_file_type='image',
        status=Payment.Status.PENDING,
    )


@pytest.fixture
def approved_payment(db, converted_bootcamper, program):
    from apps.payments.models import Payment
    return Payment.objects.create(
        bootcamper=converted_bootcamper,
        program=program,
        receipt_file='receipts/test2.jpg',
        receipt_file_type='image',
        status=Payment.Status.APPROVED,
        confirmed_amount=Decimal('400.00'),
        confirmed_bank_name='Banco Pichincha',
    )
