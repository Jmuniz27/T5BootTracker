"""Historial de solicitudes de pago, y reparto del pool por el Administrador."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.payments.models import Payment

HISTORY_URL = '/api/payments/history/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def assign_url(bootcamper):
    return f'/api/payments/bootcampers/{bootcamper.id}/assign/'


def release_url(bootcamper):
    return f'/api/payments/bootcampers/{bootcamper.id}/release/'


@pytest.fixture
def finance_user(db):
    return CustomUser.objects.create_user(
        email='finanzas.uno@test.com', password='testpass123',
        first_name='Finanzas', last_name='Uno', role=CustomUser.Role.FINANCE,
    )


@pytest.fixture
def other_finance_user(db):
    return CustomUser.objects.create_user(
        email='finanzas.dos@test.com', password='testpass123',
        first_name='Finanzas', last_name='Dos', role=CustomUser.Role.FINANCE,
    )


def pay(bootcamper, program, status_value, amount=None, **extra):
    return Payment.objects.create(
        bootcamper=bootcamper, program=program,
        receipt_file='receipts/t.jpg', receipt_file_type='image',
        status=status_value, confirmed_amount=amount, **extra
    )


class TestHistoryPermissions:
    def test_unauthenticated_rejected(self, db):
        assert APIClient().get(HISTORY_URL).status_code == 401

    def test_salesperson_rejected(self, db, salesperson_user, converted_bootcamper):
        resp = make_client(salesperson_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        )
        assert resp.status_code == 403

    def test_bootcamper_rejected(self, db, bootcamper_user):
        """El bootcamper tiene su propio /my-history/; este endpoint no es suyo."""
        resp = make_client(bootcamper_user).get(
            HISTORY_URL, {'bootcamper_id': str(bootcamper_user.id)},
        )
        assert resp.status_code == 403

    def test_finance_allowed(self, db, finance_user, converted_bootcamper):
        resp = make_client(finance_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        )
        assert resp.status_code == 200

    def test_admin_allowed(self, db, admin_user, converted_bootcamper):
        resp = make_client(admin_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        )
        assert resp.status_code == 200

    @pytest.mark.parametrize('method', ['post', 'put', 'patch', 'delete'])
    def test_no_write_methods(self, db, admin_user, method):
        resp = getattr(make_client(admin_user), method)(HISTORY_URL)
        assert resp.status_code == 405


class TestHistoryContent:
    def test_bootcamper_id_is_required(self, db, admin_user):
        resp = make_client(admin_user).get(HISTORY_URL)
        assert resp.status_code == 400
        assert resp.json()['code'] == 'BOOTCAMPER_ID_REQUIRED'

    def test_includes_approved_and_rejected_but_not_pending(
        self, db, admin_user, converted_bootcamper, program
    ):
        """El historial son las solicitudes YA revisadas; los pendientes viven
        sólo en la cola, no acá."""
        pay(converted_bootcamper, program, Payment.Status.APPROVED, Decimal('200.00'))
        pay(converted_bootcamper, program, Payment.Status.REJECTED,
            rejection_reason='El comprobante no es legible.')
        pay(converted_bootcamper, program, Payment.Status.PENDING)

        rows = make_client(admin_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        ).json()

        assert {row['status'] for row in rows} == {'APPROVED', 'REJECTED'}

    def test_shows_the_rejection_reason(self, db, admin_user, converted_bootcamper, program):
        """Sin esto, tras revisar se perdía el motivo del rechazo."""
        pay(converted_bootcamper, program, Payment.Status.REJECTED,
            rejection_reason='Monto distinto al acordado.')

        rows = make_client(admin_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        ).json()

        assert rows[0]['rejection_reason'] == 'Monto distinto al acordado.'

    def test_shows_who_validated(self, db, admin_user, finance_user, converted_bootcamper, program):
        from django.utils.timezone import now

        pay(converted_bootcamper, program, Payment.Status.APPROVED, Decimal('100.00'),
            validated_by=finance_user, validated_at=now())

        rows = make_client(admin_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        ).json()

        assert rows[0]['validated_by_name'] == finance_user.get_full_name()
        assert rows[0]['validated_at'] is not None

    def test_newest_first(self, db, admin_user, converted_bootcamper, program):
        viejo = pay(converted_bootcamper, program, Payment.Status.APPROVED, Decimal('50.00'))
        nuevo = pay(converted_bootcamper, program, Payment.Status.REJECTED)

        rows = make_client(admin_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        ).json()

        assert [row['id'] for row in rows] == [str(nuevo.id), str(viejo.id)]

    def test_filters_by_status(self, db, admin_user, converted_bootcamper, program):
        pay(converted_bootcamper, program, Payment.Status.APPROVED, Decimal('10.00'))
        pay(converted_bootcamper, program, Payment.Status.REJECTED)

        rows = make_client(admin_user).get(HISTORY_URL, {
            'bootcamper_id': str(converted_bootcamper.id), 'status': 'REJECTED',
        }).json()

        assert len(rows) == 1
        assert rows[0]['status'] == 'REJECTED'

    def test_unknown_status_returns_empty(self, db, admin_user, converted_bootcamper, program):
        pay(converted_bootcamper, program, Payment.Status.APPROVED, Decimal('10.00'))

        rows = make_client(admin_user).get(HISTORY_URL, {
            'bootcamper_id': str(converted_bootcamper.id), 'status': 'INVENTADO',
        }).json()

        assert rows == []

    def test_other_bootcampers_are_not_listed(self, db, admin_user, converted_bootcamper, program):
        otro = CustomUser.objects.create_user(
            email='otro.boot@test.com', password='testpass123',
            first_name='Otro', last_name='Boot', role=CustomUser.Role.BOOTCAMPER,
        )
        pay(converted_bootcamper, program, Payment.Status.APPROVED, Decimal('10.00'))
        pay(otro, program, Payment.Status.APPROVED, Decimal('99.00'))

        rows = make_client(admin_user).get(
            HISTORY_URL, {'bootcamper_id': str(converted_bootcamper.id)},
        ).json()

        assert len(rows) == 1
        assert rows[0]['bootcamper'] == str(converted_bootcamper.id)


class TestAdminAssignsPool:
    """El admin veía el aviso de "N sin responsable" y no podía hacer nada."""

    def test_admin_assigns_to_a_finance_person(
        self, db, admin_user, finance_user, converted_bootcamper
    ):
        resp = make_client(admin_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': str(finance_user.id)},
            format='json',
        )
        assert resp.status_code == 200

        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id == finance_user.id
        assert converted_bootcamper.finance_assigned_at is not None

    def test_admin_must_say_to_whom(self, db, admin_user, converted_bootcamper):
        """El admin no tiene cartera: asignárselo a sí mismo no querría decir nada."""
        resp = make_client(admin_user).patch(
            assign_url(converted_bootcamper), {}, format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'FINANCE_OWNER_REQUIRED'

    def test_target_must_be_finance(self, db, admin_user, salesperson_user, converted_bootcamper):
        resp = make_client(admin_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': str(salesperson_user.id)},
            format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'INVALID_FINANCE_OWNER'

    def test_target_must_be_active(self, db, admin_user, finance_user, converted_bootcamper):
        """Asignar a una cuenta dada de baja deja al bootcamper sin seguimiento."""
        finance_user.is_active = False
        finance_user.save(update_fields=['is_active'])

        resp = make_client(admin_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': str(finance_user.id)},
            format='json',
        )
        assert resp.status_code == 400

    def test_garbage_id_is_a_400_not_a_500(self, db, admin_user, converted_bootcamper):
        resp = make_client(admin_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': 'no-es-un-uuid'},
            format='json',
        )
        assert resp.status_code == 400

    def test_already_assigned_is_a_conflict(
        self, db, admin_user, finance_user, other_finance_user, converted_bootcamper
    ):
        converted_bootcamper.finance_owner = other_finance_user
        converted_bootcamper.save(update_fields=['finance_owner'])

        resp = make_client(admin_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': str(finance_user.id)},
            format='json',
        )
        assert resp.status_code == 409

    def test_finance_still_self_assigns_ignoring_the_body(
        self, db, finance_user, other_finance_user, converted_bootcamper
    ):
        """No cambia el uso de Finanzas: se lo asigna a sí misma."""
        resp = make_client(finance_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': str(other_finance_user.id)},
            format='json',
        )
        assert resp.status_code == 200

        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id == finance_user.id

    def test_salesperson_cannot_assign(self, db, salesperson_user, finance_user, converted_bootcamper):
        resp = make_client(salesperson_user).patch(
            assign_url(converted_bootcamper),
            {'finance_owner_id': str(finance_user.id)},
            format='json',
        )
        assert resp.status_code == 403


class TestAdminReleasesPool:
    def test_admin_can_release_anyone(
        self, db, admin_user, finance_user, converted_bootcamper
    ):
        """Si el admin reparte y se equivoca, tiene que poder corregirlo."""
        converted_bootcamper.finance_owner = finance_user
        converted_bootcamper.save(update_fields=['finance_owner'])

        resp = make_client(admin_user).patch(release_url(converted_bootcamper))
        assert resp.status_code == 200

        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id is None
        assert converted_bootcamper.finance_assigned_at is None

    def test_finance_cannot_release_someone_elses(
        self, db, finance_user, other_finance_user, converted_bootcamper
    ):
        converted_bootcamper.finance_owner = other_finance_user
        converted_bootcamper.save(update_fields=['finance_owner'])

        resp = make_client(finance_user).patch(release_url(converted_bootcamper))
        assert resp.status_code == 403
        assert resp.json()['code'] == 'NOT_OWNER'


class TestFullyPaidAndCohort:
    """Separar "en cobro" de "pagos finalizados", y saber de qué cohorte se cobra."""

    def test_is_fully_paid_is_false_while_something_is_owed(
        self, db, admin_user, converted_bootcamper, program
    ):
        from apps.payments.services import PaymentProgressService

        pay(converted_bootcamper, program, Payment.Status.APPROVED, Decimal('100.00'))

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['is_fully_paid'] is False

    def test_is_fully_paid_flips_when_the_debt_is_cleared(
        self, db, converted_bootcamper, program
    ):
        from apps.payments.services import PaymentProgressService

        pay(converted_bootcamper, program, Payment.Status.APPROVED, program.total_cost)

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['is_fully_paid'] is True
        assert summary['deficit'] == Decimal('0.00')

    def test_payment_status_is_untouched(self, db, converted_bootcamper, program):
        """La bandera es aparte: `payment_status` lo consume el filtro `?status=`."""
        from apps.payments.services import PaymentProgressService

        pay(converted_bootcamper, program, Payment.Status.APPROVED, program.total_cost)

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['payment_status'] in ('ON_TRACK', 'AT_RISK', 'CRITICAL')

    def test_summary_carries_the_cohort(self, db, converted_bootcamper, program):
        """`Payment` apunta al programa: la cohorte sólo puede salir de la inscripción."""
        import datetime

        from apps.programs.models import Cohort, Enrollment
        from apps.payments.services import PaymentProgressService

        start = datetime.date.today().replace(day=1)
        cohort = Cohort.objects.create(
            program=program, number=7, start_month=start,
            end_month=(start + datetime.timedelta(days=90)).replace(day=1),
            status=Cohort.Status.IN_PROGRESS,
        )
        Enrollment.objects.create(
            bootcamper=converted_bootcamper, bootcamp=program, cohort=cohort,
            start_date=start, agreed_price=program.total_cost,
        )

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['cohort_number'] == 7
        assert summary['cohort_id'] == str(cohort.id)

    def test_cohort_is_none_without_enrollment(self, db, converted_bootcamper, program):
        """Hay pagos sin inscripción (datos viejos): no debe reventar."""
        from apps.payments.services import PaymentProgressService

        summary = PaymentProgressService().get_payment_summary(
            str(converted_bootcamper.id), str(program.id),
        )
        assert summary['cohort_id'] is None
        assert summary['cohort_number'] is None
