"""Actividad comercial de cada vendedor, para el panel del administrador.

Sólo lectura, igual que `finance_service`. Mide lo que el vendedor controla
—cuántos leads tiene, cuántos convirtió, cuántos no arrancó— y no plata: el
cobro es de Finanzas y ya se ve agrupado por responsable en su propia pestaña.
Repetirlo acá, agrupado por quién trajo al bootcamper, mostraría los mismos
montos contados de otra forma.

Sólo entran los `SALESPERSON`. Un usuario de Finanzas también puede trabajar
leads, pero la pregunta que responde esta vista es la del equipo comercial.
"""
from django.db.models import Count, Q

from apps.authentication.models import CustomUser
from apps.leads.models import Lead


def list_salespeople_activity():
    """Una fila por vendedor activo, con o sin leads.

    Los que no tienen ninguno aparecen en ceros: omitirlos daría la impresión
    de que el vendedor no existe. Los administradores nunca entran.

    Returns:
        Lista de dicts ordenada por nombre, con `assigned_leads`,
        `converted_leads`, `uncontacted_leads` y `conversion_rate`.
        Tres consultas en total, sin N+1.
    """
    salespeople = CustomUser.objects.filter(
        role=CustomUser.Role.SALESPERSON, is_active=True,
    ).order_by('first_name', 'last_name')

    # Un lead convertido conserva su owner, así que sigue contando como
    # asignado: `converted_leads` es un subconjunto de `assigned_leads` y no
    # una categoría aparte.
    counts = {
        row['owner_id']: row
        for row in (
            Lead.objects
            .filter(owner__isnull=False)
            .values('owner_id')
            .annotate(
                assigned=Count('id'),
                converted=Count('id', filter=Q(status=Lead.Status.CONVERTED)),
            )
        )
    }

    # Aparte y no como un tercer `annotate`: filtrar por `interactions` mete un
    # JOIN que repite el lead una vez por interacción e inflaría los conteos de
    # arriba. Acá sólo sobreviven las filas sin interacción, una por lead.
    uncontacted = dict(
        Lead.objects
        .filter(owner__isnull=False, interactions__isnull=True)
        .exclude(status=Lead.Status.CONVERTED)
        .values_list('owner_id')
        .annotate(total=Count('id'))
    )

    activity = []
    for person in salespeople:
        row = counts.get(person.id, {})
        assigned  = row.get('assigned', 0)
        converted = row.get('converted', 0)
        activity.append({
            'salesperson_id':    str(person.id),
            'salesperson':       person.get_full_name(),
            'email':             person.email,
            'assigned_leads':    assigned,
            'converted_leads':   converted,
            'uncontacted_leads': uncontacted.get(person.id, 0),
            # Se redondea a un decimal para que el front no tenga que decidir
            # el formato, y 0 leads da 0.0 en vez de una división por cero.
            'conversion_rate':   round(converted / assigned * 100, 1) if assigned else 0.0,
        })

    return activity
