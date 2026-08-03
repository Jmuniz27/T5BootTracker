"""Business logic for the programs app."""
import logging
from datetime import date

from .models import Cohort

logger = logging.getLogger(__name__)


def current_month():
    """Primer día del mes en curso — la granularidad del dominio es el mes."""
    return date.today().replace(day=1)


def set_cohort_status(cohort, status, *, save=True):
    """Mueve la cohorte de estado y resella `end_month` al finalizarla.

    Los tres estados los decide el administrador a mano. Lo único automático es
    el mes de fin: `end_month` se crea como **fin previsto** y al pasar a
    FINISHED se reescribe con el mes en curso, así que nadie lo teclea al
    cerrar la cohorte.

    Se resella sólo en la transición hacia FINISHED. Editar cualquier otro
    campo de una cohorte ya cerrada no mueve su fecha de cierre, porque el
    serializer sólo llama aquí cuando el estado cambia.

    Reabrir una cohorte **no** vacía el campo: dejaría de haber rango para el
    cálculo de porcentaje de tiempo transcurrido de los pagos. El valor vuelve
    a leerse como fin previsto.

    Args:
        cohort: la instancia de `Cohort` a modificar.
        status: valor de `Cohort.Status`.
        save: si es False sólo muta la instancia en memoria (lo usa el
            serializer, que guarda una sola vez con el resto de los campos).

    Returns:
        La misma instancia, ya mutada.
    """
    previous = cohort.status
    cohort.status = status

    if status == Cohort.Status.FINISHED and previous != Cohort.Status.FINISHED:
        cohort.end_month = current_month()
        logger.info(
            'Cohorte %s del programa %s finalizada en %s',
            cohort.number, cohort.program_id, cohort.end_month,
        )
    elif previous == Cohort.Status.FINISHED and status != Cohort.Status.FINISHED:
        logger.info(
            'Cohorte %s del programa %s reabierta: %s queda como fin previsto',
            cohort.number, cohort.program_id, cohort.end_month,
        )

    if save:
        cohort.save()

    return cohort
