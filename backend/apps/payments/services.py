"""Business logic services for payments app."""
import logging
from datetime import date
from decimal import Decimal
from django.db.models import Sum

logger = logging.getLogger(__name__)


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
        total_cost    = program.total_cost
        deficit       = max(total_cost - total_paid, Decimal('0.00'))
        is_critical   = deficit > total_cost * Decimal('0.10')

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
            'payment_count':           payments.count(),
            'payment_percentage':      payment_percentage,
            'payment_status':          payment_status,
            'expected_payment_by_now': expected_payment_by_now,
            'surplus_amount':          surplus_amount,
            'program_start':           str(program.start_date),
            'program_end':             str(program.end_date),
        }
