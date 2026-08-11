"""Tests for payment endpoints."""

from decimal import Decimal
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.payments.models import Payment

UPLOAD_URL = "/api/payments/upload/"
MY_PROGRAMS_URL = "/api/payments/my-programs/"
MY_STATUS_URL = "/api/payments/my-status/"
MY_HISTORY_URL = "/api/payments/my-history/"
QUEUE_URL = "/api/payments/queue/"
MONITORING_URL = "/api/payments/monitoring/"
PAYMENT_URL = "/api/payments/{id}/"
APPROVE_URL = "/api/payments/{id}/approve/"
REJECT_URL = "/api/payments/{id}/reject/"
OCR_STATUS_URL = "/api/payments/my-payments/{id}/ocr-status/"
CONFIRM_URL = "/api/payments/my-payments/{id}/confirm/"
MY_PAYMENT_URL = "/api/payments/my-payments/{id}/"
NOTIFY_COORD_URL = "/api/payments/notify-coordinator/{bootcamper_id}/"


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


class TestPaymentUpload:
    def test_payment_upload_success(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "receipt.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        with patch("apps.payments.tasks.process_payment_ocr.delay"):
            resp = client.post(
                UPLOAD_URL,
                {
                    "receipt_file": fake_file,
                    "program_id": str(program.id),
                },
                format="multipart",
            )
        assert resp.status_code == 201
        payment = Payment.objects.filter(
            bootcamper=converted_bootcamper, program=program
        ).first()
        assert payment is not None
        assert payment.status == Payment.Status.DRAFT, "Upload must create payment in DRAFT status"

    def test_payment_upload_invalid_file_type(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "virus.exe", b"MZ", content_type="application/octet-stream"
        )
        resp = client.post(
            UPLOAD_URL,
            {
                "receipt_file": fake_file,
                "program_id": str(program.id),
            },
            format="multipart",
        )
        assert resp.status_code == 400

    def test_payment_upload_file_too_large(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        # 11 MB — exceeds the 10 MB limit enforced by PaymentUploadSerializer
        large_content = b"x" * (11 * 1024 * 1024)
        fake_file = SimpleUploadedFile(
            "big.jpg", large_content, content_type="image/jpeg"
        )
        resp = client.post(
            UPLOAD_URL,
            {
                "receipt_file": fake_file,
                "program_id": str(program.id),
            },
            format="multipart",
        )
        assert resp.status_code == 400

    def test_payment_upload_triggers_ocr_task(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "receipt.png", b"fake-data", content_type="image/png"
        )
        with patch("apps.payments.tasks.process_payment_ocr.delay") as mock_delay:
            resp = client.post(
                UPLOAD_URL,
                {
                    "receipt_file": fake_file,
                    "program_id": str(program.id),
                },
                format="multipart",
            )
        assert resp.status_code == 201
        mock_delay.assert_called_once()

    def test_payment_upload_salesperson_forbidden(self, db, salesperson_user, program):
        client = make_client(salesperson_user)
        fake_file = SimpleUploadedFile(
            "receipt.jpg", b"data", content_type="image/jpeg"
        )
        resp = client.post(
            UPLOAD_URL,
            {
                "receipt_file": fake_file,
                "program_id": str(program.id),
            },
            format="multipart",
        )
        assert resp.status_code == 403

    def test_payment_upload_pdf_as_octet_stream_accepted(self, db, converted_bootcamper, program):
        """Some OS/browsers declare PDFs as application/octet-stream on drag-drop.

        The frontend allows it by extension; the backend must too, or the same
        upload that passed client-side validation gets rejected server-side.
        """
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "receipt.pdf", b"%PDF-1.4 fake", content_type="application/octet-stream"
        )
        with patch("apps.payments.tasks.process_payment_ocr.delay"):
            resp = client.post(
                UPLOAD_URL,
                {
                    "receipt_file": fake_file,
                    "program_id": str(program.id),
                },
                format="multipart",
            )
        assert resp.status_code == 201
        payment = Payment.objects.get(bootcamper=converted_bootcamper, program=program)
        assert payment.receipt_file_type == "pdf"

    def test_payment_upload_octet_stream_bad_extension_rejected(self, db, converted_bootcamper, program):
        """application/octet-stream is only tolerated for allowed extensions."""
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "virus.exe", b"MZ", content_type="application/octet-stream"
        )
        resp = client.post(
            UPLOAD_URL,
            {
                "receipt_file": fake_file,
                "program_id": str(program.id),
            },
            format="multipart",
        )
        assert resp.status_code == 400


