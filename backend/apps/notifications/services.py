"""Armado del contenido de los correos a coordinadores.

El coordinador no tiene cuenta funcional en la aplicación: existe para que
Finanzas pueda alcanzarlo por correo (ver `coordinator_users_for`). Por eso
estos correos no llevan a ninguna pantalla y tienen que bastarse solos.
"""
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)

# Desde qué pantalla se pidió avisar al coordinador. Los dos botones existentes
# mandaban el mismo correo, así que quien lo recibía no podía saber si le
# estaban reportando un atraso de pagos o la revisión de un comprobante puntual.
ALERT_SOURCE_CRITICAL_DEFICIT = 'critical_deficit'
ALERT_SOURCE_RECEIPT_REVIEW = 'receipt_review'
ALERT_SOURCES = (ALERT_SOURCE_CRITICAL_DEFICIT, ALERT_SOURCE_RECEIPT_REVIEW)


def format_money(value):
    """Formatea un monto para el correo: `$1,234.56`."""
    return f'${Decimal(value or 0):,.2f}'


def _payment_rows(summary):
    """Filas con la situación de pagos del bootcamper."""
    return [
        ('Costo acordado', format_money(summary['total_cost'])),
        ('Total pagado', format_money(summary['total_paid'])),
        ('Adeudado', format_money(summary['deficit'])),
        ('Esperado a la fecha', format_money(summary['expected_payment_by_now'])),
        ('Avance del programa', f"{summary['time_elapsed_percentage']:.1f}%"),
        ('Pagado del total', f"{summary['payment_percentage']:.1f}%"),
    ]


def _receipt_rows(payment):
    """Filas del comprobante concreto que Finanzas está revisando."""
    amount = payment.confirmed_amount or payment.ocr_amount
    payment_date = payment.ocr_payment_date or payment.submitted_at.date()
    bank = payment.confirmed_bank_name or payment.ocr_bank_name
    transaction = payment.confirmed_transaction_id or payment.ocr_transaction_id

    rows = [
        ('Monto del comprobante', format_money(amount) if amount else 'Sin leer'),
        ('Fecha del pago', payment_date.strftime('%d/%m/%Y')),
        ('Estado', payment.get_status_display()),
    ]
    if bank:
        rows.append(('Banco', bank))
    if transaction:
        rows.append(('Nro. transacción', transaction))
    return rows


def build_late_payment_alert(bootcamper, program, summary, source=None, payment=None):
    """Asunto y contexto del correo de alerta de pago, según de dónde se pidió.

    `source` distingue las dos pantallas que disparan la alerta: el banner de
    déficit crítico y la revisión de un comprobante. Sin él se conserva el
    correo anterior, para las tareas que ya estaban encoladas y para cualquier
    cliente que todavía no mande el parámetro.

    Returns:
        tuple[str, dict]: asunto y contexto para `send_templated_email`.
    """
    name = bootcamper.get_full_name()
    deficit = format_money(summary['deficit'])

    rows = [
        ('Bootcamper', name),
        ('Email', bootcamper.email),
    ]
    if bootcamper.phone:
        rows.append(('Teléfono', bootcamper.phone))
    rows.append(('Programa', program.name))

    context = {
        'bootcamper_name': name,
        'bootcamper_email': bootcamper.email,
        'bootcamper_phone': bootcamper.phone,
        'program_name': program.name,
        'deficit': deficit,
        'rows': rows,
        'payment_rows': _payment_rows(summary),
        'receipt_rows': _receipt_rows(payment) if payment else None,
    }

    if source == ALERT_SOURCE_CRITICAL_DEFICIT:
        subject = f'Pago atrasado: {name} — {program.name} (adeuda {deficit})'
        context['alert_text'] = (
            'El déficit de este bootcamper supera el 10% del costo del programa.'
        )
        context['action_text'] = (
            'Contacta al bootcamper con los datos de arriba para acordar un plan '
            'de pago, y avísale a Finanzas cuando tengas una respuesta.'
        )
    elif source == ALERT_SOURCE_RECEIPT_REVIEW:
        subject = f'Revisión de comprobante: {name} — {program.name}'
        context['alert_text'] = (
            'Finanzas está revisando un comprobante de este bootcamper, que '
            'además tiene pagos atrasados.'
        )
        context['action_text'] = (
            'Si el monto del comprobante no coincide con lo que esperabas, '
            'contacta al bootcamper antes de que Finanzas cierre la revisión.'
        )
    else:
        subject = f'Alerta de pago: {name} — {program.name}'
        context['alert_text'] = 'El bootcamper tiene pagos pendientes críticos.'
        context['action_text'] = (
            'Contacta al bootcamper para regularizar su situación de pagos.'
        )

    return subject, context
