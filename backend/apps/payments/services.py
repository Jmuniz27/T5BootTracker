"""Business logic services for payments app."""
import logging
from datetime import date
from decimal import Decimal
from django.core import signing
from django.utils.timezone import now
from django.db import DatabaseError
from django.db.models import Count, Q, Sum

logger = logging.getLogger(__name__)

# Regla de negocio: un déficit mayor al 10% del costo total dispara la alerta al coordinador.
CRITICAL_DEFICIT_THRESHOLD = Decimal('0.10')

# Los comprobantes se sirven con URL firmada porque el navegador los pide
# directamente (<img>/<object>) y no puede adjuntar el JWT. La firma se emite
# solo dentro de respuestas de la API ya autorizadas por rol, y expira junto
# con la sesión (2h).
RECEIPT_TOKEN_SALT = 'payments.receipt'
RECEIPT_TOKEN_MAX_AGE = 2 * 60 * 60


def make_receipt_token(payment_id) -> str:
    """Signed, expiring token granting read access to one receipt file."""
    return signing.dumps(str(payment_id), salt=RECEIPT_TOKEN_SALT)


def read_receipt_token(token: str) -> str:
    """Return the payment id for a valid token.

    Raises signing.BadSignature (or SignatureExpired) on tampered/expired tokens.
    """
    return signing.loads(token, salt=RECEIPT_TOKEN_SALT, max_age=RECEIPT_TOKEN_MAX_AGE)


class UploadProgramError(Exception):
    """El programa del comprobante no se pudo determinar.

    Lleva el mensaje que verá el bootcamper y un código para el cliente.
    """

    def __init__(self, message, code):
        super().__init__(message)
        self.message = message
        self.code = code


def resolve_upload_program(bootcamper, program_id=None):
    """Return the Program a receipt belongs to.

    El bootcamper no elige el programa al subir: ya está inscrito en uno, así que
    se deduce de su inscripción activa. `program_id` se sigue aceptando para los
    clientes que ya lo mandaban y para desempatar a quien curse dos programas.

    Se exige **exactamente una** inscripción activa en vez de tomar la primera:
    adivinar acá imputaría el pago al programa equivocado, y eso descuadra el
    saldo de los dos programas a la vez.

    Raises:
        UploadProgramError: sin inscripción activa, o con más de una y sin
            `program_id` que desempate.
        Program.DoesNotExist: el `program_id` recibido no existe.
    """
    from apps.programs.models import Enrollment, Program

    if program_id:
        return Program.objects.get(pk=program_id)

    active = list(
        Enrollment.objects
        .filter(bootcamper=bootcamper, status=Enrollment.Status.ACTIVE)
        .select_related('bootcamp')[:2]
    )

    if not active:
        raise UploadProgramError(
            'No tienes una inscripción activa a la cual asociar el comprobante. '
            'Escríbele a tu asesor para que la registre.',
            'NO_ACTIVE_ENROLLMENT',
        )

    if len(active) > 1:
        raise UploadProgramError(
            'Tienes más de un programa activo, así que hay que indicar a cuál '
            'corresponde el comprobante. Escríbele a tu asesor.',
            'AMBIGUOUS_ENROLLMENT',
        )

    return active[0].bootcamp


class ReceiptStorageError(Exception):
    """El archivo del comprobante no se pudo escribir en el storage."""

    message = 'No se pudo guardar el comprobante. Intenta de nuevo en unos minutos.'
    code = 'RECEIPT_STORAGE_ERROR'


def create_payment_with_receipt(bootcamper, program, file, file_type):
    """Create the Payment, writing the receipt to storage.

    El fallo de escritura (permisos del volumen de media, disco lleno) salía sin
    capturar, así que Django respondía su página de error en HTML y el bootcamper
    veía el traceback dentro del modal en vez de un mensaje.

    Raises:
        ReceiptStorageError: el archivo no se pudo escribir.
    """
    from django.core.exceptions import SuspiciousOperation

    from .models import Payment

    try:
        return Payment.objects.create(
            bootcamper=bootcamper,
            program=program,
            receipt_file=file,
            receipt_file_type=file_type,
            status=Payment.Status.DRAFT,
        )
    except (OSError, SuspiciousOperation) as exc:
        logger.exception('Error guardando el comprobante del bootcamper %s.', bootcamper.id)
        raise ReceiptStorageError from exc


