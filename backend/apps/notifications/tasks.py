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
                'dashboard_url': f'{settings.FRONTEND_URL}/payments',
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
def send_late_payment_alert(self, bootcamper_id, program_id):
    """Send a late payment alert to program coordinators."""
    try:
        from apps.authentication.models import CustomUser
        from apps.programs.models import Program

        bootcamper = CustomUser.objects.get(id=bootcamper_id)
        program    = Program.objects.get(id=program_id)

        to_list, cc_list = coordinator_recipients(program)
        if not to_list and not cc_list:
            logger.warning(
                'No active coordinator emails for program %s, skipping late payment alert.',
                program.name,
            )
            return

        send_templated_email(
            template='late_payment_alert',
            context={
                'bootcamper_name': bootcamper.get_full_name(),
                'bootcamper_email': bootcamper.email,
                'program_name': program.name,
                'dashboard_url': f'{settings.FRONTEND_URL}/payments',
                'rows': [
                    ('Bootcamper', bootcamper.get_full_name()),
                    ('Email', bootcamper.email),
                    ('Programa', program.name),
                ],
            },
            subject=f'Alerta de pago: {bootcamper.get_full_name()} — {program.name}',
            to=to_list or [settings.DEFAULT_FROM_EMAIL],
            cc=cc_list,
        )
        logger.info('Late payment alert sent for bootcamper %s.', bootcamper_id)

    except Exception as exc:
        logger.exception('Error sending late payment alert for bootcamper %s.', bootcamper_id)
        raise self.retry(exc=exc)
