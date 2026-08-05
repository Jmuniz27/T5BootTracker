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
    send_verification_approved_email,
    send_verification_rejected_email,
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


class TestVerificationEmails:
    """Correos de la revisión de datos del onboarding (#309)."""

    MOTIVO = 'La cédula registrada no coincide con la del documento que enviaste.'

    def test_approved_email_names_the_program(self, db, converted_bootcamper, active_enrollment, program):
        send_verification_approved_email(str(converted_bootcamper.id))

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == [converted_bootcamper.email]
        assert 'verificados' in msg.subject.lower()
        for body in (msg.alternatives[0][0], msg.body):
            assert program.name in body

    def test_rejected_email_carries_the_reason(self, db, converted_bootcamper, active_enrollment):
        converted_bootcamper.verification_rejection_reason = self.MOTIVO
        converted_bootcamper.save(update_fields=['verification_rejection_reason'])

        send_verification_rejected_email(str(converted_bootcamper.id))

        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        assert msg.to == [converted_bootcamper.email]
        for body in (msg.alternatives[0][0], msg.body):
            assert self.MOTIVO in body, 'sin el motivo el correo no sirve de nada'
            assert 'asesor' in body.lower(), 'la corrección es asistida: hay que decir a quién escribir'

    def test_rejected_email_does_not_send_them_to_the_app(self, db, converted_bootcamper, active_enrollment):
        """Hoy el bootcamper no puede autocorregir sus datos: no hay a dónde mandarlo."""
        converted_bootcamper.verification_rejection_reason = self.MOTIVO
        converted_bootcamper.save(update_fields=['verification_rejection_reason'])

        send_verification_rejected_email(str(converted_bootcamper.id))

        msg = mail.outbox[0]
        for body in (msg.alternatives[0][0], msg.body):
            assert settings.FRONTEND_URL not in body

    def test_both_emails_work_without_an_enrollment(self, db, converted_bootcamper):
        """Hay bootcampers sin inscripción (datos viejos): el correo no debe reventar."""
        send_verification_approved_email(str(converted_bootcamper.id))
        send_verification_rejected_email(str(converted_bootcamper.id))

        assert len(mail.outbox) == 2


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


@pytest.fixture
def make_coordinator(db):
    """Factory de cuentas con rol COORDINATOR y un alcance dado."""
    from apps.authentication.models import CustomUser

    def _make(email, scope, *programs, is_active=True):
        user = CustomUser.objects.create_user(
            email=email,
            password='testpass123',
            first_name='Coord',
            last_name='Test',
            role=CustomUser.Role.COORDINATOR,
            coordinator_scope=scope,
            is_active=is_active,
        )
        # M2M: se asigna después de crear, cuando ya hay pk.
        if programs:
            user.coordinator_programs.set([p for p in programs if p is not None])
        return user

    return _make


class TestCoordinatorAccountRecipients:
    """Las cuentas con rol COORDINATOR reciben los avisos además de los
    correos sueltos configurados por programa (CoordinatorEmailConfig)."""

    def test_general_coordinator_is_alerted_for_any_program(
        self, db, program, converted_bootcamper, make_coordinator
    ):
        from apps.authentication.models import CustomUser

        make_coordinator('general@espol.edu.ec', CustomUser.CoordinatorScope.GENERAL)

        send_late_payment_alert(converted_bootcamper.id, program.id)

        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ['general@espol.edu.ec']

    def test_program_coordinator_only_receives_their_own_program(
        self, db, program, converted_bootcamper, make_coordinator
    ):
        from apps.authentication.models import CustomUser
        from apps.programs.models import Program

        other = Program.objects.create(
            name='Data Science Junio 2026',
            start_date=program.start_date,
            end_date=program.end_date,
            total_cost=program.total_cost,
        )
        make_coordinator('mine@espol.edu.ec', CustomUser.CoordinatorScope.PROGRAM, program)
        make_coordinator('other@espol.edu.ec', CustomUser.CoordinatorScope.PROGRAM, other)


        send_late_payment_alert(converted_bootcamper.id, program.id)

        assert mail.outbox[0].to == ['mine@espol.edu.ec']

    def test_coordinator_of_several_programs_is_alerted_once_per_program(
        self, db, program, converted_bootcamper, make_coordinator
    ):
        """Coordinar varios programas no debe duplicar a la persona en el TO.

        El join del M2M repite una fila por programa coincidente; sin distinct()
        el mismo correo entraría dos veces.
        """
        from apps.authentication.models import CustomUser
        from apps.programs.models import Program

        other = Program.objects.create(
            name='Otro programa coordinado',
            start_date=program.start_date,
            end_date=program.end_date,
            total_cost=program.total_cost,
        )
        make_coordinator(
            'ambos@espol.edu.ec',
            CustomUser.CoordinatorScope.PROGRAM,
            program,
            other,
        )

        send_late_payment_alert(converted_bootcamper.id, program.id)

        assert mail.outbox[0].to == ['ambos@espol.edu.ec']

    def test_inactive_coordinator_is_skipped(
        self, db, coordinator_config, converted_bootcamper, make_coordinator
    ):
        from apps.authentication.models import CustomUser

        make_coordinator(
            'baja@espol.edu.ec',
            CustomUser.CoordinatorScope.GENERAL,
            is_active=False,
        )

        send_late_payment_alert(converted_bootcamper.id, coordinator_config.id)

        assert 'baja@espol.edu.ec' not in mail.outbox[0].to

    def test_accounts_are_merged_with_configured_addresses_without_duplicates(
        self, db, coordinator_config, converted_bootcamper, make_coordinator
    ):
        """Una cuenta cuyo email ya estaba configurado como TO no se repite, y
        si estaba como CC se promueve a TO en lugar de aparecer dos veces."""
        from apps.authentication.models import CustomUser

        make_coordinator('coord.to@espol.edu.ec', CustomUser.CoordinatorScope.GENERAL)
        make_coordinator(
            'coord.cc@espol.edu.ec',
            CustomUser.CoordinatorScope.PROGRAM,
            coordinator_config,
        )

        send_late_payment_alert(converted_bootcamper.id, coordinator_config.id)

        msg = mail.outbox[0]
        assert msg.to == ['coord.to@espol.edu.ec', 'coord.cc@espol.edu.ec']
        assert msg.cc == []

    def test_conversion_notification_also_reaches_coordinator_accounts(
        self, db, program, sample_lead, converted_bootcamper, make_coordinator
    ):
        from apps.authentication.models import CustomUser

        make_coordinator('general@espol.edu.ec', CustomUser.CoordinatorScope.GENERAL)
        sample_lead.program = program
        sample_lead.save()

        send_conversion_notification(sample_lead.id, converted_bootcamper.id)

        assert mail.outbox[0].to == ['general@espol.edu.ec']

    def test_coordinator_without_scope_is_never_alerted(
        self, db, program, converted_bootcamper, make_coordinator
    ):
        """Sin alcance no hay a quién notificar — no debe colarse en ningún envío."""
        make_coordinator('sin-alcance@espol.edu.ec', '')

        send_late_payment_alert(converted_bootcamper.id, program.id)

        assert mail.outbox == []


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
