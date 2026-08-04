"""Tests for the bootcamper invitation email and its resend endpoint (#255)."""
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead

CONVERT_URL = '/api/leads/{id}/convert/'
RESEND_URL = '/api/leads/{id}/resend-invitation/'
ONBOARDING_URL = '/api/auth/onboarding/{token}/'


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


class TestConversionSendsInvitationEmail:
    def test_conversion_dispatches_the_task_with_correct_args(self, db, salesperson_user, program):
        lead = Lead.objects.create(
            name='Envío Test', phone='0991110000',
            status=Lead.Status.QUALIFIED, owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'), \
             patch('apps.notifications.tasks.send_bootcamper_invitation_email.delay') as mock_delay:
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula': '1713175071', 'program_id': str(program.id),
                'email': 'envio.test@test.com',
            }, format='json')
        assert resp.status_code == 201
        bootcamper_id = resp.json()['bootcamper_id']
        invitation_link = resp.json()['invitation_link']
        mock_delay.assert_called_once_with(bootcamper_id, invitation_link)

    def test_returning_bootcamper_does_not_dispatch_invitation(self, db, salesperson_user, program, converted_bootcamper):
        lead = Lead.objects.create(
            name='Otra vez', phone='0991110001',
            email=converted_bootcamper.email,
            status=Lead.Status.QUALIFIED, owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'), \
             patch('apps.notifications.tasks.send_bootcamper_invitation_email.delay') as mock_delay:
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula': '1713175071', 'program_id': str(program.id),
                'email': converted_bootcamper.email,
            }, format='json')
        assert resp.status_code == 201
        mock_delay.assert_not_called()

    def test_email_is_actually_sent_with_the_link(self, db, salesperson_user, program):
        """Corre la tarea de forma síncrona (patrón de test_emails.py) para
        comprobar que el email real llega con el link correcto."""
        from apps.notifications.tasks import send_bootcamper_invitation_email
        from apps.programs.models import Enrollment

        lead = Lead.objects.create(
            name='Correo Real', phone='0991110002',
            status=Lead.Status.QUALIFIED, owner=salesperson_user,
        )
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_conversion_notification.delay'), \
             patch('apps.notifications.tasks.send_bootcamper_invitation_email.delay'):
            resp = client.post(CONVERT_URL.format(id=lead.id), {
                'cedula': '1713175071', 'program_id': str(program.id),
                'email': 'correo.real@test.com',
            }, format='json')
        data = resp.json()

        send_bootcamper_invitation_email(data['bootcamper_id'], data['invitation_link'])

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == ['correo.real@test.com']
        assert data['invitation_link'] in msg.body
        enrollment = Enrollment.objects.get(bootcamper_id=data['bootcamper_id'])
        assert enrollment.bootcamp.name in msg.alternatives[0][0]


class TestResendInvitation:
    def test_owner_can_resend_and_gets_a_new_link(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        old_token = bootcamper.onboarding_token_issued_at

        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_bootcamper_invitation_email.delay') as mock_delay:
            resp = client.post(RESEND_URL.format(id=lead.id))
        assert resp.status_code == 200
        new_link = resp.json()['invitation_link']
        assert new_link
        mock_delay.assert_called_once()

        bootcamper.refresh_from_db()
        assert bootcamper.onboarding_token_issued_at != old_token

    def test_old_link_stops_working_after_resend(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)

        # Reconstruye el token del link original emitido por la conversión
        # (firmando con el iat que ya quedó guardado en el bootcamper).
        from apps.authentication.services import ONBOARDING_TOKEN_SALT
        from django.core import signing
        old_token = signing.dumps(
            {'uid': str(bootcamper.id), 'iat': bootcamper.onboarding_token_issued_at.isoformat()},
            salt=ONBOARDING_TOKEN_SALT,
        )

        client = make_client(salesperson_user)
        cache.clear()
        with patch('apps.notifications.tasks.send_bootcamper_invitation_email.delay'):
            resend_resp = client.post(RESEND_URL.format(id=lead.id))
        assert resend_resp.status_code == 200

        cache.clear()
        anon = APIClient()
        old_get = anon.get(ONBOARDING_URL.format(token=old_token))
        assert old_get.status_code == 400
        assert old_get.json()['code'] == 'TOKEN_SUPERSEDED'

        new_token = resend_resp.json()['invitation_link'].rsplit('/', 1)[-1]
        cache.clear()
        new_get = anon.get(ONBOARDING_URL.format(token=new_token))
        assert new_get.status_code == 200

    def test_resend_by_another_salesperson_is_forbidden(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        other = CustomUser.objects.create_user(
            email='otro.vendedor@test.com', password='testpass123',
            first_name='Otro', last_name='Vendedor', role=CustomUser.Role.SALESPERSON,
        )
        client = make_client(other)
        resp = client.post(RESEND_URL.format(id=lead.id))
        assert resp.status_code == 403
        assert resp.json()['code'] == 'NOT_OWNER'

    def test_resend_on_activated_account_is_rejected(self, db, salesperson_user, program):
        lead, bootcamper = convert_lead(salesperson_user, program)
        bootcamper.verification_status = CustomUser.VerificationStatus.PENDING_VERIFICATION
        bootcamper.save(update_fields=['verification_status'])

        client = make_client(salesperson_user)
        resp = client.post(RESEND_URL.format(id=lead.id))
        assert resp.status_code == 400
        assert resp.json()['code'] == 'ALREADY_ACTIVATED'

    def test_resend_on_unconverted_lead_is_rejected(self, db, salesperson_user, program, sample_lead):
        sample_lead.owner = salesperson_user
        sample_lead.save(update_fields=['owner'])

        client = make_client(salesperson_user)
        resp = client.post(RESEND_URL.format(id=sample_lead.id))
        assert resp.status_code == 400
        assert resp.json()['code'] == 'NOT_CONVERTED'

    def test_throttling_blocks_after_several_resends(self, db, salesperson_user, program):
        # SimpleRateThrottle.THROTTLE_RATES se fija como atributo de clase al
        # importar rest_framework.throttling, a partir de
        # api_settings.DEFAULT_THROTTLE_RATES en ese momento — mutar la
        # settings o el api_settings después no lo actualiza. Hay que
        # parchear el atributo de clase directamente.
        from rest_framework.throttling import SimpleRateThrottle

        lead, bootcamper = convert_lead(salesperson_user, program)
        client = make_client(salesperson_user)
        cache.clear()

        original_rates = SimpleRateThrottle.THROTTLE_RATES
        with patch.object(SimpleRateThrottle, 'THROTTLE_RATES', {**original_rates, 'invitation': '2/hour'}):
            with patch('apps.notifications.tasks.send_bootcamper_invitation_email.delay'):
                first = client.post(RESEND_URL.format(id=lead.id))
                second = client.post(RESEND_URL.format(id=lead.id))
                third = client.post(RESEND_URL.format(id=lead.id))

        assert first.status_code == 200
        assert second.status_code == 200
        assert third.status_code == 429

# El render del preview de bootcamper_invitation ya está cubierto por
# test_emails.py::test_all_email_templates_render_without_error, que
# itera sobre PREVIEWS.keys() automáticamente.
