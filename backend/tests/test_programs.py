"""Tests for programs endpoints."""

import datetime

from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.programs.models import Cohort

PROGRAMS_URL = "/api/programs/"


def cohorts_url(program):
    return f"/api/programs/{program.id}/cohorts/"


def cohort_url(program, cohort):
    return f"/api/programs/{program.id}/cohorts/{cohort.id}/"


def first_of_this_month():
    return datetime.date.today().replace(day=1)


def make_cohort(program, number=1, start_month=None, end_month=None, status=Cohort.Status.UPCOMING):
    start = start_month or first_of_this_month()
    return Cohort.objects.create(
        program=program,
        number=number,
        start_month=start,
        end_month=end_month or (start + datetime.timedelta(days=90)).replace(day=1),
        status=status,
    )


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


class TestProgramList:
    def test_admin_can_list_programs(self, db, admin_user, program):
        client = make_client(admin_user)
        resp = client.get(PROGRAMS_URL)
        assert resp.status_code == 200
        assert any(p["name"] == program.name for p in resp.json())

    def test_salesperson_can_list_programs(self, db, salesperson_user, program):
        """Salesperson must be able to read programs (needed to assign payments)."""
        client = make_client(salesperson_user)
        resp = client.get(PROGRAMS_URL)
        assert resp.status_code == 200
        assert any(p["name"] == program.name for p in resp.json())

    def test_bootcamper_cannot_list_programs(self, db, bootcamper_user):
        client = make_client(bootcamper_user)
        resp = client.get(PROGRAMS_URL)
        assert resp.status_code == 403

    def test_unauthenticated_cannot_list_programs(self, db):
        client = APIClient()
        resp = client.get(PROGRAMS_URL)
        assert resp.status_code == 401


