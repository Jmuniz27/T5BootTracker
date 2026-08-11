"""Celery tasks for notifications app."""
import logging
from celery import shared_task
from django.conf import settings

from .emails import coordinator_recipients, send_templated_email

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email(self, email, reset_link, user_name=None):
    """Send password reset link to the user asynchronously.

    `user_name` is optional (added after this task's original rollout) so
    that any password-reset task already queued with the old two-argument
    signature keeps working during a deploy.
    """
    try:
        send_templated_email(
            template='password_reset',
            context={
                'recipient_name': user_name,
                'reset_link': reset_link,
                'expiry_minutes': settings.PASSWORD_RESET_TOKEN_TTL // 60,
            },
            subject='Recuperación de contraseña — Boot-Tracker',
            to=[email],
        )
        logger.info('Password reset email sent to %s.', email)
    except Exception as exc:
        logger.exception('Error sending password reset email to %s.', email)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_bootcamper_invitation_email(self, bootcamper_id, invitation_link):
    """Send the one-time onboarding invitation link to a newly converted bootcamper."""
    try:
        from apps.authentication.models import CustomUser
        from apps.authentication.services import ONBOARDING_TOKEN_MAX_AGE
        from apps.programs.models import Enrollment

        bootcamper = CustomUser.objects.get(id=bootcamper_id)
        enrollment = Enrollment.objects.filter(bootcamper=bootcamper).select_related('bootcamp').order_by('-id').first()

        send_templated_email(
            template='bootcamper_invitation',
            context={
                'recipient_name': bootcamper.get_full_name(),
                'invitation_link': invitation_link,
                'expiry_hours': ONBOARDING_TOKEN_MAX_AGE // 3600,
                'program_name': enrollment.bootcamp.name if enrollment else None,
            },
            subject='Activa tu cuenta de bootcamper — Boot-Tracker',
            to=[bootcamper.email],
        )
        logger.info('Bootcamper invitation email sent to %s.', bootcamper.email)
    except Exception as exc:
        logger.exception('Error sending bootcamper invitation email for %s.', bootcamper_id)
        raise self.retry(exc=exc)


