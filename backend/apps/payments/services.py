"""Business logic services for payments app."""
import logging
from datetime import date
from decimal import Decimal
from django.core import signing
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
        from apps.programs.models import Program

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

        return self._build_summary(program, total_paid, pending_count, payments.count())

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
            summary = self._build_summary(
                program,
                row['total_paid'] or Decimal('0.00'),
                row['pending_payments'],
                row['payment_count'],
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

        pairs = set(totals)
        pairs.update(
            Enrollment.objects
            .filter(bootcamper_id__in=by_id)
            .values_list('bootcamper_id', 'bootcamp_id')
        )
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
            summary    = self._build_summary(
                program,
                row.get('total_paid') or Decimal('0.00'),
                row.get('pending_payments') or 0,
                row.get('payment_count') or 0,
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

    def _build_summary(self, program, total_paid, pending_count, payment_count) -> dict:
        total_cost  = program.total_cost
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
            'total_cost':              total_cost,
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
            'expected_payment_by_now': expected_payment_by_now,
            'surplus_amount':          surplus_amount,
            'program_start':           str(program.start_date),
            'program_end':             str(program.end_date),
        }