class TestPaymentUploadInfrastructureFailures:
    """Un fallo de infraestructura no puede salir como la página HTML de Django.

    En producción gunicorn corre como appuser y el volumen de media estaba en
    poder de root, así que escribir el comprobante levantaba PermissionError: el
    bootcamper veía el HTML del error 500 renderizado dentro del modal.
    """

    def test_storage_failure_answers_json_not_html(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "receipt.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        with patch(
            "apps.payments.models.Payment.objects.create",
            side_effect=PermissionError("Permission denied: /app/media/receipts"),
        ):
            resp = client.post(
                UPLOAD_URL,
                {"receipt_file": fake_file, "program_id": str(program.id)},
                format="multipart",
            )

        assert resp.status_code == 503
        assert resp["Content-Type"].startswith("application/json")
        assert resp.json()["code"] == "RECEIPT_STORAGE_ERROR"

    def test_broker_down_still_keeps_the_receipt(self, db, converted_bootcamper, program):
        """Redis caído no puede invalidar la subida: el pago ya se guardó.

        Devolver error haría que el bootcamper vuelva a subir el mismo archivo y
        duplique comprobantes, cuando Finanzas ya puede revisarlo a mano.
        """
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile(
            "receipt.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        with patch(
            "apps.payments.tasks.process_payment_ocr.delay",
            side_effect=OSError("Error 111 connecting to redis:6379"),
        ):
            resp = client.post(
                UPLOAD_URL,
                {"receipt_file": fake_file, "program_id": str(program.id)},
                format="multipart",
            )

        assert resp.status_code == 201
        assert resp.json()["ocr_queued"] is False
        assert Payment.objects.filter(
            bootcamper=converted_bootcamper, program=program
        ).exists()

    def test_successful_upload_reports_the_ocr_as_queued(self, db, converted_bootcamper, program):
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
        assert resp.json()["ocr_queued"] is True


class TestPaymentMyPrograms:
    def test_bootcamper_with_enrollment_sees_program(self, db, converted_bootcamper, active_enrollment, program):
        client = make_client(converted_bootcamper)
        resp = client.get(MY_PROGRAMS_URL)
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        assert str(program.id) in ids

    def test_bootcamper_without_enrollment_sees_empty_list(self, db, converted_bootcamper):
        client = make_client(converted_bootcamper)
        resp = client.get(MY_PROGRAMS_URL)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_other_role_forbidden(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.get(MY_PROGRAMS_URL)
        assert resp.status_code == 403


class TestPaymentUploadResolvesProgram:
    """Sin `program_id`, el programa se deduce de la inscripción activa.

    El bootcamper no elige programa al subir: ya está inscrito en uno. Antes el
    campo era obligatorio y quien no tuviera pagos previos no podía subir el
    primero, porque el cliente no tenía de dónde sacar el id.
    """

    def _upload(self, client, **extra):
        fake_file = SimpleUploadedFile(
            "receipt.jpg", b"fake-image-data", content_type="image/jpeg"
        )
        with patch("apps.payments.tasks.process_payment_ocr.delay"):
            return client.post(
                UPLOAD_URL, {"receipt_file": fake_file, **extra}, format="multipart"
            )

    def _enroll(self, bootcamper, program, status=None):
        from apps.programs.models import Enrollment

        return Enrollment.objects.create(
            bootcamper=bootcamper,
            bootcamp=program,
            start_date=program.start_date,
            agreed_price=program.total_cost,
            **({"status": status} if status else {}),
        )

    def test_infers_program_from_the_single_active_enrollment(
        self, db, converted_bootcamper, program
    ):
        self._enroll(converted_bootcamper, program)

        resp = self._upload(make_client(converted_bootcamper))

        assert resp.status_code == 201
        assert Payment.objects.get(id=resp.json()["id"]).program_id == program.id

    def test_first_upload_works_without_previous_payments(
        self, db, converted_bootcamper, program
    ):
        """El caso que estaba roto: primera subida, sin historial del cual deducir."""
        self._enroll(converted_bootcamper, program)
        assert not Payment.objects.filter(bootcamper=converted_bootcamper).exists()

        assert self._upload(make_client(converted_bootcamper)).status_code == 201

    def test_rejects_when_there_is_no_active_enrollment(
        self, db, converted_bootcamper, program
    ):
        from apps.programs.models import Enrollment

        self._enroll(converted_bootcamper, program, status=Enrollment.Status.DROPPED)

        resp = self._upload(make_client(converted_bootcamper))

        assert resp.status_code == 400
        assert resp.json()["code"] == "NO_ACTIVE_ENROLLMENT"
        assert not Payment.objects.exists()

    def test_rejects_when_two_active_enrollments_are_ambiguous(
        self, db, converted_bootcamper, program
    ):
        from datetime import date, timedelta

        from apps.programs.models import Program

        other = Program.objects.create(
            name="Data Science Junio 2026",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=60),
            total_cost=Decimal("900.00"),
        )
        self._enroll(converted_bootcamper, program)
        self._enroll(converted_bootcamper, other)

        resp = self._upload(make_client(converted_bootcamper))

        assert resp.status_code == 400
        assert resp.json()["code"] == "AMBIGUOUS_ENROLLMENT"
        assert not Payment.objects.exists()

    def test_explicit_program_id_still_wins_over_the_inference(
        self, db, converted_bootcamper, program
    ):
        """Dos programas activos siguen pudiendo subir si el cliente desempata."""
        from datetime import date, timedelta

        from apps.programs.models import Program

        other = Program.objects.create(
            name="Data Analytics Julio 2026",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=60),
            total_cost=Decimal("800.00"),
        )
        self._enroll(converted_bootcamper, program)
        self._enroll(converted_bootcamper, other)

        resp = self._upload(make_client(converted_bootcamper), program_id=str(other.id))

        assert resp.status_code == 201
        assert Payment.objects.get(id=resp.json()["id"]).program_id == other.id

    def test_unknown_program_id_still_returns_404(
        self, db, converted_bootcamper, program
    ):
        self._enroll(converted_bootcamper, program)

        resp = self._upload(
            make_client(converted_bootcamper),
            program_id="00000000-0000-0000-0000-000000000000",
        )

        assert resp.status_code == 404
        assert resp.json()["code"] == "PROGRAM_NOT_FOUND"


