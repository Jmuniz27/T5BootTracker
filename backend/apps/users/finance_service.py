"""Lectura de la cartera de bootcampers de cada persona de Finanzas (solo Admin).

Vive aparte de `users/services.py` porque no muta nada: son consultas de sólo
lectura para el panel del administrador.

El vínculo es `CustomUser.finance_owner`: quien se asignó al bootcamper desde el
pool es quien responde por su cobro. Antes se derivaba de `Lead.owner` →
`Lead.bootcamper`, pero eso contestaba otra pregunta —quién trajo al bootcamper,
no quién le sigue los pagos— y desde que Finanzas se asigna su propia cartera
las dos cosas dejaron de coincidir.
"""
from apps.authentication.models import CustomUser
from .portfolio_math import group_rows_by_bootcamper, summarise


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
    rows_by_bootcamper = group_rows_by_bootcamper(every_bootcamper)

    portfolios = []
    for person in finance_users:
        bootcamper_ids = by_finance.get(person.id, set())
        rows = [r for bc in bootcamper_ids for r in rows_by_bootcamper.get(bc, [])]
        portfolios.append({
            'finance_id': str(person.id),
            'finance_name': person.get_full_name(),
            'email': person.email,
            'bootcamper_count': len(bootcamper_ids),
            **summarise(rows),
        })

    return portfolios


def get_finance_bootcampers(finance_user):
    """Los bootcampers de una persona de Finanzas, con su resumen por programa."""
    bootcampers = {
        user.id: user
        for user in CustomUser.objects.filter(
            role=CustomUser.Role.BOOTCAMPER, finance_owner=finance_user,
        )
    }

    rows_by_bootcamper = group_rows_by_bootcamper(set(bootcampers))

    result = []
    for bootcamper_id, bootcamper in bootcampers.items():
        rows = rows_by_bootcamper.get(bootcamper_id, [])
        result.append({
            'bootcamper_id': str(bootcamper_id),
            'bootcamper_name': bootcamper.get_full_name(),
            'email': bootcamper.email,
            'program_count': len({r['program_id'] for r in rows}),
            'pending_payments': int(sum(r['pending'] or 0 for r in rows)),
            **summarise(rows),
        })

    result.sort(key=lambda item: item['bootcamper_name'])
    return result
