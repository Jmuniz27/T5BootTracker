"""Agregación de pagos compartida por las carteras de vendedores y de Finanzas.

Las dos vistas responden preguntas distintas —qué vendedor trajo a alguien, y
quién de Finanzas le cobra— pero suman el dinero igual. Vivía duplicado
literalmente en los dos servicios, y son cuentas que deciden si se dispara la
alerta del 10%: dos copias es justo cómo se desincronizan.
"""
from decimal import Decimal

from django.db.models import Case, DecimalField, Sum, When

from apps.payments.models import Payment
# Se importa el umbral en vez de repetirlo: es una regla de negocio crítica.
from apps.payments.services import CRITICAL_DEFICIT_THRESHOLD

ZERO = Decimal('0.00')


def payment_rows(bootcamper_ids):
    """Una fila por (bootcamper, programa) con lo esperado y lo cobrado.

    Un solo `values().annotate()` para todos los bootcampers a la vez: llamar al
    resumen por persona reintroduciría el N+1 que PERF-1 quitó del monitoreo.
    """
    if not bootcamper_ids:
        return []

    return list(
        Payment.objects
        .filter(bootcamper_id__in=bootcamper_ids)
        .values('bootcamper_id', 'program_id', 'program__total_cost')
        .annotate(
            paid=Sum(
                Case(
                    When(status=Payment.Status.APPROVED, then='confirmed_amount'),
                    default=Decimal('0.00'),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            ),
            pending=Sum(
                Case(
                    When(status=Payment.Status.PENDING, then=1),
                    default=0,
                    output_field=DecimalField(max_digits=12, decimal_places=0),
                ),
            ),
        )
    )


def summarise(rows):
    """Agrega filas (bootcamper, programa) en totales y cuenta los críticos.

    El umbral se evalúa por par, no sobre el total: un déficit crítico en un
    programa no se compensa con otro al día, y sumar primero lo escondería.
    """
    expected = ZERO
    paid = ZERO
    critical = 0

    for row in rows:
        row_expected = row['program__total_cost'] or ZERO
        row_paid = row['paid'] or ZERO
        expected += row_expected
        paid += row_paid

        deficit = max(row_expected - row_paid, ZERO)
        if deficit > row_expected * CRITICAL_DEFICIT_THRESHOLD:
            critical += 1

    return {
        'expected_amount': expected,
        'total_paid': paid,
        'deficit': max(expected - paid, ZERO),
        'critical_count': critical,
    }


def group_rows_by_bootcamper(bootcamper_ids):
    """{bootcamper_id: [filas]} — el agrupado que hacen las dos carteras."""
    grouped = {}
    for row in payment_rows(bootcamper_ids):
        grouped.setdefault(row['bootcamper_id'], []).append(row)
    return grouped
