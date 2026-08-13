"""Tests for CR-013 — card payment link (Finance negotiates and pastes a link,
bootcamper pays externally). Several links can exist over time per enrollment,
each from a separate negotiation with Finance (like separate invoices)."""

import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.timezone import now
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.payments.models import Payment, PaymentLink

UPLOAD_URL = "/api/payments/upload/"
CONFIRM_URL = "/api/payments/my-payments/{id}/confirm/"
MY_PAYMENT_LINKS_URL = "/api/payments/my-payment-links/"
PAYMENT_LINKS_URL = "/api/payments/enrollments/{id}/payment-links/"
PAYMENT_LINK_REVOKE_URL = "/api/payments/payment-links/{id}/revoke/"


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def make_link(enrollment, created_by, **overrides):
    defaults = dict(
        enrollment=enrollment,
        url="https://pagos.espoltech.edu.ec/abc123",
        created_by=created_by,
        expires_at=now() + timedelta(days=7),
    )
    defaults.update(overrides)
    return PaymentLink.objects.create(**defaults)


class TestPaymentLinkCreate:
    def test_finance_creates_link(self, db, finance_user, active_enrollment):
        client = make_client(finance_user)
        with patch("apps.payments.tasks.send_payment_link_notification.delay") as mock_delay:
            resp = client.post(
                PAYMENT_LINKS_URL.format(id=active_enrollment.id),
                {"url": "https://pagos.espoltech.edu.ec/abc123", "amount": "300.00", "note": "Cuota 2"},
                format="json",
            )
        assert resp.status_code == 201
        link = PaymentLink.objects.get(enrollment=active_enrollment)
        assert link.url == "https://pagos.espoltech.edu.ec/abc123"
        assert link.amount == Decimal("300.00")
        assert link.note == "Cuota 2"
        assert link.status == PaymentLink.Status.ACTIVE
        assert link.created_by == finance_user
        mock_delay.assert_called_once_with(str(link.id))

    def test_admin_creates_link(self, db, admin_user, active_enrollment):
        client = make_client(admin_user)
        with patch("apps.payments.tasks.send_payment_link_notification.delay"):
            resp = client.post(
                PAYMENT_LINKS_URL.format(id=active_enrollment.id),
                {"url": "https://pagos.espoltech.edu.ec/abc123"},
                format="json",
            )
        assert resp.status_code == 201

    def test_default_expiry_is_seven_days(self, db, finance_user, active_enrollment):
        client = make_client(finance_user)
        with patch("apps.payments.tasks.send_payment_link_notification.delay"):
            resp = client.post(
                PAYMENT_LINKS_URL.format(id=active_enrollment.id),
                {"url": "https://pagos.espoltech.edu.ec/abc123"},
                format="json",
            )
        assert resp.status_code == 201
        link = PaymentLink.objects.get(enrollment=active_enrollment)
        delta = link.expires_at - link.created_at
        assert 6 <= delta.days <= 7

    def test_custom_expiry_accepted(self, db, finance_user, active_enrollment):
        client = make_client(finance_user)
        custom_expiry = now() + timedelta(days=2)
        with patch("apps.payments.tasks.send_payment_link_notification.delay"):
            resp = client.post(
                PAYMENT_LINKS_URL.format(id=active_enrollment.id),
                {"url": "https://pagos.espoltech.edu.ec/abc123", "expires_at": custom_expiry.isoformat()},
                format="json",
            )
        assert resp.status_code == 201
        link = PaymentLink.objects.get(enrollment=active_enrollment)
        assert abs((link.expires_at - custom_expiry).total_seconds()) < 5

    def test_expiry_in_the_past_rejected(self, db, finance_user, active_enrollment):
        client = make_client(finance_user)
        resp = client.post(
            PAYMENT_LINKS_URL.format(id=active_enrollment.id),
            {
                "url": "https://pagos.espoltech.edu.ec/abc123",
                "expires_at": (now() - timedelta(days=1)).isoformat(),
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_multiple_links_coexist(self, db, finance_user, active_enrollment):
        """Cada negociación crea un link nuevo — no se sobreescribe el anterior."""
        client = make_client(finance_user)
        with patch("apps.payments.tasks.send_payment_link_notification.delay"):
            client.post(
                PAYMENT_LINKS_URL.format(id=active_enrollment.id),
                {"url": "https://pagos.espoltech.edu.ec/cuota1", "note": "Cuota 1"},
                format="json",
            )
            client.post(
                PAYMENT_LINKS_URL.format(id=active_enrollment.id),
                {"url": "https://pagos.espoltech.edu.ec/cuota2", "note": "Cuota 2"},
                format="json",
            )
        assert PaymentLink.objects.filter(enrollment=active_enrollment).count() == 2

    def test_salesperson_forbidden(self, db, salesperson_user, active_enrollment):
        client = make_client(salesperson_user)
        resp = client.post(
            PAYMENT_LINKS_URL.format(id=active_enrollment.id),
            {"url": "https://pagos.espoltech.edu.ec/abc123"},
            format="json",
        )
        assert resp.status_code == 403

    def test_bootcamper_forbidden(self, db, converted_bootcamper, active_enrollment):
        client = make_client(converted_bootcamper)
        resp = client.post(
            PAYMENT_LINKS_URL.format(id=active_enrollment.id),
            {"url": "https://pagos.espoltech.edu.ec/abc123"},
            format="json",
        )
        assert resp.status_code == 403

    def test_invalid_url_rejected(self, db, finance_user, active_enrollment):
        client = make_client(finance_user)
        resp = client.post(
            PAYMENT_LINKS_URL.format(id=active_enrollment.id),
            {"url": "not-a-url"},
            format="json",
        )
        assert resp.status_code == 400
        assert not PaymentLink.objects.filter(enrollment=active_enrollment).exists()

    def test_missing_url_rejected(self, db, finance_user, active_enrollment):
        client = make_client(finance_user)
        resp = client.post(PAYMENT_LINKS_URL.format(id=active_enrollment.id), {}, format="json")
        assert resp.status_code == 400

    def test_enrollment_not_found(self, db, finance_user):
        client = make_client(finance_user)
        resp = client.post(
            PAYMENT_LINKS_URL.format(id=uuid.uuid4()),
            {"url": "https://pagos.espoltech.edu.ec/abc123"},
            format="json",
        )
        assert resp.status_code == 404

    def test_broker_failure_does_not_block_creation(self, db, finance_user, active_enrollment):
        client = make_client(finance_user)
        with patch(
            "apps.payments.tasks.send_payment_link_notification.delay",
            side_effect=Exception("broker down"),
        ):
            resp = client.post(
                PAYMENT_LINKS_URL.format(id=active_enrollment.id),
                {"url": "https://pagos.espoltech.edu.ec/abc123"},
                format="json",
            )
        assert resp.status_code == 201
        assert PaymentLink.objects.filter(enrollment=active_enrollment).exists()


class TestPaymentLinkList:
    def test_finance_lists_link_history(self, db, finance_user, active_enrollment):
        make_link(active_enrollment, finance_user, note="Cuota 1")
        make_link(active_enrollment, finance_user, note="Cuota 2", status=PaymentLink.Status.REVOKED)
        client = make_client(finance_user)
        resp = client.get(PAYMENT_LINKS_URL.format(id=active_enrollment.id))
        assert resp.status_code == 200
        assert len(resp.data) == 2

    def test_bootcamper_sees_only_active_links(self, db, converted_bootcamper, finance_user, active_enrollment, program):
        make_link(active_enrollment, finance_user, note="Vigente")
        make_link(active_enrollment, finance_user, note="Revocado", status=PaymentLink.Status.REVOKED)
        make_link(active_enrollment, finance_user, note="Vencido", expires_at=now() - timedelta(days=1))
        client = make_client(converted_bootcamper)
        resp = client.get(MY_PAYMENT_LINKS_URL, {"program_id": str(program.id)})
        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]["note"] == "Vigente"

    def test_bootcamper_sees_multiple_active_links(self, db, converted_bootcamper, finance_user, active_enrollment, program):
        make_link(active_enrollment, finance_user, note="Cuota 1")
        make_link(active_enrollment, finance_user, note="Cuota 2")
        client = make_client(converted_bootcamper)
        resp = client.get(MY_PAYMENT_LINKS_URL, {"program_id": str(program.id)})
        assert resp.status_code == 200
        assert len(resp.data) == 2

    def test_bootcamper_without_enrollment_gets_empty_list(self, db, bootcamper_user, program):
        client = make_client(bootcamper_user)
        resp = client.get(MY_PAYMENT_LINKS_URL, {"program_id": str(program.id)})
        assert resp.status_code == 200
        assert resp.data == []

    def test_missing_program_id_rejected(self, db, converted_bootcamper):
        client = make_client(converted_bootcamper)
        resp = client.get(MY_PAYMENT_LINKS_URL)
        assert resp.status_code == 400


class TestPaymentLinkRevoke:
    def test_finance_revokes_link(self, db, finance_user, active_enrollment):
        link = make_link(active_enrollment, finance_user)
        client = make_client(finance_user)
        resp = client.patch(PAYMENT_LINK_REVOKE_URL.format(id=link.id))
        assert resp.status_code == 200
        link.refresh_from_db()
        assert link.status == PaymentLink.Status.REVOKED
        assert link.revoked_at is not None

    def test_revoking_already_revoked_link_rejected(self, db, finance_user, active_enrollment):
        link = make_link(active_enrollment, finance_user, status=PaymentLink.Status.REVOKED)
        client = make_client(finance_user)
        resp = client.patch(PAYMENT_LINK_REVOKE_URL.format(id=link.id))
        assert resp.status_code == 400

    def test_bootcamper_cannot_revoke(self, db, converted_bootcamper, finance_user, active_enrollment):
        link = make_link(active_enrollment, finance_user)
        client = make_client(converted_bootcamper)
        resp = client.patch(PAYMENT_LINK_REVOKE_URL.format(id=link.id))
        assert resp.status_code == 403

    def test_revoked_link_disappears_from_active_list(self, db, converted_bootcamper, finance_user, active_enrollment, program):
        link = make_link(active_enrollment, finance_user)
        finance_client = make_client(finance_user)
        finance_client.patch(PAYMENT_LINK_REVOKE_URL.format(id=link.id))

        bootcamper_client = make_client(converted_bootcamper)
        resp = bootcamper_client.get(MY_PAYMENT_LINKS_URL, {"program_id": str(program.id)})
        assert resp.data == []


class TestPaymentLinkReceiptUpload:
    def test_upload_with_link_method_skips_ocr(self, db, converted_bootcamper, finance_user, active_enrollment, program):
        link = make_link(active_enrollment, finance_user)
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "evidence.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        with patch("apps.payments.tasks.process_payment_ocr.delay") as mock_delay:
            resp = client.post(
                UPLOAD_URL,
                {
                    "receipt_file": fake_file,
                    "program_id": str(program.id),
                    "payment_method": "LINK",
                    "payment_link_id": str(link.id),
                },
                format="multipart",
            )
        assert resp.status_code == 201
        assert resp.data["ocr_queued"] is False
        mock_delay.assert_not_called()

        payment = Payment.objects.get(bootcamper=converted_bootcamper, program=program)
        assert payment.payment_method == Payment.Method.LINK
        assert payment.payment_link_id == link.id
        assert payment.status == Payment.Status.DRAFT

    def test_upload_link_method_without_link_id_rejected(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "evidence.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        resp = client.post(
            UPLOAD_URL,
            {"receipt_file": fake_file, "program_id": str(program.id), "payment_method": "LINK"},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_upload_with_expired_link_rejected(self, db, converted_bootcamper, finance_user, active_enrollment, program):
        link = make_link(active_enrollment, finance_user, expires_at=now() - timedelta(days=1))
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "evidence.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        resp = client.post(
            UPLOAD_URL,
            {
                "receipt_file": fake_file,
                "program_id": str(program.id),
                "payment_method": "LINK",
                "payment_link_id": str(link.id),
            },
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "INVALID_PAYMENT_LINK"

    def test_upload_with_someone_elses_link_rejected(self, db, converted_bootcamper, finance_user, active_enrollment, program):
        """El link pertenece a la inscripción de otro bootcamper: no debe aceptarse."""
        from apps.authentication.models import CustomUser
        from apps.programs.models import Enrollment
        from datetime import date

        other_bootcamper = CustomUser.objects.create_user(
            email="other.bootcamper@test.com", password="testpass123",
            first_name="Other", last_name="Bootcamper", role=CustomUser.Role.BOOTCAMPER,
        )
        other_enrollment = Enrollment.objects.create(
            bootcamper=other_bootcamper, bootcamp=program,
            status=Enrollment.Status.ACTIVE, start_date=date.today(),
            agreed_price=program.total_cost,
        )
        other_link = make_link(other_enrollment, finance_user)

        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "evidence.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        resp = client.post(
            UPLOAD_URL,
            {
                "receipt_file": fake_file,
                "program_id": str(program.id),
                "payment_method": "LINK",
                "payment_link_id": str(other_link.id),
            },
            format="multipart",
        )
        assert resp.status_code == 400
        assert resp.data["code"] == "INVALID_PAYMENT_LINK"

    def test_upload_without_method_defaults_to_transfer(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "receipt.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        with patch("apps.payments.tasks.process_payment_ocr.delay"):
            resp = client.post(
                UPLOAD_URL,
                {"receipt_file": fake_file, "program_id": str(program.id)},
                format="multipart",
            )
        assert resp.status_code == 201
        payment = Payment.objects.get(bootcamper=converted_bootcamper, program=program)
        assert payment.payment_method == Payment.Method.TRANSFER
        assert payment.payment_link_id is None

    def test_link_payment_confirms_without_bank_fields(self, db, converted_bootcamper, program):
        """La evidencia de pago por link no tiene datos bancarios: confirmar con
        payload vacío debe alcanzar para pasar de DRAFT a PENDING."""
        payment = Payment.objects.create(
            bootcamper=converted_bootcamper,
            program=program,
            receipt_file="receipts/link_evidence.jpg",
            receipt_file_type="image",
            payment_method=Payment.Method.LINK,
            status=Payment.Status.DRAFT,
        )
        client = make_client(converted_bootcamper)
        resp = client.patch(CONFIRM_URL.format(id=payment.id), {}, format="json")
        assert resp.status_code == 200
        payment.refresh_from_db()
        assert payment.status == Payment.Status.PENDING


class TestPaymentLinkModel:
    def test_is_active_true_for_active_and_not_expired(self, db, finance_user, active_enrollment):
        link = make_link(active_enrollment, finance_user)
        assert link.is_active is True

    def test_is_active_false_when_expired(self, db, finance_user, active_enrollment):
        link = make_link(active_enrollment, finance_user, expires_at=now() - timedelta(days=1))
        assert link.is_active is False

    def test_is_active_false_when_revoked(self, db, finance_user, active_enrollment):
        link = make_link(active_enrollment, finance_user, status=PaymentLink.Status.REVOKED)
        assert link.is_active is False
