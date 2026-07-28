"""Dev-only views to preview transactional email templates in the browser.

Wired up in `config/urls.py` under `if settings.DEBUG:` at `/dev/emails/`.
Lets us iterate on the HTML/CSS of an email without sending anything or
needing a working SMTP/Resend configuration — useful while there's no VPS
yet to configure the production email provider.
"""
from django.http import Http404, HttpResponse
from django.template.loader import render_to_string
from django.urls import reverse

PREVIEWS = {
    'password_reset': {
        'recipient_name': 'Ana Torres',
        'reset_link': 'http://localhost:5173/reset-password?token=preview-token',
        'expiry_minutes': 60,
    },
    'payment_approved': {
        'recipient_name': 'Carlos Pérez',
        'amount': 350.00,
        'program_name': 'Full Stack Web Development',
    },
    'payment_rejected': {
        'recipient_name': 'Carlos Pérez',
        'program_name': 'Full Stack Web Development',
        'rejection_reason': 'El comprobante no muestra el monto total pagado.',
        'upload_url': 'http://localhost:5173/payments',
    },
    'conversion_notification': {
        'lead_name': 'María Gómez',
        'bootcamper_name': 'María Gómez',
        'bootcamper_email': 'maria.gomez@example.com',
        'program_name': 'Data Science Bootcamp',
        'dashboard_url': 'http://localhost:5173/payments',
        'rows': [
            ('Bootcamper', 'María Gómez'),
            ('Email', 'maria.gomez@example.com'),
            ('Programa', 'Data Science Bootcamp'),
        ],
    },
    'late_payment_alert': {
        'bootcamper_name': 'Luis Andrade',
        'bootcamper_email': 'luis.andrade@example.com',
        'program_name': 'Data Science Bootcamp',
        'dashboard_url': 'http://localhost:5173/payments',
        'rows': [
            ('Bootcamper', 'Luis Andrade'),
            ('Email', 'luis.andrade@example.com'),
            ('Programa', 'Data Science Bootcamp'),
        ],
    },
}


def preview_index(request):
    """List every previewable email template with links to its HTML/txt render."""
    items = ''.join(
        f'<li><a href="{reverse("email-preview", args=[name])}">{name}</a> '
        f'(<a href="{reverse("email-preview", args=[name])}?format=txt">txt</a>)</li>'
        for name in PREVIEWS
    )
    return HttpResponse(f'<h1>Email previews</h1><ul>{items}</ul>')


def preview_email(request, name):
    """Render one email template (html by default, or ?format=txt) with fake data."""
    if name not in PREVIEWS:
        raise Http404(f'No preview registered for "{name}".')

    context = PREVIEWS[name]
    if request.GET.get('format') == 'txt':
        body = render_to_string(f'emails/{name}.txt', context)
        return HttpResponse(body, content_type='text/plain; charset=utf-8')

    body = render_to_string(f'emails/{name}.html', context)
    return HttpResponse(body)
