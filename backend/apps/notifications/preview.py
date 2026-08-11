"""Dev-only views to preview transactional email templates in the browser.

Wired up in `config/urls.py` under `if settings.DEBUG:` at `/dev/emails/`.
Lets us iterate on the HTML/CSS of an email without sending anything or
needing a working SMTP/Resend configuration — useful while there's no VPS
yet to configure the production email provider.
"""
from django.http import Http404, HttpResponse
from django.template.loader import render_to_string
from django.urls import reverse

# Datos comunes de las alertas de pago al coordinador. Se comparten entre las
# tres variantes para que sólo cambie lo que de verdad distingue a cada una.
_ALERT_BASE = {
    'bootcamper_name': 'Luis Andrade',
    'bootcamper_email': 'luis.andrade@example.com',
    'bootcamper_phone': '0991234567',
    'program_name': 'Data Science Bootcamp',
    'deficit': '$1,050.00',
    'rows': [
        ('Bootcamper', 'Luis Andrade'),
        ('Email', 'luis.andrade@example.com'),
        ('Teléfono', '0991234567'),
        ('Programa', 'Data Science Bootcamp'),
    ],
    'payment_rows': [
        ('Costo acordado', '$2,400.00'),
        ('Total pagado', '$1,350.00'),
        ('Adeudado', '$1,050.00'),
        ('Esperado a la fecha', '$1,790.40'),
        ('Avance del programa', '74.6%'),
        ('Pagado del total', '56.3%'),
    ],
}

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
    'bootcamper_invitation': {
        'recipient_name': 'Ana Torres',
        'invitation_link': 'http://localhost:5173/onboarding/preview-token',
        'expiry_hours': 72,
        'program_name': 'Data Science Bootcamp',
    },
    'staff_invitation': {
        'recipient_name': 'Carlos Vera',
        'invitation_link': 'http://localhost:5173/onboarding/preview-token',
        'expiry_hours': 72,
        'role_display': 'Finanzas',
    },
    'verification_approved': {
        'recipient_name': 'Ana Torres',
        'program_name': 'Data Science Bootcamp',
    },
    'verification_rejected': {
        'recipient_name': 'Ana Torres',
        'program_name': 'Data Science Bootcamp',
        'rejection_reason': 'La cédula registrada no coincide con la del documento que enviaste.',
    },
    'conversion_notification': {
        'lead_name': 'María Gómez',
        'bootcamper_name': 'María Gómez',
        'bootcamper_email': 'maria.gomez@example.com',
        'program_name': 'Data Science Bootcamp',
        'rows': [
            ('Bootcamper', 'María Gómez'),
            ('Email', 'maria.gomez@example.com'),
            ('Programa', 'Data Science Bootcamp'),
        ],
    },
    'late_payment_alert': {
        **_ALERT_BASE,
        'alert_text': 'El bootcamper tiene pagos pendientes críticos.',
        'action_text': 'Contacta al bootcamper para regularizar su situación de pagos.',
    },
    # Las dos variantes según desde dónde se pidió el aviso. `_template` deja
    # renderizar el mismo archivo con contextos distintos.
    'late_payment_alert_critical': {
        **_ALERT_BASE,
        '_template': 'late_payment_alert',
        'alert_text': 'El déficit de este bootcamper supera el 10% del costo del programa.',
        'action_text': (
            'Contacta al bootcamper con los datos de arriba para acordar un plan '
            'de pago, y avísale a Finanzas cuando tengas una respuesta.'
        ),
    },
    'late_payment_alert_receipt': {
        **_ALERT_BASE,
        '_template': 'late_payment_alert',
        'alert_text': (
            'Finanzas está revisando un comprobante de este bootcamper, que '
            'además tiene pagos atrasados.'
        ),
        'action_text': (
            'Si el monto del comprobante no coincide con lo que esperabas, '
            'contacta al bootcamper antes de que Finanzas cierre la revisión.'
        ),
        'receipt_rows': [
            ('Monto del comprobante', '$420.00'),
            ('Fecha del pago', '28/04/2026'),
            ('Estado', 'Pendiente'),
            ('Banco', 'Banco Pichincha'),
            ('Nro. transacción', '884213770'),
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

    context = dict(PREVIEWS[name])
    # Varias previews pueden apuntar al mismo archivo con contextos distintos.
    template = context.pop('_template', name)

    if request.GET.get('format') == 'txt':
        body = render_to_string(f'emails/{template}.txt', context)
        return HttpResponse(body, content_type='text/plain; charset=utf-8')

    body = render_to_string(f'emails/{template}.html', context)
    return HttpResponse(body)
