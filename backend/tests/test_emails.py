"""Tests for the templated transactional emails.

Unlike the rest of the suite (which mocks `.delay` to avoid sending real
emails), these tests call the Celery tasks synchronously and assert on
`django.core.mail.outbox` — pytest-django forces the locmem email backend
regardless of `EMAIL_BACKEND`, so no network call happens.
"""
from decimal import Decimal

import pytest
from django.conf import settings
from django.core import mail
from django.template.loader import render_to_string

from apps.notifications.preview import PREVIEWS
from apps.notifications.tasks import (
    send_conversion_notification,
    send_late_payment_alert,
    send_password_reset_email,
)
from apps.payments.models import Payment
from apps.payments.tasks import send_payment_status_notification


class TestPasswordResetEmail:
    def test_sends_html_and_text_alternative(self, db):
        send_password_reset_email(
            'user@test.com',
            'http://localhost:5173/reset-password?token=abc',
            user_name='Ana Torres',
        )

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == ['user@test.com']
        assert msg.from_email == settings.DEFAULT_FROM_EMAIL
        assert msg.subject == 'Recuperación de contraseña — Boot-Tracker'

        assert len(msg.alternatives) == 1
        html, mimetype = msg.alternatives[0]
        assert mimetype == 'text/html'
        assert 'BOOT-TRACKER' in html
        assert '#1D3176' in html
        assert 'reset-password?token=abc' in html

        # Text body has no HTML in it.
        assert '<' not in msg.body
        assert 'reset-password?token=abc' in msg.body

    def test_reflects_configured_ttl_in_minutes(self, db):
        send_password_reset_email('user@test.com', 'http://x/reset', user_name='Ana')
        msg = mail.outbox[0]
        expected_minutes = str(settings.PASSWORD_RESET_TOKEN_TTL // 60)
        assert expected_minutes in msg.body

    def test_user_name_is_optional(self, db):
        """Tasks already queued with the old 2-arg signature must not break."""
        send_password_reset_email('user@test.com', 'http://x/reset')
        assert len(mail.outbox) == 1


class TestPaymentStatusEmails:
    def test_approved_payment_email(self, db, converted_bootcamper, program):
        payment = Payment.objects.create(
            bootcamper=converted_bootcamper,
            program=program,
            receipt_file='receipts/test.jpg',
            receipt_file_type='image',
            status=Payment.Status.APPROVED,
            confirmed_amount=Decimal('350.00'),
        )

        send_payment_status_notification(str(payment.id), Payment.Status.APPROVED)

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == [converted_bootcamper.email]
        assert 'aprobado' in msg.subject.lower()
        html = msg.alternatives[0][0]
        assert '350.00' in html
        assert program.name in html

    def test_rejected_payment_email_meets_cb124_acceptance_criteria(
        self, db, converted_bootcamper, program
    ):
        """CB-124 / issue #146: the rejection email must tell the bootcamper
        the required action is to re-upload the receipt."""
        payment = Payment.objects.create(
            bootcamper=converted_bootcamper,
            program=program,
            receipt_file='receipts/test.jpg',
            receipt_file_type='image',
            status=Payment.Status.REJECTED,
            rejection_reason='El comprobante no muestra el monto total pagado.',
        )

        send_payment_status_notification(str(payment.id), Payment.Status.REJECTED)

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert 'rechazado' in msg.subject.lower()
        html = msg.alternatives[0][0]
        text = msg.body

        for body in (html, text):
            assert 'vuelve a subir' in body.lower()
            assert payment.rejection_reason in body
            assert settings.FRONTEND_URL in body


class TestCoordinatorEmails:
    def test_conversion_notification_uses_to_and_cc(
        self, db, coordinator_config, sample_lead, converted_bootcamper
    ):
        sample_lead.program = coordinator_config
        sample_lead.save()

        send_conversion_notification(sample_lead.id, converted_bootcamper.id)

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == ['coord.to@espol.edu.ec']
        assert msg.cc == ['coord.cc@espol.edu.ec']
        assert converted_bootcamper.get_full_name() in msg.alternatives[0][0]

    def test_late_payment_alert_uses_to_and_cc(
        self, db, coordinator_config, converted_bootcamper
    ):
        send_late_payment_alert(converted_bootcamper.id, coordinator_config.id)

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == ['coord.to@espol.edu.ec']
        assert msg.cc == ['coord.cc@espol.edu.ec']


@pytest.mark.parametrize('template_name', list(PREVIEWS.keys()))
def test_all_email_templates_render_without_error(template_name):
    """Smoke test: catches typos in {% block %} / {% include %} across all
    5 email templates using the same fake contexts the /dev/emails/ preview
    uses."""
    context = PREVIEWS[template_name]
    html = render_to_string(f'emails/{template_name}.html', context)
    text = render_to_string(f'emails/{template_name}.txt', context)
    assert 'BOOT-TRACKER' in html
    assert text.strip()
