"""Tests for payment endpoints."""
from decimal import Decimal
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.payments.models import Payment

UPLOAD_URL           = '/api/payments/upload/'
MY_STATUS_URL        = '/api/payments/my-status/'
MY_HISTORY_URL       = '/api/payments/my-history/'
QUEUE_URL            = '/api/payments/queue/'
MONITORING_URL       = '/api/payments/monitoring/'
PAYMENT_URL          = '/api/payments/{id}/'
APPROVE_URL          = '/api/payments/{id}/approve/'
REJECT_URL           = '/api/payments/{id}/reject/'
OCR_STATUS_URL       = '/api/payments/my-payments/{id}/ocr-status/'
NOTIFY_COORD_URL     = '/api/payments/notify-coordinator/{bootcamper_id}/'


def make_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return client


class TestPaymentUpload:
    def test_payment_upload_success(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile('receipt.jpg', b'fake-image-data', content_type='image/jpeg')
        with patch('apps.payments.tasks.process_payment_ocr.delay'):
            resp = client.post(UPLOAD_URL, {
                'receipt_file': fake_file,
                'program_id':   str(program.id),
            }, format='multipart')
        assert resp.status_code == 201
        assert Payment.objects.filter(bootcamper=converted_bootcamper, program=program).exists()

    def test_payment_upload_invalid_file_type(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile('virus.exe', b'MZ', content_type='application/octet-stream')
        resp = client.post(UPLOAD_URL, {
            'receipt_file': fake_file,
            'program_id':   str(program.id),
        }, format='multipart')
        assert resp.status_code == 400

    def test_payment_upload_file_too_large(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        # 11 MB — exceeds the 10 MB limit enforced by PaymentUploadSerializer
        large_content = b'x' * (11 * 1024 * 1024)
        fake_file = SimpleUploadedFile('big.jpg', large_content, content_type='image/jpeg')
        resp = client.post(UPLOAD_URL, {
            'receipt_file': fake_file,
            'program_id':   str(program.id),
        }, format='multipart')
        assert resp.status_code == 400

    def test_payment_upload_triggers_ocr_task(self, db, converted_bootcamper, program):
        client = make_client(converted_bootcamper)
        fake_file = SimpleUploadedFile('receipt.png', b'fake-data', content_type='image/png')
        with patch('apps.payments.tasks.process_payment_ocr.delay') as mock_delay:
            resp = client.post(UPLOAD_URL, {
                'receipt_file': fake_file,
                'program_id':   str(program.id),
            }, format='multipart')
        assert resp.status_code == 201
        mock_delay.assert_called_once()

    def test_payment_upload_salesperson_forbidden(self, db, salesperson_user, program):
        client = make_client(salesperson_user)
        fake_file = SimpleUploadedFile('receipt.jpg', b'data', content_type='image/jpeg')
        resp = client.post(UPLOAD_URL, {
            'receipt_file': fake_file,
            'program_id':   str(program.id),
        }, format='multipart')
        assert resp.status_code == 403


class TestPaymentMyStatus:
    def test_my_status_returns_summary(self, db, converted_bootcamper, program, approved_payment):
        client = make_client(converted_bootcamper)
        resp = client.get(f'{MY_STATUS_URL}?program_id={program.id}')
        assert resp.status_code == 200
        data = resp.json()
        assert 'total_paid' in data
        assert 'deficit' in data
        assert 'is_critical' in data
        assert 'time_elapsed_percentage' in data

    def test_my_status_requires_program_id(self, db, converted_bootcamper):
        client = make_client(converted_bootcamper)
        resp = client.get(MY_STATUS_URL)
        assert resp.status_code == 400


class TestPaymentMyHistory:
    def test_my_history_returns_payments(self, db, converted_bootcamper, pending_payment, approved_payment):
        client = make_client(converted_bootcamper)
        resp = client.get(MY_HISTORY_URL)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_my_history_salesperson_forbidden(self, db, salesperson_user):
        client = make_client(salesperson_user)
        resp = client.get(MY_HISTORY_URL)
        assert resp.status_code == 403


class TestPaymentQueue:
    def test_queue_returns_pending_only(self, db, salesperson_user, pending_payment, approved_payment):
        client = make_client(salesperson_user)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]['status'] == Payment.Status.PENDING

    def test_queue_filtered_by_program(self, db, salesperson_user, pending_payment, program):
        client = make_client(salesperson_user)
        resp = client.get(f'{QUEUE_URL}?program_id={program.id}')
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_queue_response_includes_new_ocr_fields(self, db, salesperson_user, pending_payment):
        """ocr_payment_date and ocr_confidence must be present in queue list items."""
        client = make_client(salesperson_user)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        item = data[0]
        assert 'ocr_payment_date' in item
        assert 'ocr_confidence' in item

    def test_queue_bootcamper_forbidden(self, db, converted_bootcamper):
        client = make_client(converted_bootcamper)
        resp = client.get(QUEUE_URL)
        assert resp.status_code == 403


class TestPaymentApprove:
    def test_approve_payment_success(self, db, salesperson_user, pending_payment):
        client = make_client(salesperson_user)
        with patch('apps.payments.tasks.send_payment_status_notification.delay'):
            resp = client.patch(APPROVE_URL.format(id=pending_payment.id), {
                'confirmed_amount':         '350.00',
                'confirmed_bank_name':      'Banco Pichincha',
                'confirmed_transaction_id': 'TXN123456',
            }, format='json')
        assert resp.status_code == 200
        pending_payment.refresh_from_db()
        assert pending_payment.status == Payment.Status.APPROVED
        assert pending_payment.confirmed_amount == Decimal('350.00')
        assert pending_payment.validated_by == salesperson_user

    def test_approve_already_approved_fails(self, db, salesperson_user, approved_payment):
        client = make_client(salesperson_user)
        resp = client.patch(APPROVE_URL.format(id=approved_payment.id), {
            'confirmed_amount': '400.00',
        }, format='json')
        assert resp.status_code == 400
        assert resp.json()['code'] == 'NOT_PENDING'


class TestPaymentReject:
    def test_reject_payment_success(self, db, salesperson_user, pending_payment):
        client = make_client(salesperson_user)
        with patch('apps.payments.tasks.send_payment_status_notification.delay'):
            resp = client.patch(REJECT_URL.format(id=pending_payment.id), {
                'rejection_reason': 'El comprobante es ilegible.',
            }, format='json')
        assert resp.status_code == 200
        pending_payment.refresh_from_db()
        assert pending_payment.status == Payment.Status.REJECTED
        assert 'ilegible' in pending_payment.rejection_reason

    def test_reject_empty_reason_fails(self, db, salesperson_user, pending_payment):
        client = make_client(salesperson_user)
        resp = client.patch(REJECT_URL.format(id=pending_payment.id), {
            'rejection_reason': '',
        }, format='json')
        assert resp.status_code == 400


class TestPaymentOCRStatus:
    def test_ocr_status_returns_fields(self, db, converted_bootcamper, pending_payment):
        pending_payment.ocr_bank_name = 'Banco Pichincha'
        pending_payment.ocr_amount    = Decimal('300.00')
        pending_payment.save()
        client = make_client(converted_bootcamper)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data['ocr_bank_name'] == 'Banco Pichincha'
        assert data['ocr_amount'] == '300.00'

    def test_ocr_status_includes_date_and_confidence(self, db, converted_bootcamper, pending_payment):
        """New fields ocr_payment_date and ocr_confidence must appear in ocr-status response."""
        from datetime import date
        pending_payment.ocr_payment_date = date(2026, 6, 12)
        pending_payment.ocr_confidence   = {'bank_name': 0.85, 'amount': 0.75, 'overall': 0.80}
        pending_payment.save()
        client = make_client(converted_bootcamper)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data['ocr_payment_date'] == '2026-06-12'
        assert data['ocr_confidence']['overall'] == 0.80

    def test_ocr_status_confidence_empty_dict_when_not_set(self, db, converted_bootcamper, pending_payment):
        """ocr_confidence defaults to {} — serializer must not blow up."""
        client = make_client(converted_bootcamper)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 200
        data = resp.json()
        assert 'ocr_confidence' in data
        assert data['ocr_confidence'] == {}

    def test_ocr_status_other_bootcamper_forbidden(self, db, bootcamper_user, pending_payment):
        client = make_client(bootcamper_user)
        resp = client.get(OCR_STATUS_URL.format(id=pending_payment.id))
        assert resp.status_code == 404


class TestPaymentMonitoring:
    def test_monitoring_without_program_id_returns_all(self, db, salesperson_user, approved_payment):
        client = make_client(salesperson_user)
        resp = client.get(MONITORING_URL)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_monitoring_returns_bootcamper_summaries(self, db, salesperson_user, program, approved_payment):
        client = make_client(salesperson_user)
        resp = client.get(f'{MONITORING_URL}?program_id={program.id}')
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert 'total_paid' in data[0]
        assert 'is_critical' in data[0]


class TestNotifyCoordinator:
    def test_notify_coordinator_dispatches_task(self, db, salesperson_user, converted_bootcamper, program):
        client = make_client(salesperson_user)
        with patch('apps.notifications.tasks.send_late_payment_alert.delay') as mock_delay:
            resp = client.post(
                NOTIFY_COORD_URL.format(bootcamper_id=converted_bootcamper.id),
                {'program_id': str(program.id)},
                format='json',
            )
        assert resp.status_code == 200
        mock_delay.assert_called_once_with(str(converted_bootcamper.id), str(program.id))