class TestProgramCreate:
    def test_admin_can_create_program(self, db, admin_user):
        import datetime
        client = make_client(admin_user)
        resp = client.post(
            PROGRAMS_URL,
            {
                "name": "Data Science Nuevo",
                "start_date": str(datetime.date.today()),
                "end_date": str(datetime.date.today() + datetime.timedelta(days=90)),
                "total_cost": "1500.00",
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_salesperson_cannot_create_program(self, db, salesperson_user):
        """POST must be admin-only; salesperson gets 403."""
        import datetime
        client = make_client(salesperson_user)
        resp = client.post(
            PROGRAMS_URL,
            {
                "name": "Intento Vendedor",
                "start_date": str(datetime.date.today()),
                "end_date": str(datetime.date.today() + datetime.timedelta(days=90)),
                "total_cost": "999.00",
            },
            format="json",
        )
        assert resp.status_code == 403


class TestCohortPermissions:
    def test_unauthenticated_rejected(self, db, program):
        assert APIClient().get(cohorts_url(program)).status_code == 401

    def test_bootcamper_rejected(self, db, bootcamper_user, program):
        resp = make_client(bootcamper_user).get(cohorts_url(program))
        assert resp.status_code == 403

    def test_salesperson_can_list(self, db, salesperson_user, program):
        make_cohort(program)
        resp = make_client(salesperson_user).get(cohorts_url(program))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_salesperson_cannot_create(self, db, salesperson_user, program):
        resp = make_client(salesperson_user).post(
            cohorts_url(program),
            {"number": 1, "start_month": str(first_of_this_month()), "end_month": "2027-01-01"},
            format="json",
        )
        assert resp.status_code == 403

    def test_salesperson_cannot_edit(self, db, salesperson_user, program):
        cohort = make_cohort(program)
        resp = make_client(salesperson_user).patch(
            cohort_url(program, cohort), {"number": 9}, format="json",
        )
        assert resp.status_code == 403

    def test_salesperson_cannot_delete(self, db, salesperson_user, program):
        cohort = make_cohort(program)
        resp = make_client(salesperson_user).delete(cohort_url(program, cohort))
        assert resp.status_code == 403


class TestCohortCreate:
    def test_admin_creates_cohort_defaulting_to_upcoming(self, db, admin_user, program):
        resp = make_client(admin_user).post(
            cohorts_url(program),
            {"number": 1, "start_month": str(first_of_this_month()), "end_month": "2027-01-01"},
            format="json",
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == Cohort.Status.UPCOMING
        assert body["status_label"] == "Próximamente"
        # end_month arranca como fin previsto, tal cual se mandó.
        assert body["end_month"] == "2027-01-01"


    def test_start_month_is_required(self, db, admin_user, program):
        resp = make_client(admin_user).post(
            cohorts_url(program), {"number": 1}, format="json",
        )
        assert resp.status_code == 400
        assert "start_month" in resp.json()

    def test_any_day_is_normalised_to_the_first(self, db, admin_user, program):
        """El dominio es el mes: el día que manden es irrelevante."""
        resp = make_client(admin_user).post(
            cohorts_url(program),
            {"number": 1, "start_month": "2026-09-17", "end_month": "2027-02-20"},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.json()["start_month"] == "2026-09-01"

    def test_number_must_be_unique_within_the_program(self, db, admin_user, program):
        make_cohort(program, number=1)
        resp = make_client(admin_user).post(
            cohorts_url(program),
            {"number": 1, "start_month": str(first_of_this_month()), "end_month": "2027-01-01"},
            format="json",
        )
        assert resp.status_code == 400
        assert "number" in resp.json()

    def test_same_number_allowed_in_another_program(self, db, admin_user, program):
        from apps.programs.models import Program
        other = Program.objects.create(
            name="Otro programa",
            start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=90),
            total_cost="1000.00",
        )
        make_cohort(program, number=1)

        resp = make_client(admin_user).post(
            cohorts_url(other),
            {"number": 1, "start_month": str(first_of_this_month()), "end_month": "2027-01-01"},
            format="json",
        )
        assert resp.status_code == 201

    def test_number_zero_rejected(self, db, admin_user, program):
        resp = make_client(admin_user).post(
            cohorts_url(program),
            {"number": 0, "start_month": str(first_of_this_month()), "end_month": "2027-01-01"},
            format="json",
        )
        assert resp.status_code == 400

    def test_end_month_is_required(self, db, admin_user, program):
        """Sin fin previsto el cálculo de tiempo transcurrido no tendría rango."""
        resp = make_client(admin_user).post(
            cohorts_url(program),
            {"number": 1, "start_month": str(first_of_this_month())},
            format="json",
        )
        assert resp.status_code == 400
        assert "end_month" in resp.json()

    def test_end_month_before_start_is_rejected(self, db, admin_user, program):
        resp = make_client(admin_user).post(
            cohorts_url(program),
            {"number": 1, "start_month": "2026-09-01", "end_month": "2026-08-01"},
            format="json",
        )
        assert resp.status_code == 400
        assert "end_month" in resp.json()

    def test_creating_an_already_finished_cohort_keeps_the_typed_month(self, db, admin_user, program):
        """Registrar una edición histórica no debe resellarse con el mes actual."""
        resp = make_client(admin_user).post(
            cohorts_url(program),
            {
                "number": 1,
                "start_month": "2026-01-01",
                "end_month": "2026-05-01",
                "status": Cohort.Status.FINISHED,
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.json()["end_month"] == "2026-05-01"


class TestCohortFinish:
    def test_finishing_reseals_a_planned_end_that_was_wrong(self, db, admin_user, program):
        """El previsto era enero de 2027; se cierra hoy y debe quedar hoy."""
        cohort = make_cohort(
            program,
            start_month=first_of_this_month() - datetime.timedelta(days=60),
            end_month=datetime.date(2027, 1, 1),
            status=Cohort.Status.IN_PROGRESS,
        )

        resp = make_client(admin_user).patch(
            cohort_url(program, cohort),
            {"status": Cohort.Status.FINISHED},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["end_month"] == str(first_of_this_month())

    def test_marking_finished_seals_the_current_month(self, db, admin_user, program):
        cohort = make_cohort(program, status=Cohort.Status.IN_PROGRESS)
        resp = make_client(admin_user).patch(
            cohort_url(program, cohort),
            {"status": Cohort.Status.FINISHED},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["end_month"] == str(first_of_this_month())

    def test_reopening_keeps_the_month_as_planned_end(self, db, admin_user, program):
        """Vaciarlo dejaría a los pagos sin rango; vuelve a leerse como previsión."""
        cohort = make_cohort(program, status=Cohort.Status.IN_PROGRESS)
        client = make_client(admin_user)
        client.patch(cohort_url(program, cohort), {"status": Cohort.Status.FINISHED}, format="json")

        resp = client.patch(
            cohort_url(program, cohort),
            {"status": Cohort.Status.IN_PROGRESS},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["end_month"] == str(first_of_this_month())

    def test_editing_a_finished_cohort_keeps_its_end_month(self, db, admin_user, program):
        """Corregir otro campo no debe mover la fecha de cierre ya sellada."""
        cohort = make_cohort(
            program,
            start_month=datetime.date(2026, 1, 1),
            end_month=datetime.date(2026, 3, 1),
            status=Cohort.Status.FINISHED,
        )

        resp = make_client(admin_user).patch(
            cohort_url(program, cohort), {"number": 7}, format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["end_month"] == "2026-03-01"
        assert resp.json()["number"] == 7

    def test_status_transitions_are_manual(self, db, admin_user, program):
        """Una cohorte cuyo mes ya pasó sigue en próximamente hasta que la muevan."""
        cohort = make_cohort(
            program,
            start_month=first_of_this_month() - datetime.timedelta(days=120),
            status=Cohort.Status.UPCOMING,
        )
        resp = make_client(admin_user).get(cohort_url(program, cohort))
        assert resp.json()["status"] == Cohort.Status.UPCOMING


class TestCohortListing:
    def test_filter_by_status(self, db, admin_user, program):
        make_cohort(program, number=1, status=Cohort.Status.FINISHED)
        make_cohort(program, number=2, status=Cohort.Status.IN_PROGRESS)
        make_cohort(program, number=3, status=Cohort.Status.UPCOMING)

        resp = make_client(admin_user).get(
            cohorts_url(program), {"status": Cohort.Status.IN_PROGRESS},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["number"] == 2

    def test_unknown_status_returns_empty(self, db, admin_user, program):
        make_cohort(program)
        resp = make_client(admin_user).get(cohorts_url(program), {"status": "INVENTADO"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_cohorts_of_another_program_are_not_listed(self, db, admin_user, program):
        from apps.programs.models import Program
        other = Program.objects.create(
            name="Ajeno",
            start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=90),
            total_cost="1000.00",
        )
        make_cohort(program, number=1)
        make_cohort(other, number=1)

        resp = make_client(admin_user).get(cohorts_url(other))
        assert len(resp.json()) == 1
        assert resp.json()[0]["program"] == str(other.id)

    def test_program_list_includes_cohort_count(self, db, admin_user, program):
        make_cohort(program, number=1)
        make_cohort(program, number=2)

        resp = make_client(admin_user).get(PROGRAMS_URL)
        row = next(p for p in resp.json() if p["id"] == str(program.id))
        assert row["cohort_count"] == 2

    def test_delete_removes_the_cohort(self, db, admin_user, program):
        cohort = make_cohort(program)
        resp = make_client(admin_user).delete(cohort_url(program, cohort))
        assert resp.status_code == 204
        assert not Cohort.objects.filter(pk=cohort.pk).exists()

    def test_cohort_of_a_different_program_is_404(self, db, admin_user, program):
        from apps.programs.models import Program
        other = Program.objects.create(
            name="Ajeno 2",
            start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=90),
            total_cost="1000.00",
        )
        cohort = make_cohort(other, number=1)

        resp = make_client(admin_user).get(cohort_url(program, cohort))
        assert resp.status_code == 404
