"""La conversión inscribe en una cohorte, y sólo si admite inscripciones."""
import datetime

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.programs.models import Cohort, Enrollment, Program
from apps.programs.services import resolve_assignable_cohort

CEDULA = '1713175071'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


def convert_url(lead):
    return f'/api/leads/{lead.id}/convert/'


def make_cohort(program, number=1, status=Cohort.Status.UPCOMING, start_month=None):
    start = start_month or datetime.date.today().replace(day=1)
    return Cohort.objects.create(
        program=program,
        number=number,
        start_month=start,
        end_month=(start + datetime.timedelta(days=120)).replace(day=1),
        status=status,
    )


def payload(program, **extra):
    return {'cedula': CEDULA, 'program_id': str(program.id), **extra}


class TestResolveAssignableCohort:
    """La regla, sin pasar por HTTP."""

    def test_none_when_not_requested(self, db, program):
        assert resolve_assignable_cohort(program, None) is None

    @pytest.mark.parametrize('status', [Cohort.Status.UPCOMING, Cohort.Status.IN_PROGRESS])
    def test_upcoming_and_in_progress_are_assignable(self, db, program, status):
        cohort = make_cohort(program, status=status)
        assert resolve_assignable_cohort(program, cohort.id) == cohort

    def test_finished_is_rejected(self, db, program):
        """Inscribir en una edición cerrada deja a alguien que nunca va a cursar."""
        cohort = make_cohort(program, status=Cohort.Status.FINISHED)

        with pytest.raises(Exception) as exc:
            resolve_assignable_cohort(program, cohort.id)
        assert 'COHORT_NOT_ASSIGNABLE' in str(exc.value)

    def test_cohort_of_another_program_is_rejected(self, db, program):
        """Una cohorte 1 existe en varios programas: el id suelto no basta."""
        other = Program.objects.create(
            name='Otro programa',
            start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=90),
            total_cost='1000.00',
        )
        foreign = make_cohort(other, number=1)

        with pytest.raises(Exception) as exc:
            resolve_assignable_cohort(program, foreign.id)
        assert 'COHORT_PROGRAM_MISMATCH' in str(exc.value)

    def test_unknown_cohort_is_not_found(self, db, program):
        import uuid
        with pytest.raises(Exception) as exc:
            resolve_assignable_cohort(program, uuid.uuid4())
        assert 'COHORT_NOT_FOUND' in str(exc.value)


class TestConversionWithCohort:
    def test_enrollment_records_the_cohort(self, db, salesperson_user, program, assigned_lead):
        cohort = make_cohort(program, status=Cohort.Status.IN_PROGRESS)

        resp = make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, cohort_id=str(cohort.id), email='con.cohorte@test.com'),
            format='json',
        )
        assert resp.status_code in (200, 201)
        assert resp.json()['cohort_number'] == cohort.number

        enrollment = Enrollment.objects.get(bootcamp=program)
        assert enrollment.cohort_id == cohort.id

    def test_start_date_comes_from_the_cohort(self, db, salesperson_user, program, assigned_lead):
        """El inicio real es el de la edición, no el del programa."""
        month = (datetime.date.today() + datetime.timedelta(days=60)).replace(day=1)
        cohort = make_cohort(program, start_month=month)

        make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, cohort_id=str(cohort.id), email='inicio@test.com'),
            format='json',
        )

        assert Enrollment.objects.get(bootcamp=program).start_date == month

    def test_finished_cohort_is_rejected_over_http(self, db, salesperson_user, program, assigned_lead):
        cohort = make_cohort(program, status=Cohort.Status.FINISHED)

        resp = make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, cohort_id=str(cohort.id), email='cerrada@test.com'),
            format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'COHORT_NOT_ASSIGNABLE'

    def test_nothing_is_created_when_the_cohort_is_invalid(
        self, db, salesperson_user, program, assigned_lead
    ):
        """La validación va antes de crear: no debe quedar nada a medias."""
        from apps.authentication.models import CustomUser

        cohort = make_cohort(program, status=Cohort.Status.FINISHED)
        before = CustomUser.objects.count()

        make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, cohort_id=str(cohort.id), email='nada@test.com'),
            format='json',
        )

        assert CustomUser.objects.count() == before
        assert not Enrollment.objects.filter(bootcamp=program).exists()
        assigned_lead.refresh_from_db()
        assert assigned_lead.status != 'CONVERTED'

    def test_converting_without_a_cohort_still_works(
        self, db, salesperson_user, program, assigned_lead
    ):
        """Hay programas sin cohortes: exigirla bloquearía la conversión."""
        resp = make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, email='sin.cohorte@test.com'),
            format='json',
        )
        assert resp.status_code in (200, 201)
        assert resp.json()['cohort_id'] is None

        enrollment = Enrollment.objects.get(bootcamp=program)
        assert enrollment.cohort_id is None
        # Sin cohorte se conserva el comportamiento anterior.
        assert enrollment.start_date == program.start_date

    def test_unknown_cohort_gives_404(self, db, salesperson_user, program, assigned_lead):
        import uuid
        resp = make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, cohort_id=str(uuid.uuid4()), email='fantasma@test.com'),
            format='json',
        )
        assert resp.status_code == 404
        assert resp.json()['code'] == 'COHORT_NOT_FOUND'

    def test_cohort_from_another_program_gives_400(
        self, db, salesperson_user, program, assigned_lead
    ):
        other = Program.objects.create(
            name='Ajeno',
            start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=90),
            total_cost='1000.00',
        )
        foreign = make_cohort(other, number=1)

        resp = make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, cohort_id=str(foreign.id), email='ajena@test.com'),
            format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'COHORT_PROGRAM_MISMATCH'

    def test_deleting_the_cohort_keeps_the_enrollment(
        self, db, salesperson_user, program, assigned_lead
    ):
        """SET_NULL: borrar una edición no puede borrar a la persona inscrita."""
        cohort = make_cohort(program)
        make_client(salesperson_user).post(
            convert_url(assigned_lead),
            payload(program, cohort_id=str(cohort.id), email='sobrevive@test.com'),
            format='json',
        )

        cohort.delete()

        enrollment = Enrollment.objects.get(bootcamp=program)
        assert enrollment.cohort_id is None
