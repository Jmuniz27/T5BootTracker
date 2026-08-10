"""Asignar y cambiar la cohorte de un bootcamper desde Usuarios (CB-347).

Antes de esto la cohorte sólo se fijaba una vez, en la conversión — no había
forma de completarla si el programa no tenía cohortes creadas todavía, ni de
corregirla si se asignó mal.
"""
import datetime

import pytest
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.test import APIClient

from apps.authentication.models import CustomUser
from apps.leads.models import Interaction, Lead
from apps.programs.models import Cohort, Enrollment, Program


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def make_cohort(program, number=1, status=Cohort.Status.UPCOMING, start_month=None):
    start = start_month or datetime.date.today().replace(day=1)
    return Cohort.objects.create(
        program=program,
        number=number,
        start_month=start,
        end_month=(start + datetime.timedelta(days=120)).replace(day=1),
        status=status,
    )


def enrollment_url(bootcamper, enrollment):
    return f'/api/users/{bootcamper.id}/enrollments/{enrollment.id}/'


@pytest.fixture
def coordinator_user(db):
    return CustomUser.objects.create_user(
        email='coordinador@test.com', password='testpass123',
        first_name='Coordi', last_name='Nador', role=CustomUser.Role.COORDINATOR,
    )


@pytest.fixture
def enrolled_bootcamper(db, program):
    bootcamper = CustomUser.objects.create_user(
        email='matriculado@test.com', password='testpass123',
        first_name='Mati', last_name='Culado', role=CustomUser.Role.BOOTCAMPER,
    )
    enrollment = Enrollment.objects.create(
        bootcamper=bootcamper, bootcamp=program, status=Enrollment.Status.ACTIVE,
        start_date=program.start_date, agreed_price=program.total_cost,
    )
    return bootcamper, enrollment


class TestEnrollmentCohortPermissions:
    def test_salesperson_can_change_it(self, db, salesperson_user, enrolled_bootcamper, program):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)

        resp = make_client(salesperson_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 200

    def test_finance_can_change_it(self, db, finance_user, enrolled_bootcamper, program):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)

        resp = make_client(finance_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 200

    def test_admin_can_change_it(self, db, admin_user, enrolled_bootcamper, program):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 200

    def test_coordinator_is_forbidden(self, db, coordinator_user, enrolled_bootcamper, program):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)

        resp = make_client(coordinator_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 403

    def test_bootcamper_is_forbidden(self, db, enrolled_bootcamper, program):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)

        resp = make_client(bootcamper).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 403

    def test_unauthenticated_is_rejected(self, db, enrolled_bootcamper, program):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)

        resp = APIClient().patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 401


