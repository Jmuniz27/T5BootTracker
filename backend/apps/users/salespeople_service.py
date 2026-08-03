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
from django.db.models.functions import TruncMonth

from apps.authentication.models import CustomUser
from apps.leads.models import Interaction, Lead


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


#: Meses hacia atrás que muestra la serie temporal del detalle. Doce da una
#: lectura de un año sin volver el gráfico ilegible.
TREND_MONTHS = 12


def _lead_status_breakdown(salesperson):
    """Reparto de los leads del vendedor por estado, para el gráfico."""
    counts = dict(
        Lead.objects
        .filter(owner=salesperson)
        .values_list('status')
        .annotate(total=Count('id'))
    )

    # Se recorren los choices y no las filas: un estado sin leads tiene que
    # aparecer en cero, o el gráfico cambia de forma según los datos.
    return [
        {'status': value, 'status_label': label, 'count': counts.get(value, 0)}
        for value, label in Lead.Status.choices
    ]


def _monthly_trend(salesperson):
    """Asignados y convertidos por mes, del más viejo al más nuevo.

    Se agrupa por `assigned_at` y no por `created_at`: la pregunta es cuándo
    este vendedor tomó el lead, no cuándo entró al sistema.
    """
    rows = (
        Lead.objects
        .filter(owner=salesperson, assigned_at__isnull=False)
        .annotate(month=TruncMonth('assigned_at'))
        .values('month')
        .annotate(
            assigned=Count('id'),
            converted=Count('id', filter=Q(status=Lead.Status.CONVERTED)),
        )
        .order_by('-month')[:TREND_MONTHS]
    )

    return [
        {
            'month': row['month'].date().isoformat(),
            'assigned': row['assigned'],
            'converted': row['converted'],
        }
        for row in reversed(list(rows))
    ]


def get_salesperson_activity(salesperson):
    """Rendimiento de un vendedor: totales, reparto por estado y serie mensual.

    Los tiempos de gestión (retención y primer contacto) no se recalculan acá:
    se leen de `AnalyticsService.get_lead_management_metrics`, que ya los define
    para el dashboard. Calcula los de todo el equipo y se descarta el resto, y
    aun así se prefiere eso a tener dos definiciones de "tiempo de retención"
    que puedan desviarse.

    Args:
        salesperson: `CustomUser` con rol SALESPERSON.

    Returns:
        dict con los totales, `by_status`, `by_month` y los tiempos de gestión.
    """
    from apps.analytics.services import AnalyticsService

    assigned = Lead.objects.filter(owner=salesperson).count()
    converted = Lead.objects.filter(owner=salesperson, status=Lead.Status.CONVERTED).count()
    uncontacted = (
        Lead.objects
        .filter(owner=salesperson, interactions__isnull=True)
        .exclude(status=Lead.Status.CONVERTED)
        .count()
    )

    management = next(
        (
            row for row in AnalyticsService().get_lead_management_metrics()['by_salesperson']
            if row['salesperson_id'] == str(salesperson.id)
        ),
        {},
    )

    return {
        'salesperson_id': str(salesperson.id),
        'salesperson': salesperson.get_full_name(),
        'email': salesperson.email,
        'assigned_leads': assigned,
        'converted_leads': converted,
        'uncontacted_leads': uncontacted,
        'conversion_rate': round(converted / assigned * 100, 1) if assigned else 0.0,
        'interactions': Interaction.objects.filter(salesperson=salesperson).count(),
        # Ausentes cuando el vendedor no tiene leads asignados: son promedios, y
        # un 0 se leería como "responde al instante".
        'avg_retention_hours': management.get('avg_retention_hours'),
        'avg_time_to_first_contact_hours': management.get('avg_time_to_first_contact_hours'),
        'by_status': _lead_status_breakdown(salesperson),
        'by_month': _monthly_trend(salesperson),
    }
