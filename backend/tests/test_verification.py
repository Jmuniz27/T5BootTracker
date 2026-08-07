"""Tests for bootcamper profile verification fields and transitions (#254)."""
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.authentication.services import verify_bootcamper

UPLOAD_URL = '/api/payments/upload/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


class TestVerificationStatusDefault:
    def test_bootcamper_created_without_explicit_status_is_verified(self, db):
        """No se marca retroactivamente el historial como pendiente."""
        user = CustomUser.objects.create_user(
            email='legacy.bootcamper@test.com',
            password='testpass123',
            first_name='Legacy',
            last_name='Bootcamper',
            role=CustomUser.Role.BOOTCAMPER,
        )
        assert user.verification_status == CustomUser.VerificationStatus.VERIFIED
        assert user.verified_by is None
        assert user.verified_at is None
        assert user.onboarding_completed_at is None


class TestVerifyBootcamperTransition:
    def test_cannot_skip_invited_to_verified(self, db, admin_user):
        user = CustomUser.objects.create_user(
            email='invited.bootcamper@test.com',
            password='testpass123',
            first_name='Invited',
            last_name='Bootcamper',
            role=CustomUser.Role.BOOTCAMPER,
            verification_status=CustomUser.VerificationStatus.INVITED,
        )
        with pytest.raises(ValidationError) as exc_info:
            verify_bootcamper(user, admin_user)
        assert exc_info.value.detail['code'] == 'INVALID_VERIFICATION_TRANSITION'

        user.refresh_from_db()
        assert user.verification_status == CustomUser.VerificationStatus.INVITED

    def test_pending_verification_to_verified_succeeds(self, db, admin_user):
        user = CustomUser.objects.create_user(
            email='pending.bootcamper@test.com',
            password='testpass123',
            first_name='Pending',
            last_name='Bootcamper',
            role=CustomUser.Role.BOOTCAMPER,
            verification_status=CustomUser.VerificationStatus.PENDING_VERIFICATION,
        )
        verify_bootcamper(user, admin_user)

        user.refresh_from_db()
        assert user.verification_status == CustomUser.VerificationStatus.VERIFIED
        assert user.verified_by == admin_user
        assert user.verified_at is not None

    def test_already_verified_cannot_be_reverified(self, db, admin_user, converted_bootcamper):
        with pytest.raises(ValidationError) as exc_info:
            verify_bootcamper(converted_bootcamper, admin_user)
        assert exc_info.value.detail['code'] == 'INVALID_VERIFICATION_TRANSITION'


class TestPendingVerificationNotBlocking:
    """No-regresión explícita: PENDING_VERIFICATION no debe devolver 403 en pagos."""

    def test_bootcamper_pending_verification_can_upload_payment(self, db, program):
        bootcamper = CustomUser.objects.create_user(
            email='pending.payer@test.com',
            password='testpass123',
            first_name='Pending',
            last_name='Payer',
            role=CustomUser.Role.BOOTCAMPER,
            cedula='1713175071',
            verification_status=CustomUser.VerificationStatus.PENDING_VERIFICATION,
        )
        client = make_client(bootcamper)
        fake_file = SimpleUploadedFile('receipt.jpg', b'fake-image-data', content_type='image/jpeg')
        with patch('apps.payments.tasks.process_payment_ocr.delay'):
            resp = client.post(
                UPLOAD_URL,
                {'receipt_file': fake_file, 'program_id': str(program.id)},
                format='multipart',
            )
        assert resp.status_code == 201