def queue_receipt_ocr(payment_id) -> bool:
    """Encola el OCR del comprobante. Devuelve False si el broker no respondió.

    `.delay()` publica en Redis dentro del request, así que si el broker está
    caído levanta y tumbaba la subida entera con un 500. El comprobante ya está
    guardado y Finanzas puede revisarlo a mano, así que se reporta el fallo y se
    deja continuar: devolver error haría que el bootcamper vuelva a subir el
    mismo archivo y duplique comprobantes.
    """
    from .tasks import process_payment_ocr

    try:
        process_payment_ocr.delay(str(payment_id))
        return True
    except Exception:
        logger.exception('No se pudo encolar el OCR del pago %s.', payment_id)
        return False


class PaymentProgressService:
    """Calculate payment progress for a bootcamper in a program."""

    def get_payment_summary(self, bootcamper_id: str, program_id: str) -> dict:
        """
        Returns payment progress metrics for a bootcamper-program pair.

        Fields:
            total_cost               – program cost
            total_paid               – sum of APPROVED confirmed_amount
            pending_amount           – number of PENDING payments
            deficit                  – total_cost - total_paid
            is_critical              – deficit > 10% of total_cost
            time_elapsed_percentage  – % of program duration elapsed
            payment_count            – total number of payments submitted
        """
        from .models import Payment
        from apps.programs.models import Enrollment, Program

        program = Program.objects.get(id=program_id)

        payments = Payment.objects.filter(
            bootcamper_id=bootcamper_id,
            program_id=program_id,
        )

        agg = payments.filter(status=Payment.Status.APPROVED).aggregate(
            total_paid=Sum('confirmed_amount')
        )
        total_paid    = agg['total_paid'] or Decimal('0.00')
        pending_count = payments.filter(status=Payment.Status.PENDING).count()

        # El precio real de esta persona sale de su inscripción, que es donde
        # quedó registrado el descuento.
        enrollment = (
            Enrollment.objects
            .filter(bootcamper_id=bootcamper_id, bootcamp_id=program_id)
            .select_related('cohort')
            .only('agreed_price', 'discount_percentage', 'cohort')
            .first()
        )

        return self._build_summary(
            program,
            total_paid,
            pending_count,
            payments.count(),
            agreed_price=enrollment.agreed_price if enrollment else None,
            discount_percentage=enrollment.discount_percentage if enrollment else None,
            cohort_id=enrollment.cohort_id if enrollment else None,
            cohort_number=enrollment.cohort.number if enrollment and enrollment.cohort else None,
        )

    def get_monitoring_summaries(self, programs, status_filter=None) -> list[dict]:
        """Bulk version of get_payment_summary for PaymentMonitoringView (PERF-1).

        Aggregates every (bootcamper, program) pair in three fixed queries
        (aggregation + bootcampers + nothing per row) instead of ~4 queries per
        bootcamper, keeping the exact same summary dict per row.
        """
        from .models import Payment
        from apps.authentication.models import CustomUser

        program_map = {program.id: program for program in programs}

        rows = (
            Payment.objects
            .filter(program_id__in=program_map)
            .values('bootcamper_id', 'program_id')
            .annotate(
                total_paid=Sum(
                    'confirmed_amount',
                    filter=Q(status=Payment.Status.APPROVED),
                ),
                pending_payments=Count('id', filter=Q(status=Payment.Status.PENDING)),
                payment_count=Count('id'),
            )
        )

        bootcampers = {
            user.id: user
            for user in CustomUser.objects.filter(
                id__in={row['bootcamper_id'] for row in rows},
                role=CustomUser.Role.BOOTCAMPER,
            )
        }

        # Una consulta para todos los precios acordados: uno por fila
        # reintroduciría el N+1 que este método existe para evitar.
        enrollments = self._enrollment_map(
            {row['bootcamper_id'] for row in rows}, set(program_map),
        )

        # Mismo orden que la versión por iteración: programas en el orden
        # recibido y, dentro de cada uno, bootcampers según el ordering del
        # modelo de usuario.
        order = {pid: idx for idx, pid in enumerate(program_map)}
        visible = [row for row in rows if row['bootcamper_id'] in bootcampers]
        visible.sort(
            key=lambda r: (
                order[r['program_id']],
                -bootcampers[r['bootcamper_id']].created_at.timestamp(),
            )
        )
        data = []
        for row in visible:
            bootcamper = bootcampers[row['bootcamper_id']]
            program = program_map[row['program_id']]
            price, discount, cohort_id, cohort_number = enrollments.get(
                (row['bootcamper_id'], row['program_id']), (None, None, None, None),
            )
            summary = self._build_summary(
                program,
                row['total_paid'] or Decimal('0.00'),
                row['pending_payments'],
                row['payment_count'],
                agreed_price=price,
                discount_percentage=discount,
                cohort_id=cohort_id,
                cohort_number=cohort_number,
            )
            if status_filter and summary['payment_status'] != status_filter:
                continue
            data.append({
                'bootcamper_id':   str(bootcamper.id),
                'bootcamper_name': bootcamper.get_full_name(),
                'email':           bootcamper.email,
                'program_id':      str(program.id),
                'program_name':    program.name,
                **summary,
            })
        return data

    def get_bootcamper_summaries(self, bootcampers) -> list[dict]:
        """Una tarjeta por (bootcamper, programa) para el pool de bootcampers.

        `get_monitoring_summaries` arranca de los pagos, así que un bootcamper
        recién convertido —que todavía no subió ningún comprobante— no aparece
        en su resultado, y en el pool tiene que verse igual. Por eso aquí el par
        sale de la unión de dos fuentes:

          - `Enrollment`, que existe desde la conversión aunque no haya pagos;
          - los pagos, que cubren a quien fue dado de alta sin inscripción
            (datos sembrados o cargados a mano antes de que existiera el pool).

        Args:
            bootcampers: iterable de `CustomUser` con rol BOOTCAMPER.

        Returns:
            Lista de dicts con la misma forma que `get_monitoring_summaries`,
            ordenada por bootcamper más reciente y luego por programa. Cuatro
            consultas en total, sin N+1.
        """
        from .models import Payment
        from apps.programs.models import Enrollment, Program

        by_id = {bootcamper.id: bootcamper for bootcamper in bootcampers}
        if not by_id:
            return []

        totals = {
            (row['bootcamper_id'], row['program_id']): row
            for row in (
                Payment.objects
                .filter(bootcamper_id__in=by_id)
                .values('bootcamper_id', 'program_id')
                .annotate(
                    total_paid=Sum(
                        'confirmed_amount',
                        filter=Q(status=Payment.Status.APPROVED),
                    ),
                    pending_payments=Count('id', filter=Q(status=Payment.Status.PENDING)),
                    payment_count=Count('id'),
                )
            )
        }

        # La misma consulta que ya daba los pares trae el precio acordado y la
        # cohorte: no se agrega ninguna consulta al camino.
        enrollments = {
            (bootcamper_id, program_id): (price, discount, cohort_id, cohort_number)
            for bootcamper_id, program_id, price, discount, cohort_id, cohort_number in (
                Enrollment.objects
                .filter(bootcamper_id__in=by_id)
                .values_list(
                    'bootcamper_id', 'bootcamp_id',
                    'agreed_price', 'discount_percentage',
                    'cohort_id', 'cohort__number',
                )
            )
        }

        pairs = set(totals)
        pairs.update(enrollments)
        if not pairs:
            return []

        programs = {
            program.id: program
            for program in Program.objects.filter(id__in={pid for _, pid in pairs})
        }

        ordered = sorted(
            pairs,
            key=lambda pair: (
                -by_id[pair[0]].created_at.timestamp(),
                programs[pair[1]].name,
            ),
        )

        data = []
        for bootcamper_id, program_id in ordered:
            bootcamper = by_id[bootcamper_id]
            program    = programs[program_id]
            row        = totals.get((bootcamper_id, program_id), {})
            price, discount, cohort_id, cohort_number = enrollments.get(
                (bootcamper_id, program_id), (None, None, None, None),
            )
            summary    = self._build_summary(
                program,
                row.get('total_paid') or Decimal('0.00'),
                row.get('pending_payments') or 0,
                row.get('payment_count') or 0,
                agreed_price=price,
                discount_percentage=discount,
                cohort_id=cohort_id,
                cohort_number=cohort_number,
            )
            data.append({
                'bootcamper_id':   str(bootcamper.id),
                'bootcamper_name': bootcamper.get_full_name(),
                'email':           bootcamper.email,
                'program_id':      str(program.id),
                'program_name':    program.name,
                **summary,
            })
        return data

    @staticmethod
    def _enrollment_map(bootcamper_ids, program_ids):
        """{(bootcamper, programa): (precio, descuento, cohorte, número)} en una consulta.

        Es la única fuente del precio real: el descuento se concede al convertir
        y queda en la inscripción, no en el programa.

        También es la única fuente de la cohorte. `Payment` apunta al programa,
        no a la edición, así que sin la inscripción no se sabe en qué cohorte
        está la persona a la que se le cobra. La inscripción es única por
        (bootcamper, programa), así que hay exactamente una cohorte por par.
        """
        from apps.programs.models import Enrollment

        if not bootcamper_ids or not program_ids:
            return {}

        return {
            (bootcamper_id, program_id): (price, discount, cohort_id, cohort_number)
            for bootcamper_id, program_id, price, discount, cohort_id, cohort_number in (
                Enrollment.objects
                .filter(bootcamper_id__in=bootcamper_ids, bootcamp_id__in=program_ids)
                .values_list(
                    'bootcamper_id', 'bootcamp_id',
                    'agreed_price', 'discount_percentage',
                    'cohort_id', 'cohort__number',
                )
            )
        }

    def _build_summary(
        self, program, total_paid, pending_count, payment_count,
        agreed_price=None, discount_percentage=None,
        cohort_id=None, cohort_number=None,
    ) -> dict:
        """Métricas de avance de pago de un par bootcamper/programa.

        `agreed_price` es lo que esta persona debe de verdad: el costo del
        programa menos el descuento que se le concedió al convertir. Todo lo que
        sigue —déficit, porcentaje pagado, esperado a la fecha y la alerta del
        10%— se calcula sobre él, no sobre `program.total_cost`. Con el precio
        del programa, un descuento haría saltar la alerta por una deuda que no
        existe.

        Cae al costo del programa cuando no hay inscripción: hay pagos que
        existen sin ella (datos viejos, o cargados a mano), y quedarse sin
        denominador rompería el cálculo entero.
        """
        total_cost  = agreed_price if agreed_price is not None else program.total_cost
        deficit     = max(total_cost - total_paid, Decimal('0.00'))
        is_critical = deficit > total_cost * CRITICAL_DEFICIT_THRESHOLD

        today      = date.today()
        start_date = program.start_date
        end_date   = program.end_date
        total_days = max((end_date - start_date).days, 1)
        elapsed    = max(min((today - start_date).days, total_days), 0)
        time_elapsed_percentage = round((elapsed / total_days) * 100, 1)

        payment_percentage      = round(float(total_paid / total_cost) * 100, 1) if total_cost > 0 else 0.0
        expected_payment_by_now = total_cost * Decimal(str(round(time_elapsed_percentage / 100, 6)))
        surplus_amount          = max(total_paid - expected_payment_by_now, Decimal('0.00'))

        if total_paid >= expected_payment_by_now:
            payment_status = 'ON_TRACK'
        elif is_critical:
            payment_status = 'CRITICAL'
        else:
            payment_status = 'AT_RISK'

        return {
            # `total_cost` conserva su nombre porque lo consumen el frontend, el
            # móvil y las plantillas de correo; su valor es ahora el precio
            # acordado. Los dos campos siguientes dejan ver la diferencia.
            'total_cost':              total_cost,
            'program_cost':            program.total_cost,
            'discount_percentage':     discount_percentage or Decimal('0.00'),
            'total_paid':              total_paid,
            'pending_payments':        pending_count,
            'deficit':                 deficit,
            'deficit_amount':          deficit,
            'pending_balance':         deficit,
            'is_critical':             is_critical,
            'time_elapsed_percentage': time_elapsed_percentage,
            'payment_count':           payment_count,
            'payment_percentage':      payment_percentage,
            'payment_status':          payment_status,
            # Bandera aparte y no un cuarto valor de `payment_status`: ese enum
            # ya lo consume el filtro `?status=` y los badges del frontend, y
            # cambiarlo haría que quien terminó de pagar deje de contar como
            # ON_TRACK en pantallas que hoy funcionan. Con esto, separar en
            # pestañas no toca nada de lo existente.
            'is_fully_paid':           deficit <= Decimal('0.00'),
            'cohort_id':               str(cohort_id) if cohort_id else None,
            'cohort_number':           cohort_number,
            'expected_payment_by_now': expected_payment_by_now,
            'surplus_amount':          surplus_amount,
            'program_start':           str(program.start_date),
            'program_end':             str(program.end_date),
        }


