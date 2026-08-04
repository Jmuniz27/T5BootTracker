"""Descuento por bootcamper: se concede al convertir y los pagos lo respetan."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.leads.models import Lead
from apps.leads.services import convert_lead_to_bootcamper
from apps.payments.models import Payment
from apps.payments.services import PaymentProgressService
from apps.programs.models import Enrollment
from apps.programs.services import apply_discount


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def qualify(lead):
    """La conversión exige QUALIFIED; assigned_lead viene en INTERESTED."""
    lead.status = Lead.Status.QUALIFIED
    lead.save(update_fields=['status'])
    return lead


def convert(lead, program, cedula='1713175071', **extra):
    return convert_lead_to_bootcamper(lead, {
        'cedula': cedula,
        'program_id': str(program.id),
        **extra,
    })


class TestApplyDiscount:
    @pytest.mark.parametrize('percentage,expected', [
        ('0',     '1200.00'),
        ('10',    '1080.00'),
        ('25',    '900.00'),
        ('100',   '0.00'),
    ])
    def test_math(self, percentage, expected):
        assert apply_discount(Decimal('1200.00'), Decimal(percentage)) == Decimal(expected)

    def test_rounds_to_cents(self):
        """Es dinero que alguien transfiere: no puede quedar con más precisión."""
        result = apply_discount(Decimal('1000.00'), Decimal('33.33'))
        assert result == Decimal('666.70')
        assert result.as_tuple().exponent == -2


class TestConversionRecordsDiscount:
    def test_without_discount_the_price_is_the_program_cost(self, db, program, assigned_lead):
        convert(qualify(assigned_lead), program, email='sin.desc@test.com')

        enrollment = Enrollment.objects.get(bootcamp=program)
        assert enrollment.discount_percentage == Decimal('0.00')
        assert enrollment.agreed_price == program.total_cost

    def test_discount_is_stored_with_the_resulting_price(self, db, program, assigned_lead):
        convert(qualify(assigned_lead), program, email='con.desc@test.com', discount_percentage=Decimal('25'))

        enrollment = Enrollment.objects.get(bootcamp=program)
        # Se guardan los dos: sin el porcentaje no se puede auditar el precio.
        assert enrollment.discount_percentage == Decimal('25.00')
        assert enrollment.agreed_price == apply_discount(program.total_cost, Decimal('25'))

    def test_response_reports_what_was_registered(self, db, program, assigned_lead):
        result = convert(qualify(assigned_lead), program, email='resp@test.com', discount_percentage=Decimal('10'))

        assert Decimal(result['discount_percentage']) == Decimal('10')
        assert Decimal(result['agreed_price']) == apply_discount(program.total_cost, Decimal('10'))


class TestConversionEndpointValidation:
    def url(self, lead):
        return f'/api/leads/{lead.id}/convert/'

    def test_over_one_hundred_is_rejected(self, db, salesperson_user, program, assigned_lead):
        resp = make_client(salesperson_user).post(
            self.url(assigned_lead),
            {'cedula': '1713175071', 'program_id': str(program.id), 'discount_percentage': '101', 'email': 'over100@test.com'},
            format='json',
        )
        assert resp.status_code == 400
        assert 'discount_percentage' in resp.json()

    def test_negative_is_rejected(self, db, salesperson_user, program, assigned_lead):
        resp = make_client(salesperson_user).post(
            self.url(assigned_lead),
            {'cedula': '1713175071', 'program_id': str(program.id), 'discount_percentage': '-5', 'email': 'negative@test.com'},
            format='json',
        )
        assert resp.status_code == 400
        assert 'discount_percentage' in resp.json()

    def test_the_client_cannot_set_the_final_price(self, db, salesperson_user, program, assigned_lead):
        """La cuenta la hace el backend: un precio mandado por el cliente se ignora."""
        qualify(assigned_lead)
        resp = make_client(salesperson_user).post(
            self.url(assigned_lead),
            {
                'cedula': '1713175071',
                'program_id': str(program.id),
                'discount_percentage': '10',
                'agreed_price': '1.00',
                'email': 'cannot.set.price@test.com',
            },
            format='json',
        )
        assert resp.status_code in (200, 201)
        enrollment = Enrollment.objects.get(bootcamp=program)
        assert enrollment.agreed_price == apply_discount(program.total_cost, Decimal('10'))

    def test_omitting_it_defaults_to_zero(self, db, salesperson_user, program, assigned_lead):
        qualify(assigned_lead)
        resp = make_client(salesperson_user).post(
            self.url(assigned_lead),
            {'cedula': '1713175071', 'program_id': str(program.id), 'email': 'omitting@test.com'},
            format='json',
        )
        assert resp.status_code in (200, 201)
        assert Enrollment.objects.get(bootcamp=program).discount_percentage == Decimal('0.00')


class TestPaymentsRespectTheDiscount:
    """La parte crítica: la alerta del 10% se mide contra el precio acordado."""

    def enroll(self, bootcamper, program, discount):
        return Enrollment.objects.create(
            bootcamper=bootcamper, bootcamp=program,
            start_date=program.start_date,
            discount_percentage=discount,
            agreed_price=apply_discount(program.total_cost, discount),
        )

    def pay(self, bootcamper, program, amount):
        return Payment.objects.create(
            bootcamper=bootcamper, program=program,
            receipt_file='receipts/t.jpg', receipt_file_type='image',
            status=Payment.Status.APPROVED, confirmed_amount=amount,
        )

    def test_summary_uses_the_agreed_price(self, db, converted_bootcamper, program):
        self.enroll(converted_bootcamper, program, Decimal('50'))

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['total_cost'] == apply_discount(program.total_cost, Decimal('50'))
        assert summary['program_cost'] == program.total_cost
        assert summary['discount_percentage'] == Decimal('50.00')

    def test_paying_the_discounted_price_leaves_no_deficit(self, db, converted_bootcamper, program):
        """Antes esto quedaba en crítico: se exigía el precio completo."""
        self.enroll(converted_bootcamper, program, Decimal('50'))
        self.pay(converted_bootcamper, program, apply_discount(program.total_cost, Decimal('50')))

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['deficit'] == Decimal('0.00')
        assert summary['is_critical'] is False
        assert summary['payment_percentage'] == 100.0

    def test_a_full_discount_is_never_critical(self, db, converted_bootcamper, program):
        """Con 100% no debe cobrarse nada, ni dividirse por cero."""
        self.enroll(converted_bootcamper, program, Decimal('100'))

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['total_cost'] == Decimal('0.00')
        assert summary['deficit'] == Decimal('0.00')
        assert summary['is_critical'] is False
        assert summary['payment_percentage'] == 0.0

    def test_without_enrollment_it_falls_back_to_the_program_cost(
        self, db, converted_bootcamper, program
    ):
        """Hay pagos sin inscripción; quedarse sin denominador rompería todo."""
        self.pay(converted_bootcamper, program, Decimal('100.00'))

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['total_cost'] == program.total_cost
        assert summary['discount_percentage'] == Decimal('0.00')

    def test_zero_discount_behaves_exactly_as_before(self, db, converted_bootcamper, program):
        """Los datos existentes quedan en 0: el comportamiento no cambia."""
        self.enroll(converted_bootcamper, program, Decimal('0'))
        self.pay(converted_bootcamper, program, Decimal('100.00'))

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['total_cost'] == program.total_cost
        assert summary['deficit'] == program.total_cost - Decimal('100.00')

    def test_bulk_monitoring_also_uses_the_agreed_price(self, db, converted_bootcamper, program):
        """El camino masivo no puede quedarse leyendo el precio del programa."""
        self.enroll(converted_bootcamper, program, Decimal('25'))
        self.pay(converted_bootcamper, program, Decimal('50.00'))

        rows = PaymentProgressService().get_monitoring_summaries([program])
        row = next(r for r in rows if r['bootcamper_id'] == str(converted_bootcamper.id))
        assert row['total_cost'] == apply_discount(program.total_cost, Decimal('25'))
        assert row['discount_percentage'] == Decimal('25.00')

    def test_bootcamper_summaries_also_use_the_agreed_price(self, db, converted_bootcamper, program):
        self.enroll(converted_bootcamper, program, Decimal('25'))

        rows = PaymentProgressService().get_bootcamper_summaries([converted_bootcamper])
        row = next(r for r in rows if r['program_id'] == str(program.id))
        assert row['total_cost'] == apply_discount(program.total_cost, Decimal('25'))
