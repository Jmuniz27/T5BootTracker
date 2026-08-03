"""Lectura de la cartera de bootcampers de cada vendedor (solo Administrador).

Vive aparte de `users/services.py` porque no muta nada: son consultas de sólo
lectura para el panel del administrador.

El vínculo vendedor → bootcamper es `Lead.owner` → `Lead.bootcamper`: el lead es
el registro de la relación comercial, y su conversión deja apuntado al usuario
que se creó.
"""
from decimal import Decimal

from django.db.models import Case, DecimalField, Sum, When

from apps.authentication.models import CustomUser
from apps.leads.models import Lead
from apps.payments.models import Payment
# Se importa el umbral en vez de repetir el 0.10: es una regla de negocio
# crítica y tener dos copias es justo cómo se desincronizan.
from apps.payments.services import CRITICAL_DEFICIT_THRESHOLD

ZERO = Decimal('0.00')


def _bootcamper_ids_by_salesperson():
    """{salesperson_id: {bootcamper_id, …}} en una sola consulta.

    Sólo cuenta leads convertidos que dejaron bootcamper y que siguen teniendo
    dueño: un lead liberado no le pertenece a nadie.
    """
    pairs = (
        Lead.objects
        .filter(owner__isnull=False, bootcamper__isnull=False)
        .values_list('owner_id', 'bootcamper_id')
    )

    grouped = {}
    for owner_id, bootcamper_id in pairs:
        grouped.setdefault(owner_id, set()).add(bootcamper_id)
    return grouped


def _payment_rows(bootcamper_ids):
    """Una fila por (bootcamper, programa) con lo esperado y lo cobrado.

    Un solo `values().annotate()` para todos los bootcampers a la vez: llamar al
    resumen por persona reintroduciría el N+1 que PERF-1 acaba de quitar del
    monitoreo.
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


def _summarise(rows):
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


def list_salespeople_portfolios():
    """Una fila por vendedor activo, con o sin bootcampers.

    Los que no tienen ninguno aparecen en ceros: omitirlos daría la impresión de
    que no existen. Los administradores nunca entran — no tienen cartera propia.
    """
    salespeople = CustomUser.objects.filter(
        role=CustomUser.Role.SALESPERSON, is_active=True,
    ).order_by('first_name', 'last_name')

    by_salesperson = _bootcamper_ids_by_salesperson()
    every_bootcamper = {bc for ids in by_salesperson.values() for bc in ids}
    rows_by_bootcamper = {}
    for row in _payment_rows(every_bootcamper):
        rows_by_bootcamper.setdefault(row['bootcamper_id'], []).append(row)

    portfolios = []
    for person in salespeople:
        bootcamper_ids = by_salesperson.get(person.id, set())
        rows = [r for bc in bootcamper_ids for r in rows_by_bootcamper.get(bc, [])]
        portfolios.append({
            'salesperson_id': str(person.id),
            'salesperson': person.get_full_name(),
            'email': person.email,
            'bootcamper_count': len(bootcamper_ids),
            **_summarise(rows),
        })

    return portfolios


def get_salesperson_bootcampers(salesperson):
    """Los bootcampers de un vendedor, con su resumen de pagos por programa."""
    leads = (
        Lead.objects
        .filter(owner=salesperson, bootcamper__isnull=False)
        .select_related('bootcamper')
    )
    bootcampers = {lead.bootcamper_id: lead.bootcamper for lead in leads}

    rows_by_bootcamper = {}
    for row in _payment_rows(set(bootcampers)):
        rows_by_bootcamper.setdefault(row['bootcamper_id'], []).append(row)

    result = []
    for bootcamper_id, bootcamper in bootcampers.items():
        rows = rows_by_bootcamper.get(bootcamper_id, [])
        result.append({
            'bootcamper_id': str(bootcamper_id),
            'bootcamper_name': bootcamper.get_full_name(),
            'email': bootcamper.email,
            'program_count': len({r['program_id'] for r in rows}),
            'pending_payments': int(sum(r['pending'] or 0 for r in rows)),
            **_summarise(rows),
        })

    result.sort(key=lambda item: item['bootcamper_name'])
    return result
