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
from django.db.models import Q
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


def coordinator_users_for(program):
    """Active coordinator accounts that must be alerted about `program`.

    A coordinator reaches this list either by being general (they follow every
    program) or by having this program among the ones they are assigned to.
    Coordinators hold no permissions in the app — the account exists so a
    salesperson can reach them by email.

    Args:
        program: the `Program` the notification is about.

    Returns:
        A queryset of `CustomUser` with role COORDINATOR.
    """
    from apps.authentication.models import CustomUser

    return CustomUser.objects.filter(
        role=CustomUser.Role.COORDINATOR,
        is_active=True,
    ).filter(
        Q(coordinator_scope=CustomUser.CoordinatorScope.GENERAL)
        | Q(
            coordinator_scope=CustomUser.CoordinatorScope.PROGRAM,
            coordinator_programs=program,
        )
    # El join del M2M puede repetir filas por usuario si coordina varios
    # programas; sin distinct() la misma persona entraría dos veces en el TO.
    ).distinct()


def coordinator_recipients(program):
    """Build the TO / CC lists for a program's coordinator notifications.

    Two sources are merged: the per-program addresses configured in
    `CoordinatorEmailConfig` (which keep their TO/CC split) and the coordinator
    user accounts returned by `coordinator_users_for`, which always go in TO.

    Args:
        program: a `Program` instance with a `coordinator_emails` related
            manager (each entry has `email`, `is_active`, `recipient_type`).

    Returns:
        A `(to_list, cc_list)` tuple of deduplicated email address strings —
        an address present in TO is never repeated in CC. Both are empty if
        the program has neither configured addresses nor coordinator accounts.
    """
    configs = program.coordinator_emails.filter(is_active=True)
    to_list = [c.email for c in configs if c.recipient_type == 'TO']
    cc_list = [c.email for c in configs if c.recipient_type == 'CC']

    to_list += [user.email for user in coordinator_users_for(program)]

    to_list = _dedupe(to_list)
    cc_list = [email for email in _dedupe(cc_list) if email not in to_list]
    return to_list, cc_list


def _dedupe(emails):
    """Drop repeated addresses while keeping the original order."""
    seen = set()
    return [e for e in emails if not (e in seen or seen.add(e))]