def get_bootcamper_self_assignment_enabled():
    """Si Finanzas puede tomar bootcampers del pool por su cuenta.

    Espejo de `leads.services.get_self_assignment_enabled`, aplicado al pool de
    bootcampers.
    """
    from .models import BootcamperAssignmentSetting

    return BootcamperAssignmentSetting.get_solo().self_assign_enabled


def set_bootcamper_self_assignment_enabled(enabled, user):
    """Cambia el control global, dejando registrado quién y cuándo.

    `select_for_update` sobre el singleton: dos administradores cambiándolo a la
    vez dejarían el último valor sin saber cuál quedó, y acá interesa que el
    registro de quién lo cambió sea el del valor que efectivamente quedó.
    """
    from django.db import transaction

    from .models import BootcamperAssignmentSetting

    with transaction.atomic():
        setting = BootcamperAssignmentSetting.objects.select_for_update().get_or_create(pk=1)[0]
        setting.self_assign_enabled = enabled
        setting.updated_by = user
        setting.save(update_fields=['self_assign_enabled', 'updated_by', 'updated_at'])

    logger.info(
        'Bootcamper self-assignment %s by %s',
        'enabled' if enabled else 'disabled',
        user.email,
    )
    return setting


# ─── Reparto en lote del pool de cobro (#326) ─────────────────────────────────

