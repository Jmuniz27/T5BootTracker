"""Lectura de la cartera de bootcampers de cada persona de Finanzas (solo Admin).

Vive aparte de `users/services.py` porque no muta nada: son consultas de sólo
lectura para el panel del administrador.

El vínculo es `CustomUser.finance_owner`: quien se asignó al bootcamper desde el
pool es quien responde por su cobro. Antes se derivaba de `Lead.owner` →
`Lead.bootcamper`, pero eso contestaba otra pregunta —quién trajo al bootcamper,
no quién le sigue los pagos— y desde que Finanzas se asigna su propia cartera
las dos cosas dejaron de coincidir.
"""
from decimal import Decimal

from django.db.models import Case, DecimalField, Sum, When

from apps.authentication.models import CustomUser
from apps.payments.models import Payment
# Se importa el umbral en vez de repetir el 0.10: es una regla de negocio
# crítica y tener dos copias es justo cómo se desincronizan.
from apps.payments.services import CRITICAL_DEFICIT_THRESHOLD

ZERO = Decimal('0.00')


def _bootcamper_ids_by_finance():
    """{finance_id: {bootcamper_id, …}} en una sola consulta.

    Un bootcamper sin `finance_owner` sigue en el pool y no entra en ninguna
    cartera; se cuenta aparte en `unassigned_bootcamper_count`.
    """
    pairs = (
        CustomUser.objects
        .filter(role=CustomUser.Role.BOOTCAMPER, finance_owner__isnull=False)
        .values_list('finance_owner_id', 'id')
    )

    grouped = {}
    for finance_id, bootcamper_id in pairs:
        grouped.setdefault(finance_id, set()).add(bootcamper_id)
    return grouped


def unassigned_bootcamper_count():
    """Cuántos bootcampers activos siguen sin responsable de cobro."""
    return CustomUser.objects.filter(
        role=CustomUser.Role.BOOTCAMPER,
        is_active=True,
        finance_owner__isnull=True,
    ).count()


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


def list_finance_portfolios():
    """Una fila por persona de Finanzas activa, con o sin bootcampers.

    Las que no tienen ninguno aparecen en ceros: omitirlas daría la impresión de
    que no existen. Los administradores nunca entran — no tienen cartera propia.
    """
    finance_users = CustomUser.objects.filter(
        role=CustomUser.Role.FINANCE, is_active=True,
    ).order_by('first_name', 'last_name')

    by_finance = _bootcamper_ids_by_finance()
    every_bootcamper = {bc for ids in by_finance.values() for bc in ids}
    rows_by_bootcamper = {}
    for row in _payment_rows(every_bootcamper):
        rows_by_bootcamper.setdefault(row['bootcamper_id'], []).append(row)

    portfolios = []
    for person in finance_users:
        bootcamper_ids = by_finance.get(person.id, set())
        rows = [r for bc in bootcamper_ids for r in rows_by_bootcamper.get(bc, [])]
        portfolios.append({
            'finance_id': str(person.id),
            'finance_name': person.get_full_name(),
            'email': person.email,
            'bootcamper_count': len(bootcamper_ids),
            **_summarise(rows),
        })

    return portfolios


def _enrollment_context(bootcamper_ids):
    """{(bootcamper, programa): (cohorte, número, estado)} en una consulta.

    `Payment` apunta al programa y no a la edición, así que la cohorte sólo se
    conoce por la inscripción, que es única por (bootcamper, programa).
    """
    from apps.programs.models import Enrollment

    if not bootcamper_ids:
        return {}

    return {
        (bootcamper_id, program_id): (cohort_id, number, cohort_status)
        for bootcamper_id, program_id, cohort_id, number, cohort_status in (
            Enrollment.objects
            .filter(bootcamper_id__in=bootcamper_ids)
            .values_list(
                'bootcamper_id', 'bootcamp_id',
                'cohort_id', 'cohort__number', 'cohort__status',
            )
        )
    }


def get_finance_bootcampers(finance_user):
    """Una tarjeta por (bootcamper, programa) de la cartera de esa persona.

    Antes agrupaba por bootcamper y sólo decía cuántos programas tenía, así que
    no se podía mostrar de qué programa ni de qué cohorte se le cobra, ni
    filtrar por programa. El cobro se sigue por edición, y una persona puede
    estar en más de una.
    """
    from apps.programs.models import Program

    bootcampers = {
        user.id: user
        for user in CustomUser.objects.filter(
            role=CustomUser.Role.BOOTCAMPER, finance_owner=finance_user,
        )
    }

    rows = _payment_rows(set(bootcampers))
    enrollments = _enrollment_context(set(bootcampers))

    # El par sale de la unión de pagos e inscripciones: alguien recién asignado
    # todavía no subió comprobantes y debe verse igual en la cartera.
    pairs = {(r['bootcamper_id'], r['program_id']) for r in rows}
    pairs.update(enrollments)
    if not pairs:
        return []

    programs = {
        program.id: program
        for program in Program.objects.filter(id__in={pid for _, pid in pairs})
    }
    rows_by_pair = {}
    for row in rows:
        rows_by_pair.setdefault((row['bootcamper_id'], row['program_id']), []).append(row)

    result = []
    for bootcamper_id, program_id in pairs:
        bootcamper = bootcampers[bootcamper_id]
        program = programs.get(program_id)
        pair_rows = rows_by_pair.get((bootcamper_id, program_id), [])
        cohort_id, cohort_number, cohort_status = enrollments.get(
            (bootcamper_id, program_id), (None, None, None),
        )
        summary = _summarise(pair_rows)

        result.append({
            'bootcamper_id': str(bootcamper_id),
            'bootcamper_name': bootcamper.get_full_name(),
            'email': bootcamper.email,
            'program_id': str(program_id),
            'program_name': program.name if program else '—',
            'cohort_id': str(cohort_id) if cohort_id else None,
            'cohort_number': cohort_number,
            # Sin cohorte no hay estado; el frontend la trata como activa, porque
            # se le sigue cobrando igual.
            'cohort_status': cohort_status,
            'pending_payments': int(sum(r['pending'] or 0 for r in pair_rows)),
            # Sin deuda ya no hay nada que cobrar: es lo que separa la vista.
            'is_fully_paid': summary['deficit'] <= ZERO,
            **summary,
        })

    result.sort(key=lambda item: (item['bootcamper_name'], item['program_name']))
    return result
