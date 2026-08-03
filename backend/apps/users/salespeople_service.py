"""Lectura de la cartera de bootcampers de cada vendedor (solo Administrador).

Vive aparte de `users/services.py` porque no muta nada: son consultas de sólo
lectura para el panel del administrador.

El vínculo vendedor → bootcamper es `Lead.owner` → `Lead.bootcamper`: el lead es
el registro de la relación comercial, y su conversión deja apuntado al usuario
que se creó.
"""
from apps.authentication.models import CustomUser
from apps.leads.models import Lead
from .portfolio_math import group_rows_by_bootcamper, summarise


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
    rows_by_bootcamper = group_rows_by_bootcamper(every_bootcamper)

    portfolios = []
    for person in salespeople:
        bootcamper_ids = by_salesperson.get(person.id, set())
        rows = [r for bc in bootcamper_ids for r in rows_by_bootcamper.get(bc, [])]
        portfolios.append({
            'salesperson_id': str(person.id),
            'salesperson': person.get_full_name(),
            'email': person.email,
            'bootcamper_count': len(bootcamper_ids),
            **summarise(rows),
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
