"""Tests del pool de bootcampers.

Misma mecánica que el pool de leads: al convertirse, un bootcamper queda sin
responsable de cobro y cualquiera de Finanzas puede tomarlo. Estar en el pool
es no tener `finance_owner`, así que la conversión no necesita ningún paso
extra para dejarlo disponible.
"""

from decimal import Decimal

from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import CustomUser
from apps.leads.models import Lead
from apps.payments.models import Payment

POOL_URL    = "/api/payments/bootcampers/"
ASSIGN_URL  = "/api/payments/bootcampers/{id}/assign/"
RELEASE_URL = "/api/payments/bootcampers/{id}/release/"


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def enroll(bootcamper, program):
    from apps.programs.models import Enrollment

    return Enrollment.objects.create(
        bootcamper=bootcamper,
        bootcamp=program,
        start_date=program.start_date,
        agreed_price=program.total_cost,
    )


class TestPoolListing:
    def test_converted_bootcamper_lands_in_the_pool(
        self, db, finance_user, converted_bootcamper, program
    ):
        """Sin pagos todavía: la tarjeta igual tiene que aparecer."""
        enroll(converted_bootcamper, program)

        resp = make_client(finance_user).get(POOL_URL)

        assert resp.status_code == 200
        available = resp.json()["available_bootcampers"]
        assert [c["bootcamper_id"] for c in available] == [str(converted_bootcamper.id)]
        assert Decimal(str(available[0]["total_paid"])) == Decimal("0.00")
        assert available[0]["program_name"] == program.name
        assert resp.json()["my_bootcampers"] == []

    def test_assigned_bootcamper_leaves_the_pool(
        self, db, finance_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)
        converted_bootcamper.finance_owner = finance_user
        converted_bootcamper.save(update_fields=["finance_owner"])

        body = make_client(finance_user).get(POOL_URL).json()

        assert body["available_bootcampers"] == []
        assert [c["bootcamper_id"] for c in body["my_bootcampers"]] == [
            str(converted_bootcamper.id)
        ]

    def test_bootcampers_of_others_are_not_visible(
        self, db, finance_user, other_finance_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)
        converted_bootcamper.finance_owner = other_finance_user
        converted_bootcamper.save(update_fields=["finance_owner"])

        body = make_client(finance_user).get(POOL_URL).json()

        assert body["my_bootcampers"] == []
        assert body["available_bootcampers"] == []

    def test_bootcamper_with_payments_but_no_enrollment_still_shows(
        self, db, finance_user, converted_bootcamper, program
    ):
        """Alta manual o datos previos al pool: sin inscripción, pero con pagos.

        Si sólo mirásemos `Enrollment`, esa gente quedaría invisible para el
        cobro pese a tener plata registrada.
        """
        Payment.objects.create(
            bootcamper=converted_bootcamper,
            program=program,
            receipt_file="receipts/x.jpg",
            receipt_file_type="image",
            status=Payment.Status.APPROVED,
            confirmed_amount=Decimal("100.00"),
        )

        available = make_client(finance_user).get(POOL_URL).json()["available_bootcampers"]

        assert [c["bootcamper_id"] for c in available] == [str(converted_bootcamper.id)]

    def test_pair_is_not_duplicated_when_enrolled_and_paying(
        self, db, finance_user, converted_bootcamper, program
    ):
        """Inscripción y pagos son dos fuentes del mismo par: una sola tarjeta."""
        enroll(converted_bootcamper, program)
        Payment.objects.create(
            bootcamper=converted_bootcamper,
            program=program,
            receipt_file="receipts/x.jpg",
            receipt_file_type="image",
            status=Payment.Status.APPROVED,
            confirmed_amount=Decimal("100.00"),
        )

        available = make_client(finance_user).get(POOL_URL).json()["available_bootcampers"]

        assert len(available) == 1

    def test_pool_reflects_approved_payments(
        self, db, finance_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)
        Payment.objects.create(
            bootcamper=converted_bootcamper,
            program=program,
            receipt_file="receipts/x.jpg",
            receipt_file_type="image",
            status=Payment.Status.APPROVED,
            confirmed_amount=Decimal("400.00"),
        )

        card = make_client(finance_user).get(POOL_URL).json()["available_bootcampers"][0]

        assert Decimal(str(card["total_paid"])) == Decimal("400.00")
        assert card["payment_count"] == 1

    def test_search_and_status_filters(
        self, db, finance_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)
        client = make_client(finance_user)

        assert client.get(f"{POOL_URL}?search=zzzz").json()["available_bootcampers"] == []
        assert len(client.get(f"{POOL_URL}?search=Boot").json()["available_bootcampers"]) == 1
        assert client.get(f"{POOL_URL}?status=ON_TRACK").json()["available_bootcampers"] == []

    def test_admin_sees_the_pool_but_has_no_portfolio(
        self, db, admin_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)

        body = make_client(admin_user).get(POOL_URL).json()

        assert body["my_bootcampers"] == []
        assert len(body["available_bootcampers"]) == 1
        assert body["pagination"]["available_bootcampers_count"] == 1