def _bootcamper_program_name(bootcamper):
    """Name of the program this bootcamper is enrolled in, or None."""
    from apps.programs.models import Enrollment

    enrollment = (
        Enrollment.objects
        .filter(bootcamper=bootcamper)
        .select_related('bootcamp')
        .order_by('-id')
        .first()
    )
    return enrollment.bootcamp.name if enrollment else None


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_verification_approved_email(self, bootcamper_id):
    """Tell the bootcamper their onboarding data was verified (#309)."""
    try:
        from apps.authentication.models import CustomUser

        bootcamper = CustomUser.objects.get(id=bootcamper_id)

        send_templated_email(
            template='verification_approved',
            context={
                'recipient_name': bootcamper.get_full_name(),
                'program_name': _bootcamper_program_name(bootcamper),
            },
            subject='Tus datos fueron verificados — Boot-Tracker',
            to=[bootcamper.email],
        )
        logger.info('Verification approved email sent to %s.', bootcamper.email)
    except Exception as exc:
        logger.exception('Error sending verification approved email for %s.', bootcamper_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_verification_rejected_email(self, bootcamper_id):
    """Tell the bootcamper what to fix in their onboarding data (#309).

    El correo no enlaza a ninguna pantalla a propósito: hoy el bootcamper no
    puede autocorregir sus datos (el onboarding es un token de un solo uso ya
    consumido, y `/auth/me/` no expone la cédula). La corrección es asistida, así
    que el correo pide contactar al asesor.
    """
    try:
        from apps.authentication.models import CustomUser

        bootcamper = CustomUser.objects.get(id=bootcamper_id)

        send_templated_email(
            template='verification_rejected',
            context={
                'recipient_name': bootcamper.get_full_name(),
                'program_name': _bootcamper_program_name(bootcamper),
                'rejection_reason': bootcamper.verification_rejection_reason,
            },
            subject='Hay que corregir tus datos — Boot-Tracker',
            to=[bootcamper.email],
        )
        logger.info('Verification rejected email sent to %s.', bootcamper.email)
    except Exception as exc:
        logger.exception('Error sending verification rejected email for %s.', bootcamper_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_staff_invitation_email(self, user_id, invitation_link):
    """Send the one-time onboarding invitation link to a newly created staff user.

    Espejo de `send_bootcamper_invitation_email` (issue #295): mismo mecanismo
    de link firmado de 72h, pero para roles de staff (vendedor, finanzas,
    administrador) creados desde el panel de usuarios en vez de convertidos
    desde un lead.
    """
    try:
        from apps.authentication.models import CustomUser
        from apps.authentication.services import ONBOARDING_TOKEN_MAX_AGE

        user = CustomUser.objects.get(id=user_id)

        send_templated_email(
            template='staff_invitation',
            context={
                'recipient_name': user.get_full_name(),
                'invitation_link': invitation_link,
                'expiry_hours': ONBOARDING_TOKEN_MAX_AGE // 3600,
                'role_display': user.get_role_display(),
            },
            subject='Activa tu cuenta — Boot-Tracker',
            to=[user.email],
        )
        logger.info('Staff invitation email sent to %s.', user.email)
    except Exception as exc:
        logger.exception('Error sending staff invitation email for %s.', user_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_conversion_notification(self, lead_id, bootcamper_id):
    """Notify program coordinators when a lead is converted to a bootcamper."""
    try:
        from apps.leads.models import Lead
        from apps.authentication.models import CustomUser

        lead      = Lead.objects.select_related('program').get(id=lead_id)
        bootcamper = CustomUser.objects.get(id=bootcamper_id)

        if not lead.program:
            logger.warning('Lead %s has no program, skipping conversion notification.', lead_id)
            return

        to_list, cc_list = coordinator_recipients(lead.program)
        if not to_list and not cc_list:
            logger.warning(
                'No active coordinator emails for program %s, skipping notification.',
                lead.program.name,
            )
            return

        send_templated_email(
            template='conversion_notification',
            context={
                'lead_name': lead.name,
                'bootcamper_name': bootcamper.get_full_name(),
                'bootcamper_email': bootcamper.email,
                'program_name': lead.program.name,
                'rows': [
                    ('Bootcamper', bootcamper.get_full_name()),
                    ('Email', bootcamper.email),
                    ('Programa', lead.program.name),
                ],
            },
            subject=f'Nuevo bootcamper: {bootcamper.get_full_name()} — {lead.program.name}',
            to=to_list or [settings.DEFAULT_FROM_EMAIL],
            cc=cc_list,
        )
        logger.info('Conversion notification sent for lead %s.', lead_id)

    except Exception as exc:
        logger.exception('Error sending conversion notification for lead %s.', lead_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_late_payment_alert(self, bootcamper_id, program_id, source=None, payment_id=None):
    """Send a late payment alert to program coordinators.

    `source` y `payment_id` son opcionales a propósito: la tarea puede estar ya
    encolada con la firma vieja cuando se despliega esta versión, y en ese caso
    tiene que seguir corriendo.
    """
    try:
        from apps.authentication.models import CustomUser
        from apps.payments.models import Payment
        from apps.payments.services import PaymentProgressService
        from apps.programs.models import Program

        from .services import build_late_payment_alert

        bootcamper = CustomUser.objects.get(id=bootcamper_id)
        program    = Program.objects.get(id=program_id)

        to_list, cc_list = coordinator_recipients(program)
        if not to_list and not cc_list:
            logger.warning(
                'No active coordinator emails for program %s, skipping late payment alert.',
                program.name,
            )
            return

        # `.first()` y no `.get()`: que el pago se haya borrado entre el click y
        # el worker no debe impedir que el coordinador reciba el aviso.
        payment = Payment.objects.filter(id=payment_id).first() if payment_id else None
        summary = PaymentProgressService().get_payment_summary(
            str(bootcamper_id), str(program_id)
        )

        subject, context = build_late_payment_alert(
            bootcamper, program, summary, source=source, payment=payment
        )

        send_templated_email(
            template='late_payment_alert',
            context=context,
            subject=subject,
            to=to_list or [settings.DEFAULT_FROM_EMAIL],
            cc=cc_list,
        )
        logger.info(
            'Late payment alert sent for bootcamper %s (source=%s).', bootcamper_id, source
        )

    except Exception as exc:
        logger.exception('Error sending late payment alert for bootcamper %s.', bootcamper_id)
        raise self.retry(exc=exc)
