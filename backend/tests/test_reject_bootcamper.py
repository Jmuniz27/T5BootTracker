"""Tests for rejecting a bootcamper's onboarding data and its emails (#309)."""
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead

CONVERT_URL = '/api/leads/{id}/convert/'
VERIFY_URL = '/api/leads/{id}/verify-bootcamper/'
REJECT_URL = '/api/leads/{id}/reject-bootcamper/'

MOTIVO = 'La cédula registrada no coincide con la del documento que enviaste.'

APPROVED_TASK = 'apps.notifications.tasks.send_verification_approved_email.delay'
REJECTED_TASK = 'apps.notifications.tasks.send_verification_rejected_email.delay'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def convert_lead(salesperson, program, *, email='ana.invitada@test.com'):
    lead = Lead.objects.create(
        name='Ana Invitada', phone='0991234567',
        status=Lead.Status.QUALIFIED, owner=salesperson,
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


def set_pending(bootcamper):
    bootcamper.verification_status = CustomUser.VerificationStatus.PENDING_VERIFICATION
    bootcamper.save(update_fields=['verification_status'])


@pytest.fixture(autouse=True)
def sin_correos():
    """Los correos van por Celery; acá no se ejercita el broker."""
    with patch(APPROVED_TASK) as aprobado, patch(REJECTED_TASK) as rechazado:
        yield {'aprobado': aprobado, 'rechazado': rechazado}


class TestRejectBootcamperEndpoint:
    def test_owner_can_reject_with_a_reason(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)

        resp = make_client(salesperson_user).patch(
            REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json',
        )

        assert resp.status_code == 200
        assert resp.json()['bootcamper_verification_status'] == 'REJECTED'

        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.REJECTED
        assert bootcamper.verification_rejection_reason == MOTIVO
        assert bootcamper.verified_by == salesperson_user, 'queda el rastro de quién revisó'
        assert bootcamper.verified_at is not None

    def test_admin_can_reject_without_owning_the_lead(self, db, salesperson_user, admin_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)

        resp = make_client(admin_user).patch(
            REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json',
        )

        assert resp.status_code == 200

    def test_other_salesperson_is_forbidden(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)
        ajeno = CustomUser.objects.create_user(
            email='otro.vendedor@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor',
            role=CustomUser.Role.SALESPERSON,
        )

        resp = make_client(ajeno).patch(
            REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json',
        )

        assert resp.status_code == 403
        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.PENDING_VERIFICATION

    @pytest.mark.parametrize('payload', [{}, {'reason': ''}, {'reason': '   '}])
    def test_reason_is_required(self, db, salesperson_user, program, payload):
        """Sin motivo el correo no le dice al bootcamper qué corregir."""
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)

        resp = make_client(salesperson_user).patch(
            REJECT_URL.format(id=lead.id), payload, format='json',
        )

        assert resp.status_code == 400
        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.PENDING_VERIFICATION

    def test_cannot_reject_someone_who_never_activated(self, db, salesperson_user, program):
        """En INVITED no hay datos que revisar todavía."""
        lead, bootcamper = convert_lead(salesperson_user, program)
        assert bootcamper.verification_status == CustomUser.VerificationStatus.INVITED

        resp = make_client(salesperson_user).patch(
            REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json',
        )

        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_VERIFICATION_TRANSITION'

    def test_cannot_reject_an_unconverted_lead(self, db, salesperson_user, sample_lead):
        sample_lead.owner = salesperson_user
        sample_lead.save(update_fields=['owner'])

        resp = make_client(salesperson_user).patch(
            REJECT_URL.format(id=sample_lead.id), {'reason': MOTIVO}, format='json',
        )

        assert resp.status_code == 400
        assert resp.json()['code'] == 'NOT_CONVERTED'

    def test_reject_requires_authentication(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)

        resp = APIClient().patch(
            REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json',
        )

        assert resp.status_code == 401


class TestRejectionIsNotTerminal:
    """Un rechazo tiene que poder resolverse, o el bootcamper queda atrapado."""

    def test_a_rejected_bootcamper_can_be_verified_afterwards(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)
        client = make_client(salesperson_user)
        client.patch(REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json')

        resp = client.patch(VERIFY_URL.format(id=lead.id))

        assert resp.status_code == 200
        bootcamper.refresh_from_db()
        assert bootcamper.verification_status == CustomUser.VerificationStatus.VERIFIED

    def test_verifying_clears_the_previous_reason(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)
        client = make_client(salesperson_user)
        client.patch(REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json')

        client.patch(VERIFY_URL.format(id=lead.id))

        bootcamper.refresh_from_db()
        assert bootcamper.verification_rejection_reason == '', 'el motivo ya no aplica'

    def test_a_verified_bootcamper_cannot_be_rejected(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)
        client = make_client(salesperson_user)
        client.patch(VERIFY_URL.format(id=lead.id))

        resp = client.patch(REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json')

        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_VERIFICATION_TRANSITION'


class TestVerificationEmailsAreQueued:
    def test_rejecting_queues_the_email(self, db, salesperson_user, program, sin_correos):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)

        make_client(salesperson_user).patch(
            REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json',
        )

        sin_correos['rechazado'].assert_called_once_with(str(bootcamper.id))

    def test_verifying_queues_the_email(self, db, salesperson_user, program, sin_correos):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)

        make_client(salesperson_user).patch(VERIFY_URL.format(id=lead.id))

        sin_correos['aprobado'].assert_called_once_with(str(bootcamper.id))

    def test_a_failed_rejection_sends_nothing(self, db, salesperson_user, program, sin_correos):
        """Sin motivo no hay cambio de estado, así que tampoco correo."""
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)

        make_client(salesperson_user).patch(
            REJECT_URL.format(id=lead.id), {'reason': ''}, format='json',
        )

        sin_correos['rechazado'].assert_not_called()


class TestLeadDetailExposesTheReason:
    def test_rejection_reason_is_visible_to_the_salesperson(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        set_pending(bootcamper)
        client = make_client(salesperson_user)

        resp = client.patch(REJECT_URL.format(id=lead.id), {'reason': MOTIVO}, format='json')

        perfil = resp.json()['bootcamper_profile']
        assert perfil['verification_rejection_reason'] == MOTIVO
