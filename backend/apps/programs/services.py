"""Business logic for the programs app."""
import logging
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from rest_framework.exceptions import NotFound, ValidationError

from .models import Cohort, Program

logger = logging.getLogger(__name__)


def current_month():
    """Primer día del mes en curso — la granularidad del dominio es el mes."""
    return date.today().replace(day=1)


#: Filas que admite una lista de WhatsApp. Mandar más no recorta: Meta rechaza
#: el mensaje entero y la conversación se queda sin respuesta.
BOT_CATALOG_LIMIT = 10
#: Caracteres del título de una fila y de su descripción, también de Meta.
BOT_LABEL_MAX = 24
BOT_DESCRIPTION_MAX = 72

#: Se escriben aquí en vez de usar el locale: el mes sale en un mensaje de
#: WhatsApp, y depender de que el contenedor tenga instalada la locale es una
#: forma silenciosa de que un día diga "Jul" en medio de una frase en español.
_MONTHS_ES = ('ene', 'feb', 'mar', 'abr', 'may', 'jun',
              'jul', 'ago', 'sep', 'oct', 'nov', 'dic')


def _short_label(name):
    """`name` recortado al último espacio que quepa en BOT_LABEL_MAX.

    Se corta por palabra y no a mitad de una: "Python Full Stack Abril 2026" son
    28 caracteres y quedaría en "Python Full Stack Abri", que se lee como un
    error. El nombre completo no se pierde — va en la descripción de la fila.
    """
    if len(name) <= BOT_LABEL_MAX:
        return name

    cut = name[:BOT_LABEL_MAX]
    space = cut.rfind(' ')
    # Una sola palabra más larga que el tope no tiene dónde cortarse por
    # palabra; ahí sí se corta a lo bruto, que es mejor que no mandar nada.
    return (cut[:space] if space > 0 else cut).rstrip()


def bot_program_catalog():
    """Catálogo de programas que el bot de WhatsApp ofrece en su lista.

    Sólo los activos: es el mismo criterio con el que `resolve_program_by_name`
    vincula la FK del lead, así que ofrecer uno inactivo daría una opción que
    después no se puede enlazar. Los más recientes primero.

    Cada entrada trae el texto ya listo para pintar, porque el recorte a los
    topes de Meta se prueba con pytest y así el flujo de Jelou no lleva lógica:

      - `label`: el nombre recortado por palabra al tope de un título de fila.
      - `description`: el nombre completo cuando hubo recorte —para que no se
        pierda— y la fecha de inicio cuando el nombre entró entero.
      - `id` y `name`: lo que el bot devuelve al alta para vincular la FK por id
        en vez de por coincidencia de texto.

    Returns:
        Lista de dicts, vacía si no hay programas activos.
    """
    programs = list(
        Program.objects.filter(is_active=True).order_by('-start_date')[:BOT_CATALOG_LIMIT + 1]
    )

    if len(programs) > BOT_CATALOG_LIMIT:
        logger.warning(
            'Hay más de %s programas activos: el bot sólo puede ofrecer los %s más '
            'recientes porque es el máximo de filas de una lista de WhatsApp.',
            BOT_CATALOG_LIMIT, BOT_CATALOG_LIMIT,
        )
        programs = programs[:BOT_CATALOG_LIMIT]

    catalog = []
    for program in programs:
        label = _short_label(program.name)
        if label != program.name:
            description = program.name
        else:
            start = program.start_date
            description = f'Inicia {start.day} {_MONTHS_ES[start.month - 1]} {start.year}'

        catalog.append({
            'id': str(program.id),
            'name': program.name,
            'label': label,
            'description': description[:BOT_DESCRIPTION_MAX],
        })

    return catalog


def resolve_active_program_by_id(program_id):
    """El `Program` activo con ese id, o None.

    Devuelve None en vez de fallar cuando el id no existe o el programa se
    desactivó entre que el bot pintó la lista y la persona eligió: el alta cae
    entonces a la resolución por nombre, que es la misma red que sostiene la
    rama de texto libre. Un 400 aquí perdería el lead por un detalle del
    catálogo.
    """
    if not program_id:
        return None

    return Program.objects.filter(pk=program_id, is_active=True).first()


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
