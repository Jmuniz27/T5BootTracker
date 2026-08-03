"""Business logic for the programs app."""
import logging
from datetime import date

from .models import Cohort

logger = logging.getLogger(__name__)


def current_month():
    """Primer día del mes en curso — la granularidad del dominio es el mes."""
    return date.today().replace(day=1)


def set_cohort_status(cohort, status, *, save=True):
    """Mueve la cohorte de estado y mantiene `end_month` en consecuencia.

    Los tres estados los decide el administrador a mano. Lo único automático es
    el mes de finalización: al marcar FINISHED se sella con el mes en curso, y
    si la cohorte se reabre se limpia, porque una cohorte que sigue viva no
    tiene mes de fin.

    Se respeta un `end_month` ya sellado: reconfirmar FINISHED no reescribe el
    mes original, para que corregir cualquier otro campo de una cohorte cerrada
    no mueva su fecha de cierre.

    Args:
        cohort: la instancia de `Cohort` a modificar.
        status: valor de `Cohort.Status`.
        save: si es False sólo muta la instancia en memoria (lo usa el
            serializer, que guarda una sola vez con el resto de los campos).

    Returns:
        La misma instancia, ya mutada.
    """
    cohort.status = status

    if status == Cohort.Status.FINISHED:
        if cohort.end_month is None:
            cohort.end_month = current_month()
            logger.info(
                'Cohorte %s del programa %s finalizada en %s',
                cohort.number, cohort.program_id, cohort.end_month,
            )
    elif cohort.end_month is not None:
        logger.info(
            'Cohorte %s del programa %s reabierta: se limpia el mes de fin',
            cohort.number, cohort.program_id,
        )
        cohort.end_month = None

    if save:
        cohort.save()

    return cohort
