"""Shared helpers for rendering and sending templated transactional emails.

Every email in the app is built from a pair of templates in
``templates/emails/<name>.html`` and ``templates/emails/<name>.txt`` that
extend the shared ``emails/base.html`` / ``emails/base.txt`` layout. This
module centralizes the boilerplate so individual Celery tasks only need to
supply a template name, a context and the recipients.
"""
import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def send_templated_email(*, template, context, subject, to, cc=None):
    """Render `emails/<template>.html` + `.txt` and send as a multipart email.

    Args:
        template: base name of the template pair (no extension), e.g.
            "payment_rejected" for `emails/payment_rejected.html` / `.txt`.
        context: dict of variables for the templates. `frontend_url` is
            injected automatically.
        subject: email subject line.
        to: list of recipient addresses.
        cc: optional list of CC addresses.

    Returns:
        The sent `EmailMultiAlternatives` message.
    """
    ctx = {**context, 'frontend_url': settings.FRONTEND_URL}

    text_body = render_to_string(f'emails/{template}.txt', ctx)
    html_body = render_to_string(f'emails/{template}.html', ctx)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body.strip(),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=to,
        cc=cc or [],
    )
    msg.attach_alternative(html_body, 'text/html')
    msg.send()
    return msg


def coordinator_recipients(program):
    """Split a program's active coordinator emails into TO / CC lists.

    Args:
        program: a `Program` instance with a `coordinator_emails` related
            manager (each entry has `email`, `is_active`, `recipient_type`).

    Returns:
        A `(to_list, cc_list)` tuple of email address strings. Both are
        empty if the program has no active coordinator emails configured.
    """
    configs = program.coordinator_emails.filter(is_active=True)
    to_list = [c.email for c in configs if c.recipient_type == 'TO']
    cc_list = [c.email for c in configs if c.recipient_type == 'CC']
    return to_list, cc_list