# Tope por tanda. En la práctica el pool es de decenas, no de miles: el límite
# está para que un cliente no mande una lista arbitraria, no para acotar un uso
# real. Si alguna vez estorba, se sube.
MAX_BULK_ASSIGN = 200


def assign_bootcampers_in_bulk(bootcamper_ids, owner):
    """Asignar varios bootcampers del pool a una persona de Finanzas.

    La clienta pidió el lote porque en su día a día casi toda la cartera va a la
    misma persona y sólo las empresas van a otra: repartir de a uno son N clics
    para el mismo gesto.

    Cada bootcamper se asigna en su propio bloque atómico. Si uno falla —lo tomó
    alguien mientras tanto, o dejó de existir— el resto sí queda asignado y se
    informa cuáles no. Envolver la tanda entera en una sola transacción haría
    que un solo conflicto tirara abajo un reparto de cincuenta.

    Returns:
        (assigned, failed): lista de CustomUser asignados y lista de
        ``{'bootcamper_id', 'code', 'error'}`` para los que no se pudo.
    """
    from django.db import transaction
    from apps.authentication.models import CustomUser

    assigned, failed = [], []

    for bootcamper_id in bootcamper_ids:
        try:
            with transaction.atomic():
                try:
                    bootcamper = CustomUser.objects.select_for_update().get(
                        pk=bootcamper_id, role=CustomUser.Role.BOOTCAMPER,
                    )
                except CustomUser.DoesNotExist:
                    failed.append({
                        'bootcamper_id': str(bootcamper_id),
                        'code': 'BOOTCAMPER_NOT_FOUND',
                        'error': 'Bootcamper no encontrado.',
                    })
                    continue

                if bootcamper.finance_owner_id is not None:
                    failed.append({
                        'bootcamper_id': str(bootcamper_id),
                        'code': 'BOOTCAMPER_ALREADY_ASSIGNED',
                        'error': f'{bootcamper.get_full_name()} ya lo está monitoreando otra persona.',
                    })
                    continue

                bootcamper.finance_owner       = owner
                bootcamper.finance_assigned_at = now()
                bootcamper.save(update_fields=['finance_owner', 'finance_assigned_at', 'updated_at'])
                assigned.append(bootcamper)
        except DatabaseError:
            logger.exception('Fallo al asignar el bootcamper %s en lote', bootcamper_id)
            failed.append({
                'bootcamper_id': str(bootcamper_id),
                'code': 'ASSIGN_FAILED',
                'error': 'No se pudo asignar.',
            })

    logger.info(
        'Reparto en lote a %s: %s asignados, %s con problema',
        owner.id, len(assigned), len(failed),
    )
    return assigned, failed
