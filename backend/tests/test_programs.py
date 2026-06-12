"""Tests for programs endpoints."""

from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

PROGRAMS_URL = "/api/programs/"


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
