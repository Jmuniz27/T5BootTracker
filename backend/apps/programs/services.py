"""Business logic for the programs app."""
import logging
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from rest_framework.exceptions import NotFound, ValidationError

from .models import Cohort

logger = logging.getLogger(__name__)


def current_month():
    """Primer día del mes en curso — la granularidad del dominio es el mes."""
    return date.today().replace(day=1)


#: Estados en los que una cohorte todavía admite inscripciones. Una finalizada
#: no: meter a alguien en una edición que ya cerró deja una inscripción que
#: nunca va a cursar y ensucia el cobro.
ASSIGNABLE_COHORT_STATUSES = (Cohort.Status.UPCOMING, Cohort.Status.IN_PROGRESS)


def resolve_assignable_cohort(program, cohort_id):
    """Devuelve la cohorte a la que se puede inscribir, o None si no se pidió.

    Tres cosas se validan aquí, y no en el serializer, porque dependen del
    programa elegido en la misma petición:

      - que la cohorte exista;
      - que sea **de ese programa** — una cohorte 1 existe en varios programas,
        así que un id suelto no basta para saber que es la correcta;
      - que su estado admita inscripciones.

    Args:
        program: el `Program` elegido en la conversión.
        cohort_id: UUID o None.

    Returns:
        La instancia de `Cohort`, o None si no se envió ninguna.

    Raises:
        NotFound: la cohorte no existe.
        ValidationError: no pertenece al programa, o ya está finalizada.
    """
    if not cohort_id:
        return None

    try:
        cohort = Cohort.objects.select_related('program').get(pk=cohort_id)
    except Cohort.DoesNotExist:
        raise NotFound({'error': 'Cohorte no encontrada.', 'code': 'COHORT_NOT_FOUND'})

    if cohort.program_id != program.id:
        raise ValidationError({
            'error': f'La cohorte {cohort.number} no pertenece a {program.name}.',
            'code': 'COHORT_PROGRAM_MISMATCH',
        })

    if cohort.status not in ASSIGNABLE_COHORT_STATUSES:
        raise ValidationError({
            'error': (
                f'La cohorte {cohort.number} está {cohort.get_status_display().lower()}: '
                'sólo se puede inscribir en cohortes próximas o en curso.'
            ),
            'code': 'COHORT_NOT_ASSIGNABLE',
        })

    return cohort


def apply_discount(total_cost, discount_percentage):
    """Precio a pagar tras aplicar un descuento porcentual al costo del programa.

    Vive aquí porque el precio es del programa: quien concede el descuento (la
    conversión de un lead) y quien lo cobra (los pagos) tienen que obtener
    exactamente el mismo número, y con dos implementaciones no lo harían.

    Se redondea a dos decimales con ROUND_HALF_UP: es dinero que alguien va a
    transferir, así que no puede quedar con más precisión de la que existe.

    Args:
        total_cost: `Program.total_cost`.
        discount_percentage: 0–100. Un 0 devuelve el costo intacto.

    Returns:
        Decimal con dos decimales.
    """
    factor = (Decimal('100') - Decimal(discount_percentage)) / Decimal('100')
    return (Decimal(total_cost) * factor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


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