class TestEnrollmentCohortAssignment:
    def test_assigns_a_cohort_to_an_enrollment_without_one(
        self, db, admin_user, enrolled_bootcamper, program,
    ):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program, status=Cohort.Status.IN_PROGRESS)

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 200

        enrollment.refresh_from_db()
        assert enrollment.cohort_id == cohort.id

    def test_changes_from_one_cohort_to_another(self, db, admin_user, program, enrolled_bootcamper):
        bootcamper, enrollment = enrolled_bootcamper
        first = make_cohort(program, number=1)
        enrollment.cohort = first
        enrollment.save(update_fields=['cohort'])
        second = make_cohort(program, number=2)

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(second.id)}, format='json',
        )
        assert resp.status_code == 200

        enrollment.refresh_from_db()
        assert enrollment.cohort_id == second.id

    def test_can_clear_the_cohort(self, db, admin_user, program, enrolled_bootcamper):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)
        enrollment.cohort = cohort
        enrollment.save(update_fields=['cohort'])

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': None}, format='json',
        )
        assert resp.status_code == 200

        enrollment.refresh_from_db()
        assert enrollment.cohort_id is None

    def test_cohort_from_another_program_is_rejected(
        self, db, admin_user, program, enrolled_bootcamper,
    ):
        bootcamper, enrollment = enrolled_bootcamper
        other = Program.objects.create(
            name='Otro programa',
            start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=90),
            total_cost='1000.00',
        )
        foreign = make_cohort(other)

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(foreign.id)}, format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'COHORT_PROGRAM_MISMATCH'

        enrollment.refresh_from_db()
        assert enrollment.cohort_id is None

    def test_finished_cohort_is_rejected(self, db, admin_user, program, enrolled_bootcamper):
        bootcamper, enrollment = enrolled_bootcamper
        finished = make_cohort(program, status=Cohort.Status.FINISHED)

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(finished.id)}, format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'COHORT_NOT_ASSIGNABLE'

    def test_unknown_cohort_is_404(self, db, admin_user, enrolled_bootcamper):
        import uuid
        bootcamper, enrollment = enrolled_bootcamper

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(uuid.uuid4())}, format='json',
        )
        assert resp.status_code == 404
        assert resp.json()['code'] == 'COHORT_NOT_FOUND'

    def test_unknown_enrollment_is_404(self, db, admin_user, bootcamper_user):
        import uuid
        resp = make_client(admin_user).patch(
            f'/api/users/{bootcamper_user.id}/enrollments/{uuid.uuid4()}/',
            {'cohort_id': None}, format='json',
        )
        assert resp.status_code == 404
        assert resp.json()['code'] == 'ENROLLMENT_NOT_FOUND'

    def test_enrollment_of_a_different_bootcamper_is_404(
        self, db, admin_user, enrolled_bootcamper, bootcamper_user,
    ):
        """El id de la inscripción tiene que ser de ESE bootcamper, no de cualquiera."""
        _, enrollment = enrolled_bootcamper

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper_user, enrollment), {'cohort_id': None}, format='json',
        )
        assert resp.status_code == 404
        assert resp.json()['code'] == 'ENROLLMENT_NOT_FOUND'

    def test_setting_the_same_cohort_already_taken_elsewhere_conflicts(
        self, db, admin_user, program, enrolled_bootcamper,
    ):
        """CB-346: la unicidad ahora es por cohorte — moverse a una ya ocupada
        por otra inscripción del mismo bootcamper en el mismo programa sigue
        prohibido."""
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program, number=1)

        # Segunda inscripción del mismo bootcamper al mismo programa, ya en esa cohorte
        # (posible sólo tras CB-346, cuando el par bootcamper/programa deja de ser único).
        Enrollment.objects.filter(pk=enrollment.pk).update(cohort=None)
        other_program_enrollment = Enrollment.objects.create(
            bootcamper=bootcamper, bootcamp=program, cohort=cohort,
            status=Enrollment.Status.ACTIVE,
            start_date=program.start_date, agreed_price=program.total_cost,
        )

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'ALREADY_ENROLLED'

        # limpieza defensiva por si el test se reordena; no afecta la aserción
        assert other_program_enrollment.cohort_id == cohort.id


class TestEnrollmentCohortAudit:
    """El admin debe poder ver el cambio aunque no lo haya hecho — CB-347."""

    def test_change_is_recorded_on_the_lead_history(
        self, db, salesperson_user, program, enrolled_bootcamper,
    ):
        bootcamper, enrollment = enrolled_bootcamper
        lead = Lead.objects.create(
            name='Mati Culado', phone='0990001111', email=bootcamper.email,
            status=Lead.Status.CONVERTED, owner=salesperson_user,
            bootcamper=bootcamper, program=program,
        )
        cohort = make_cohort(program, status=Cohort.Status.IN_PROGRESS)

        make_client(salesperson_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )

        record = Interaction.objects.get(lead=lead, outcome=Interaction.Outcome.COHORT_CHANGED)
        assert record.interaction_type == Interaction.InteractionType.SYSTEM
        assert record.salesperson == salesperson_user
        assert str(cohort.number) in record.notes

    def test_change_without_a_matching_lead_does_not_fail(
        self, db, admin_user, program, enrolled_bootcamper,
    ):
        """Datos migrados a mano pueden no tener un lead detrás — el cambio igual se aplica."""
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program)

        resp = make_client(admin_user).patch(
            enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json',
        )
        assert resp.status_code == 200
        enrollment.refresh_from_db()
        assert enrollment.cohort_id == cohort.id

    def test_no_op_change_does_not_duplicate_the_record(
        self, db, salesperson_user, program, enrolled_bootcamper,
    ):
        bootcamper, enrollment = enrolled_bootcamper
        cohort = make_cohort(program, status=Cohort.Status.IN_PROGRESS)
        enrollment.cohort = cohort
        enrollment.save(update_fields=['cohort'])
        lead = Lead.objects.create(
            name='Mati Culado', phone='0990001111', email=bootcamper.email,
            status=Lead.Status.CONVERTED, owner=salesperson_user,
            bootcamper=bootcamper, program=program,
        )

        client = make_client(salesperson_user)
        client.patch(enrollment_url(bootcamper, enrollment), {'cohort_id': str(cohort.id)}, format='json')

        assert not Interaction.objects.filter(lead=lead, outcome=Interaction.Outcome.COHORT_CHANGED).exists()