class TestAssign:
    def test_finance_assigns_from_the_pool(
        self, db, finance_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)

        resp = make_client(finance_user).patch(
            ASSIGN_URL.format(id=converted_bootcamper.id)
        )

        assert resp.status_code == 200
        assert resp.json()[0]["bootcamper_id"] == str(converted_bootcamper.id)
        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner == finance_user
        assert converted_bootcamper.finance_assigned_at is not None

    def test_taken_bootcamper_returns_409(
        self, db, finance_user, other_finance_user, converted_bootcamper, program
    ):
        """La carrera entre dos personas de Finanzas: la segunda pierde."""
        enroll(converted_bootcamper, program)
        converted_bootcamper.finance_owner = other_finance_user
        converted_bootcamper.save(update_fields=["finance_owner"])

        resp = make_client(finance_user).patch(
            ASSIGN_URL.format(id=converted_bootcamper.id)
        )

        assert resp.status_code == 409
        assert resp.json()["code"] == "BOOTCAMPER_ALREADY_ASSIGNED"
        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner == other_finance_user

    def test_assigning_a_non_bootcamper_returns_404(
        self, db, finance_user, salesperson_user
    ):
        resp = make_client(finance_user).patch(
            ASSIGN_URL.format(id=salesperson_user.id)
        )

        assert resp.status_code == 404
        assert resp.json()["code"] == "BOOTCAMPER_NOT_FOUND"


class TestRelease:
    def test_owner_releases_back_to_the_pool(
        self, db, finance_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)
        converted_bootcamper.finance_owner = finance_user
        converted_bootcamper.save(update_fields=["finance_owner"])

        resp = make_client(finance_user).patch(
            RELEASE_URL.format(id=converted_bootcamper.id)
        )

        assert resp.status_code == 200
        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner is None
        assert converted_bootcamper.finance_assigned_at is None

    def test_releasing_someone_elses_bootcamper_is_forbidden(
        self, db, finance_user, other_finance_user, converted_bootcamper, program
    ):
        enroll(converted_bootcamper, program)
        converted_bootcamper.finance_owner = other_finance_user
        converted_bootcamper.save(update_fields=["finance_owner"])

        resp = make_client(finance_user).patch(
            RELEASE_URL.format(id=converted_bootcamper.id)
        )

        assert resp.status_code == 403
        assert resp.json()["code"] == "NOT_OWNER"
        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner == other_finance_user


class TestPoolPermissions:
    def test_salesperson_cannot_touch_the_pool(
        self, db, salesperson_user, converted_bootcamper
    ):
        client = make_client(salesperson_user)

        assert client.get(POOL_URL).status_code == 403
        assert client.patch(ASSIGN_URL.format(id=converted_bootcamper.id)).status_code == 403
        assert client.patch(RELEASE_URL.format(id=converted_bootcamper.id)).status_code == 403

    def test_admin_cannot_assign_itself_a_bootcamper(
        self, db, admin_user, converted_bootcamper
    ):
        """El administrador no tiene cartera propia: reparte, no toma.

        Antes esto daba 403 porque el endpoint era sólo de Finanzas. Ahora el
        administrador puede repartir el pool, pero tiene que indicar a qué
        persona de Finanzas: sin `finance_owner_id` la petición no significa
        nada y se rechaza con 400. La intención del test no cambia — sigue sin
        poder quedarse el bootcamper.
        """
        resp = make_client(admin_user).patch(
            ASSIGN_URL.format(id=converted_bootcamper.id)
        )

        assert resp.status_code == 400
        assert resp.json()['code'] == 'FINANCE_OWNER_REQUIRED'

        converted_bootcamper.refresh_from_db()
        assert converted_bootcamper.finance_owner_id is None

    def test_bootcamper_cannot_see_the_pool(self, db, converted_bootcamper):
        assert make_client(converted_bootcamper).get(POOL_URL).status_code == 403


class TestRoleSeparation:
    """El vendedor conserva el dashboard de leads y pierde pagos; Finanzas hace ambos."""

    PAYMENT_URLS = [
        "/api/payments/queue/",
        "/api/payments/monitoring/",
        "/api/payments/bootcampers/",
    ]
    LEAD_URLS = [
        "/api/leads/",
        "/api/programs/",
    ]

    def test_salesperson_is_locked_out_of_payments(self, db, salesperson_user):
        client = make_client(salesperson_user)
        for url in self.PAYMENT_URLS:
            assert client.get(url).status_code == 403, url

    def test_salesperson_keeps_the_leads_dashboard(self, db, salesperson_user):
        client = make_client(salesperson_user)
        for url in self.LEAD_URLS:
            assert client.get(url).status_code == 200, url

    def test_finance_reaches_both_sides(self, db, finance_user):
        client = make_client(finance_user)
        for url in self.PAYMENT_URLS + self.LEAD_URLS:
            assert client.get(url).status_code == 200, url

    def test_finance_can_create_and_convert_leads(self, db, finance_user, program):
        """Finanzas trabaja el lead de punta a punta, igual que el vendedor."""
        client = make_client(finance_user)

        created = client.post(
            "/api/leads/",
            {"name": "Lead de Finanzas", "phone": "0987000111"},
            format="json",
        )
        assert created.status_code == 201

        lead_id = created.json()["id"]
        assert client.patch(f"/api/leads/{lead_id}/assign/").status_code == 200
        assert client.patch(
            f"/api/leads/{lead_id}/", {"status": Lead.Status.QUALIFIED}, format="json"
        ).status_code == 200

        converted = client.post(
            f"/api/leads/{lead_id}/convert/",
            {"cedula": "1713175071", "program_id": str(program.id), "email": "finanzas.lead@test.com"},
            format="json",
        )
        assert converted.status_code == 201, converted.json()

        bootcamper = CustomUser.objects.get(cedula="1713175071")
        assert bootcamper.role == CustomUser.Role.BOOTCAMPER
        # Recién convertido: entra al pool sin responsable de cobro.
        assert bootcamper.finance_owner is None