class TestReceiptFile:
    RECEIPT_URL = "/api/payments/receipt/"

    def _uploaded_payment(self, client, program):
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
        return resp.json()

    def test_receipt_file_is_signed_url(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        data = self._uploaded_payment(client, program)
        assert data["receipt_file"].startswith(f"{self.RECEIPT_URL}?st=")

    def test_signed_url_serves_file_without_auth_header(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        data = self._uploaded_payment(client, program)

        anonymous = APIClient()
        resp = anonymous.get(data["receipt_file"])
        assert resp.status_code == 200
        assert b"".join(resp.streaming_content) == b"fake-image-data"

    def test_tampered_token_rejected(self, db):
        anonymous = APIClient()
        resp = anonymous.get(self.RECEIPT_URL, {"st": "forged-token"})
        assert resp.status_code == 403
        assert resp.json()["code"] == "RECEIPT_TOKEN_INVALID"

    def test_valid_token_for_missing_payment_404(self, db):
        from apps.payments.services import make_receipt_token

        anonymous = APIClient()
        token = make_receipt_token("00000000-0000-0000-0000-000000000000")
        resp = anonymous.get(self.RECEIPT_URL, {"st": token})
        assert resp.status_code == 404


class TestPaymentMyStatus:
    def test_my_status_returns_summary(
        self, db, converted_bootcamper, program, approved_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.get(f"{MY_STATUS_URL}?program_id={program.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_paid" in data
        assert "deficit" in data
        assert "is_critical" in data
        assert "time_elapsed_percentage" in data

    def test_my_status_requires_program_id(self, db, converted_bootcamper):
        client = make_client(converted_bootcamper)
        resp = client.get(MY_STATUS_URL)
        assert resp.status_code == 400


class TestPaymentMyHistory:
    def test_my_history_returns_payments(
        self, db, converted_bootcamper, pending_payment, approved_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.get(MY_HISTORY_URL)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_my_history_salesperson_forbidden(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.get(MY_HISTORY_URL)
        assert resp.status_code == 403


class TestPaymentQueue:
    def test_queue_returns_pending_only(
        self, db, finance_user, pending_payment, approved_payment
    ):
        client = make_client(finance_user)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["status"] == Payment.Status.PENDING

    def test_queue_filtered_by_program(
        self, db, finance_user, pending_payment, program
    ):
        client = make_client(finance_user)
        resp = client.get(f"{QUEUE_URL}?program_id={program.id}")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_queue_response_includes_new_ocr_fields(
        self, db, finance_user, pending_payment
    ):
        """ocr_payment_date and ocr_confidence must be present in queue list items."""
        client = make_client(finance_user)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        item = data[0]
        assert "ocr_payment_date" in item
        assert "ocr_confidence" in item

    def test_queue_response_includes_billing_fields(
        self, db, finance_user, pending_payment
    ):
        """CB-123: billing fields must be present in queue list items."""
        client = make_client(finance_user)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        item = data[0]
        for field in ("payer_name", "payer_identification", "payer_email",
                      "payer_address", "payer_phone", "document_number"):
            assert field in item

    def test_queue_bootcamper_forbidden(self, db, converted_bootcamper):
        client = make_client(converted_bootcamper)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 403


class TestPaymentApprove:
    def test_approve_payment_success(self, db, finance_user, pending_payment):
        client = make_client(finance_user)
        with patch("apps.payments.tasks.send_payment_status_notification.delay"):
            resp = client.patch(
                APPROVE_URL.format(id=pending_payment.id),
                {
                    "confirmed_amount": "350.00",
                    "confirmed_bank_name": "Banco Pichincha",
                    "confirmed_transaction_id": "TXN123456",
                },
                format="json",
            )
        assert resp.status_code == 200
        pending_payment.refresh_from_db()
        assert pending_payment.status == Payment.Status.APPROVED
        assert pending_payment.confirmed_amount == Decimal("350.00")
        assert pending_payment.validated_by == finance_user

    def test_approve_already_approved_fails(
        self, db, finance_user, approved_payment
    ):
        client = make_client(finance_user)
        resp = client.patch(
            APPROVE_URL.format(id=approved_payment.id),
            {
                "confirmed_amount": "400.00",
            },
            format="json",
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "NOT_PENDING"


class TestPaymentReject:
    def test_reject_payment_success(self, db, finance_user, pending_payment):
        client = make_client(finance_user)
        with patch("apps.payments.tasks.send_payment_status_notification.delay"):
            resp = client.patch(
                REJECT_URL.format(id=pending_payment.id),
                {
                    "rejection_reason": "El comprobante es ilegible.",
                },
                format="json",
            )
        assert resp.status_code == 200
        pending_payment.refresh_from_db()
        assert pending_payment.status == Payment.Status.REJECTED
        assert "ilegible" in pending_payment.rejection_reason

    def test_reject_empty_reason_fails(self, db, finance_user, pending_payment):
        client = make_client(finance_user)
        resp = client.patch(
            REJECT_URL.format(id=pending_payment.id),
            {
                "rejection_reason": "",
            },
            format="json",
        )
        assert resp.status_code == 400


class TestPaymentOCRStatus:
    def test_ocr_status_returns_fields(self, db, converted_bootcamper, pending_payment):
        pending_payment.ocr_bank_name = "Banco Pichincha"
        pending_payment.ocr_amount = Decimal("300.00")
        pending_payment.save()
        client = make_client(converted_bootcamper)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data["ocr_bank_name"] == "Banco Pichincha"
        assert data["ocr_amount"] == "300.00"

    def test_ocr_status_includes_date_and_confidence(
        self, db, converted_bootcamper, pending_payment
    ):
        """New fields ocr_payment_date and ocr_confidence must appear in ocr-status response."""
        from datetime import date

        pending_payment.ocr_payment_date = date(2026, 6, 12)
        pending_payment.ocr_confidence = {
            "bank_name": 0.85,
            "amount": 0.75,
            "overall": 0.80,
        }
        pending_payment.save()
        client = make_client(converted_bootcamper)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data["ocr_payment_date"] == "2026-06-12"
        assert data["ocr_confidence"]["overall"] == 0.80

    def test_ocr_status_confidence_empty_dict_when_not_set(
        self, db, converted_bootcamper, pending_payment
    ):
        """ocr_confidence defaults to {} — serializer must not blow up."""
        client = make_client(converted_bootcamper)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert "ocr_confidence" in data
        assert data["ocr_confidence"] == {}

    def test_ocr_status_includes_billing_fields(
        self, db, converted_bootcamper, pending_payment
    ):
        """CB-123: billing fields must appear in the ocr-status response."""
        pending_payment.payer_name = "Munizaga Torres Juan Andres"
        pending_payment.payer_email = "juan@example.com"
        pending_payment.document_number = "4121055"
        pending_payment.save()
        client = make_client(converted_bootcamper)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data["payer_name"] == "Munizaga Torres Juan Andres"
        assert data["payer_email"] == "juan@example.com"
        assert data["document_number"] == "4121055"
        assert "payer_identification" in data
        assert "payer_address" in data
        assert "payer_phone" in data

    def test_ocr_status_other_bootcamper_forbidden(
        self, db, bootcamper_user, pending_payment
    ):
        client = make_client(bootcamper_user)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 404


class TestPaymentMonitoring:
    def test_monitoring_without_program_id_returns_all(
        self, db, finance_user, approved_payment
    ):
        client = make_client(finance_user)
        resp = client.get(MONITORING_URL)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_monitoring_returns_bootcamper_summaries(
        self, db, finance_user, program, approved_payment, converted_bootcamper
    ):
        converted_bootcamper.finance_owner = finance_user
        converted_bootcamper.save(update_fields=["finance_owner"])

        client = make_client(finance_user)
        resp = client.get(f"{MONITORING_URL}?program_id={program.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert "total_paid" in data[0]
        assert "is_critical" in data[0]

    def test_monitoring_hides_bootcampers_of_other_finance_users(
        self, db, finance_user, other_finance_user, program, approved_payment,
        converted_bootcamper,
    ):
        """La cartera es de quien la tomó: nadie más la ve desde el monitoreo."""
        converted_bootcamper.finance_owner = other_finance_user
        converted_bootcamper.save(update_fields=["finance_owner"])

        client = make_client(finance_user)
        resp = client.get(f"{MONITORING_URL}?program_id={program.id}")

        assert resp.status_code == 200
        assert resp.json() == []


class TestPaymentConfirm:
    def test_confirm_draft_transitions_to_pending(self, db, converted_bootcamper, draft_payment):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 200
        draft_payment.refresh_from_db()
        assert draft_payment.status == Payment.Status.PENDING

    def test_confirm_with_corrections_overwrites_ocr_fields(
        self, db, converted_bootcamper, draft_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {
                "ocr_amount": "200.00",
                "ocr_bank_name": "Banco Guayaquil",
            },
            format="json",
        )
        assert resp.status_code == 200
        draft_payment.refresh_from_db()
        assert draft_payment.status == Payment.Status.PENDING
        assert draft_payment.ocr_amount == Decimal("200.00")
        assert draft_payment.ocr_bank_name == "Banco Guayaquil"

    def test_confirm_with_corrections_overwrites_billing_fields(
        self, db, converted_bootcamper, draft_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {
                "payer_name": "Munizaga Torres Juan Andres",
                "payer_identification": "1713175071",
                "payer_email": "juan@example.com",
                "payer_address": "Guayaquil, Ecuador",
                "payer_phone": "0999999999",
                "document_number": "4121055",
            },
            format="json",
        )
        assert resp.status_code == 200
        draft_payment.refresh_from_db()
        assert draft_payment.payer_name == "Munizaga Torres Juan Andres"
        assert draft_payment.payer_identification == "1713175071"
        assert draft_payment.payer_email == "juan@example.com"
        assert draft_payment.payer_address == "Guayaquil, Ecuador"
        assert draft_payment.payer_phone == "0999999999"
        assert draft_payment.document_number == "4121055"

    def test_confirm_accepts_valid_ruc(self, db, converted_bootcamper, draft_payment):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {"payer_identification": "1713175071001"},
            format="json",
        )
        assert resp.status_code == 200
        draft_payment.refresh_from_db()
        assert draft_payment.payer_identification == "1713175071001"

    def test_confirm_rejects_invalid_cedula(self, db, converted_bootcamper, draft_payment):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {"payer_identification": "1713175070"},  # bad check digit
            format="json",
        )
        assert resp.status_code == 400
        draft_payment.refresh_from_db()
        assert draft_payment.payer_identification == ""

    def test_confirm_rejects_malformed_identification(
        self, db, converted_bootcamper, draft_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {"payer_identification": "12345"},  # wrong length
            format="json",
        )
        assert resp.status_code == 400

    def test_confirm_rejects_invalid_email(self, db, converted_bootcamper, draft_payment):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {"payer_email": "not-an-email"},
            format="json",
        )
        assert resp.status_code == 400

    def test_confirm_already_pending_fails(self, db, converted_bootcamper, pending_payment):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            CONFIRM_URL.format(id=pending_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "NOT_DRAFT"

    def test_confirm_other_bootcampers_payment_forbidden(
        self, db, bootcamper_user, draft_payment
    ):
        """A different bootcamper must get 404, not 403 (no information leakage)."""
        client = make_client(bootcamper_user)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 404

    def test_confirm_salesperson_forbidden(self, db, salesperson_user, draft_payment):
        client = make_client(salesperson_user)
        resp = client.patch(
            CONFIRM_URL.format(id=draft_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 403


class TestMyPaymentResubmit:
    def test_resubmit_rejected_transitions_to_pending(
        self, db, converted_bootcamper, rejected_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            MY_PAYMENT_URL.format(id=rejected_payment.id),
            {"ocr_amount": "200.00"},
            format="json",
        )
        assert resp.status_code == 200
        rejected_payment.refresh_from_db()
        assert rejected_payment.status == Payment.Status.PENDING
        assert rejected_payment.ocr_amount == Decimal("200.00")

    def test_resubmit_clears_rejection_reason_and_review(
        self, db, converted_bootcamper, rejected_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            MY_PAYMENT_URL.format(id=rejected_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 200
        rejected_payment.refresh_from_db()
        assert rejected_payment.rejection_reason == ""
        assert rejected_payment.validated_by is None
        assert rejected_payment.validated_at is None

    def test_resubmit_empty_payment_date_is_normalized_to_null(
        self, db, converted_bootcamper, rejected_payment
    ):
        """The frontend sends '' for an empty date input; DateField accepts
        null but not '' — this must not blow up with a 400."""
        client = make_client(converted_bootcamper)
        resp = client.patch(
            MY_PAYMENT_URL.format(id=rejected_payment.id),
            {"ocr_payment_date": ""},
            format="json",
        )
        assert resp.status_code == 200
        rejected_payment.refresh_from_db()
        assert rejected_payment.ocr_payment_date is None

    def test_resubmit_non_rejected_payment_fails(
        self, db, converted_bootcamper, pending_payment
    ):
        client = make_client(converted_bootcamper)
        resp = client.patch(
            MY_PAYMENT_URL.format(id=pending_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "NOT_REJECTED"

    def test_resubmit_other_bootcampers_payment_forbidden(
        self, db, bootcamper_user, rejected_payment
    ):
        """A different bootcamper must get 404, not 403 (no information leakage)."""
        client = make_client(bootcamper_user)
        resp = client.patch(
            MY_PAYMENT_URL.format(id=rejected_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 404

    def test_resubmit_salesperson_forbidden(self, db, salesperson_user, rejected_payment):
        client = make_client(salesperson_user)
        resp = client.patch(
            MY_PAYMENT_URL.format(id=rejected_payment.id),
            {},
            format="json",
        )
        assert resp.status_code == 403


class TestMyPaymentDelete:
    def test_delete_draft_payment_succeeds(self, db, converted_bootcamper, draft_payment):
        client = make_client(converted_bootcamper)
        resp = client.delete(MY_PAYMENT_URL.format(id=draft_payment.id))
        assert resp.status_code == 204
        assert not Payment.objects.filter(pk=draft_payment.id).exists()

    def test_delete_rejected_payment_soft_deletes(self, db, converted_bootcamper, rejected_payment):
        # Rechazado: Finanzas ya lo vio, así que soft-delete (queda como constancia).
        client = make_client(converted_bootcamper)
        resp = client.delete(MY_PAYMENT_URL.format(id=rejected_payment.id))
        assert resp.status_code == 204
        rejected_payment.refresh_from_db()
        assert rejected_payment.deleted_at is not None
        assert rejected_payment.deleted_by == converted_bootcamper

    def test_delete_pending_payment_hard_deletes(self, db, converted_bootcamper, pending_payment):
        # Pendiente: Finanzas no lo aprobó/rechazó, se borra sin dejar rastro.
        client = make_client(converted_bootcamper)
        resp = client.delete(MY_PAYMENT_URL.format(id=pending_payment.id))
        assert resp.status_code == 204
        assert not Payment.objects.filter(pk=pending_payment.id).exists()

    def test_delete_approved_payment_fails(self, db, converted_bootcamper, approved_payment):
        client = make_client(converted_bootcamper)
        resp = client.delete(MY_PAYMENT_URL.format(id=approved_payment.id))
        assert resp.status_code == 400
        assert resp.json()["code"] == "NOT_DELETABLE"
        assert Payment.objects.filter(pk=approved_payment.id).exists()

    def test_delete_other_bootcampers_payment_forbidden(
        self, db, bootcamper_user, rejected_payment
    ):
        client = make_client(bootcamper_user)
        resp = client.delete(MY_PAYMENT_URL.format(id=rejected_payment.id))
        assert resp.status_code == 404
        assert Payment.objects.filter(pk=rejected_payment.id).exists()

    def test_delete_salesperson_forbidden(self, db, salesperson_user, draft_payment):
        client = make_client(salesperson_user)
        resp = client.delete(MY_PAYMENT_URL.format(id=draft_payment.id))
        assert resp.status_code == 403


class TestPaymentQueueExcludesDraft:
    def test_queue_does_not_include_draft_payments(
        self, db, finance_user, draft_payment, pending_payment
    ):
        """DRAFT payments must not appear in the vendor review queue."""
        client = make_client(finance_user)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()]
        assert str(pending_payment.id) in ids
        assert str(draft_payment.id) not in ids


class TestPaymentDraftCannotBeApproved:
    def test_approve_draft_payment_fails(self, db, finance_user, draft_payment):
        client = make_client(finance_user)
        resp = client.patch(
            APPROVE_URL.format(id=draft_payment.id),
            {"confirmed_amount": "150.00"},
            format="json",
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "NOT_PENDING"


class TestPaymentDetailIncludesRawText:
    def test_detail_includes_ocr_raw_text(
        self, db, finance_user, pending_payment
    ):
        """GET /payments/{id}/ must include ocr_raw_text for copy-paste by vendor."""
        pending_payment.ocr_raw_text = "Banco Pichincha\nTransferencia\nMonto: $350.00"
        pending_payment.save()
        client = make_client(finance_user)
        resp = client.get(PAYMENT_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert "ocr_raw_text" in data
        assert "Banco Pichincha" in data["ocr_raw_text"]

    def test_queue_list_does_not_include_raw_text(
        self, db, finance_user, pending_payment
    ):
        """The queue list endpoint must NOT include ocr_raw_text to keep payloads slim."""
        client = make_client(finance_user)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 200
        for item in resp.json():
            assert "ocr_raw_text" not in item


class TestNotifyCoordinator:
    def test_notify_coordinator_dispatches_task_when_critical(
        self, db, finance_user, converted_bootcamper, program
    ):
        # Sin Enrollment ni pagos aprobados, el déficit es el costo completo del
        # programa: siempre supera el 10%, así que este bootcamper es crítico.
        client = make_client(finance_user)
        with patch(
            "apps.notifications.tasks.send_late_payment_alert.delay"
        ) as mock_delay:
            resp = client.post(
                NOTIFY_COORD_URL.format(bootcamper_id=converted_bootcamper.id),
                {"program_id": str(program.id)},
                format="json",
            )
        assert resp.status_code == 200
        mock_delay.assert_called_once_with(
            str(converted_bootcamper.id), str(program.id)
        )

    def test_notify_coordinator_rejects_non_critical_payment(
        self, db, finance_user, converted_bootcamper, program
    ):
        from apps.programs.models import Enrollment

        # Pagó el costo completo: deficit == 0, muy por debajo del umbral del 10%.
        Enrollment.objects.create(
            bootcamper=converted_bootcamper,
            bootcamp=program,
            start_date=program.start_date,
            agreed_price=Decimal("1200.00"),
        )
        Payment.objects.create(
            bootcamper=converted_bootcamper,
            program=program,
            receipt_file="receipts/paid.jpg",
            receipt_file_type="image",
            status=Payment.Status.APPROVED,
            confirmed_amount=Decimal("1200.00"),
        )

        client = make_client(finance_user)
        with patch(
            "apps.notifications.tasks.send_late_payment_alert.delay"
        ) as mock_delay:
            resp = client.post(
                NOTIFY_COORD_URL.format(bootcamper_id=converted_bootcamper.id),
                {"program_id": str(program.id)},
                format="json",
            )
        assert resp.status_code == 400
        assert resp.json()["code"] == "NOT_CRITICAL"
        mock_delay.assert_not_called()
