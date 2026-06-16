"""Celery tasks for notifications app."""
import logging
from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email(self, email, reset_link):
    """Send password reset link to the user asynchronously."""
    try:
        subject = 'Recuperación de contraseña — Boot-Tracker'
        text_body = (
            f'Haz clic en el siguiente enlace para restablecer tu contraseña:\n\n'
            f'{reset_link}\n\n'
            f'El enlace expira en 24 horas. Si no solicitaste este cambio, ignora este mensaje.'
        )
        html_body = f"""
        <p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
        <p><a href="{reset_link}">{reset_link}</a></p>
        <p>El enlace expira en <strong>24 horas</strong>.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
        """
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        msg.attach_alternative(html_body, 'text/html')
        msg.send()
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

        configs = lead.program.coordinator_emails.filter(is_active=True)
        if not configs.exists():
            logger.warning(
                'No active coordinator emails for program %s, skipping notification.',
                lead.program.name,
            )
            return

        to_list = [c.email for c in configs if c.recipient_type == 'TO']
        cc_list = [c.email for c in configs if c.recipient_type == 'CC']

        subject  = f'Nuevo bootcamper: {bootcamper.get_full_name()} — {lead.program.name}'
        text_body = (
            f'El lead {lead.name} ha sido convertido al bootcamper '
            f'{bootcamper.get_full_name()} ({bootcamper.email}) '
            f'para el programa {lead.program.name}.'
        )
        html_body = f"""
        <p>El lead <strong>{lead.name}</strong> ha sido convertido exitosamente.</p>
        <ul>
            <li><strong>Bootcamper:</strong> {bootcamper.get_full_name()}</li>
            <li><strong>Email:</strong> {bootcamper.email}</li>
            <li><strong>Programa:</strong> {lead.program.name}</li>
        </ul>
        """

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=to_list or [settings.DEFAULT_FROM_EMAIL],
            cc=cc_list,
        )
        msg.attach_alternative(html_body, 'text/html')
        msg.send()
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

        configs = program.coordinator_emails.filter(is_active=True)
        if not configs.exists():
            logger.warning(
                'No active coordinator emails for program %s, skipping late payment alert.',
                program.name,
            )
            return

        to_list = [c.email for c in configs if c.recipient_type == 'TO']
        cc_list = [c.email for c in configs if c.recipient_type == 'CC']

        subject   = f'Alerta de pago: {bootcamper.get_full_name()} — {program.name}'
        text_body = (
            f'El bootcamper {bootcamper.get_full_name()} ({bootcamper.email}) '
            f'tiene pagos pendientes críticos en el programa {program.name}.'
        )
        html_body = f"""
        <p><strong>Alerta de pago crítico</strong></p>
        <ul>
            <li><strong>Bootcamper:</strong> {bootcamper.get_full_name()}</li>
            <li><strong>Email:</strong> {bootcamper.email}</li>
            <li><strong>Programa:</strong> {program.name}</li>
        </ul>
        <p>Por favor, contacte al bootcamper para regularizar su situación de pagos.</p>
        """

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=to_list or [settings.DEFAULT_FROM_EMAIL],
            cc=cc_list,
        )
        msg.attach_alternative(html_body, 'text/html')
        msg.send()
        logger.info('Late payment alert sent for bootcamper %s.', bootcamper_id)

    except Exception as exc:
        logger.exception('Error sending late payment alert for bootcamper %s.', bootcamper_id)
        raise self.retry(exc=exc)
