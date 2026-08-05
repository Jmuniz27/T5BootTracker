"""Tests for the verify-bootcamper endpoint and its serializer exposure (#259)."""
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead

CONVERT_URL = '/api/leads/{id}/convert/'
VERIFY_URL = '/api/leads/{id}/verify-bootcamper/'
DETAIL_URL = '/api/leads/{id}/'
UPLOAD_URL = '/api/payments/upload/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def convert_lead(salesperson, program, *, name='Ana Invitada', phone='0991234567', email='ana.invitada@test.com'):
    lead = Lead.objects.create(
        name=name, phone=phone, status=Lead.Status.QUALIFIED, owner=salesperson,
    )
    client = make_client(salesperson)
    with patch('apps.notifications.tasks.send_conversion_notification.delay'), \
         patch('apps.notifications.tasks.send_bootcamper_invitation_email.delay'):
        resp = client.post(CONVERT_URL.format(id=lead.id), {
            'cedula': '1713175071', 'program_id': str(program.id), 'email': email,
        }, format='json')
    assert resp.status_code == 201, resp.json()
    bootcamper = CustomUser.objects.get(id=resp.json()['bootcamper_id'])
    return lead, bootcamper


class TestVerifyBootcamperEndpoint:
    def test_owner_can_verify_pending_bootcamper(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        bootcamper.verification_status = CustomUser.VerificationStatus.PENDING_VERIFICATION
        bootcamper.save(update_fields=['verification_status'])

        client = make_client(salesperson_user)
        resp = client.patch(VERIFY_URL.format(id=lead.id))
        assert resp.status_code == 200
        assert resp.json()['bootcamper_verification_status'] == 'VERIFIED'

        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.VERIFIED
        assert bootcamper.verified_by == salesperson_user
        assert bootcamper.verified_at is not None

    def test_admin_can_verify_even_without_owning_the_lead(self, db, salesperson_user, admin_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        bootcamper.verification_status = CustomUser.VerificationStatus.PENDING_VERIFICATION
        bootcamper.save(update_fields=['verification_status'])

        client = make_client(admin_user)
        resp = client.patch(VERIFY_URL.format(id=lead.id))
        assert resp.status_code == 200

        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.VERIFIED
        assert bootcamper.verified_by == admin_user

    def test_non_owner_salesperson_is_forbidden(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        bootcamper.verification_status = CustomUser.VerificationStatus.PENDING_VERIFICATION
        bootcamper.save(update_fields=['verification_status'])

        other = CustomUser.objects.create_user(
            email='otro.vendedor.verify@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(other)
        resp = client.patch(VERIFY_URL.format(id=lead.id))
        assert resp.status_code == 403
        assert resp.json()['code'] == 'NOT_OWNER'

        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.PENDING_VERIFICATION

    def test_bootcamper_still_invited_cannot_be_verified(self, db, salesperson_user, program):
        """El bootcamper convertido arranca en INVITED — no se puede saltar a VERIFIED."""
        lead, bootcamper = convert_lead(salesperson_user, program)
        assert bootcamper.verification_status == CustomUser.VerificationStatus.INVITED

        client = make_client(salesperson_user)
        resp = client.patch(VERIFY_URL.format(id=lead.id))
        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_VERIFICATION_TRANSITION'

    def test_unconverted_lead_is_rejected(self, db, salesperson_user, sample_lead):
        sample_lead.owner = salesperson_user
        sample_lead.save(update_fields=['owner'])

        client = make_client(salesperson_user)
        resp = client.patch(VERIFY_URL.format(id=sample_lead.id))
        assert resp.status_code == 400
        assert resp.json()['code'] == 'NOT_CONVERTED'

    def test_verify_requires_authentication(self, db, salesperson_user, program):
        lead, _ = convert_lead(salesperson_user, program)
        client = APIClient()
        resp = client.patch(VERIFY_URL.format(id=lead.id))
        assert resp.status_code == 401


class TestLeadSerializersExposeVerificationStatus:
    def test_lead_list_exposes_bootcamper_verification_status(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        client = make_client(salesperson_user)
        resp = client.get('/api/leads/')
        assert resp.status_code == 200
        converted = [item for item in resp.json()['converted_leads'] if item['id'] == str(lead.id)]
        assert len(converted) == 1
        assert converted[0]['bootcamper_verification_status'] == 'INVITED'
        assert converted[0]['bootcamper'] == str(bootcamper.id)

    def test_lead_detail_exposes_bootcamper_profile(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        bootcamper.verification_status = CustomUser.VerificationStatus.PENDING_VERIFICATION
        bootcamper.save(update_fields=['verification_status'])

        client = make_client(salesperson_user)
        resp = client.get(DETAIL_URL.format(id=lead.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data['bootcamper_verification_status'] == 'PENDING_VERIFICATION'
        assert data['bootcamper_profile']['email'] == bootcamper.email
        assert data['bootcamper_profile']['verification_status'] == 'PENDING_VERIFICATION'

    def test_unconverted_lead_has_null_bootcamper_fields(self, db, sample_lead):
        assert sample_lead.bootcamper is None


class TestPendingVerificationDoesNotBlockPayments:
    """No-regresión: verificar (o no) un bootcamper no afecta su acceso a pagos."""

    def test_bootcamper_pending_verification_can_still_upload_payment(self, db, program):
        bootcamper = CustomUser.objects.create_user(
            email='pending.payer.verify@test.com',
            password='testpass123',
            first_name='Pending',
            last_name='Payer',
            role=CustomUser.Role.BOOTCAMPER,
            cedula='1713175072',
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
