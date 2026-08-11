"""Cambios del flujo de pagos (Finanzas + Bootcamper).

Cubre: rechazo máx 300, soft-delete del rechazado / hard-delete del pendiente,
historial de Finanzas sin pendientes, edición de un pendiente por Finanzas,
plan de pagos por bootcamper, y re-subida de comprobante al reenviar.
"""
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.payments.models import Payment, PaymentPlan

REJECT_URL   = '/api/payments/{id}/reject/'
EDIT_URL     = '/api/payments/{id}/edit/'
MY_URL       = '/api/payments/my-payments/{id}/'
MY_HISTORY   = '/api/payments/my-history/'
FIN_HISTORY  = '/api/payments/history/'
FIN_PLAN     = '/api/payments/bootcampers/{id}/payment-plan/'
MY_PLAN      = '/api/payments/my-payment-plan/'
PLAN_FILE    = '/api/payments/payment-plans/{id}/file/'


def pdf(name='plan.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4 fake', content_type='application/pdf')


def xlsx(name='plan.xlsx'):
    return SimpleUploadedFile(
        name, b'PK\x03\x04 fake',
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


class TestRejectMaxLength:
    def test_rechazo_mayor_a_300_falla(self, db, auth_client, finance_user, pending_payment):
        client = auth_client(finance_user)
        resp = client.patch(
            REJECT_URL.format(id=pending_payment.id),
            {'rejection_reason': 'x' * 301}, format='json',
        )
        assert resp.status_code == 400

    def test_rechazo_de_300_pasa(self, db, auth_client, finance_user, pending_payment):
        client = auth_client(finance_user)
        resp = client.patch(
            REJECT_URL.format(id=pending_payment.id),
            {'rejection_reason': 'x' * 300}, format='json',
        )
        assert resp.status_code == 200


class TestDeleteSoftVsHard:
    def test_bootcamper_elimina_rechazado_queda_en_historial_finanzas(
        self, db, auth_client, converted_bootcamper, finance_user, rejected_payment
    ):
        # Soft-delete: no desaparece para Finanzas, queda marcado.
        resp = auth_client(converted_bootcamper).delete(MY_URL.format(id=rejected_payment.id))
        assert resp.status_code == 204

        rejected_payment.refresh_from_db()
        assert rejected_payment.deleted_at is not None
        assert rejected_payment.deleted_by == converted_bootcamper

        # No aparece en el dashboard del bootcamper.
        mine = auth_client(converted_bootcamper).get(MY_HISTORY).json()
        assert str(rejected_payment.id) not in [p['id'] for p in mine]

        # Sí aparece en el historial de Finanzas, marcado como eliminado.
        hist = auth_client(finance_user).get(
            FIN_HISTORY, {'bootcamper_id': str(converted_bootcamper.id)}
        ).json()
        fila = next(p for p in hist if p['id'] == str(rejected_payment.id))
        assert fila['is_deleted'] is True
        assert fila['deleted_by_name'] == converted_bootcamper.get_full_name()

    def test_bootcamper_elimina_pendiente_no_deja_rastro(
        self, db, auth_client, converted_bootcamper, finance_user, pending_payment
    ):
        resp = auth_client(converted_bootcamper).delete(MY_URL.format(id=pending_payment.id))
        assert resp.status_code == 204
        # Borrado real: ya no existe.
        assert not Payment.objects.filter(pk=pending_payment.id).exists()
        hist = auth_client(finance_user).get(
            FIN_HISTORY, {'bootcamper_id': str(converted_bootcamper.id)}
        ).json()
        assert str(pending_payment.id) not in [p['id'] for p in hist]

    def test_bootcamper_elimina_borrador(self, db, auth_client, converted_bootcamper, draft_payment):
        resp = auth_client(converted_bootcamper).delete(MY_URL.format(id=draft_payment.id))
        assert resp.status_code == 204
        assert not Payment.objects.filter(pk=draft_payment.id).exists()


class TestFinanceHistoryExcludesPending:
    def test_pendiente_no_esta_en_historial(
        self, db, auth_client, converted_bootcamper, finance_user, pending_payment, approved_payment
    ):
        hist = auth_client(finance_user).get(
            FIN_HISTORY, {'bootcamper_id': str(converted_bootcamper.id)}
        ).json()
        ids = [p['id'] for p in hist]
        assert str(pending_payment.id) not in ids
        assert str(approved_payment.id) in ids


class TestFinanceEditPending:
    def test_finanzas_edita_fecha_y_banco_de_un_pendiente(
        self, db, auth_client, finance_user, pending_payment
    ):
        resp = auth_client(finance_user).patch(
            EDIT_URL.format(id=pending_payment.id),
            {'ocr_payment_date': '2026-05-01', 'ocr_bank_name': 'Banco Guayaquil'},
            format='json',
        )
        assert resp.status_code == 200
        pending_payment.refresh_from_db()
        assert pending_payment.ocr_bank_name == 'Banco Guayaquil'
        assert str(pending_payment.ocr_payment_date) == '2026-05-01'

    def test_no_se_puede_editar_uno_no_pendiente(
        self, db, auth_client, finance_user, approved_payment
    ):
        resp = auth_client(finance_user).patch(
            EDIT_URL.format(id=approved_payment.id),
            {'ocr_bank_name': 'X'}, format='json',
        )
        assert resp.status_code == 400
        assert resp.json()['code'] == 'NOT_PENDING'


class TestPaymentPlan:
    def test_finanzas_sube_plan_pdf(self, db, auth_client, finance_user, converted_bootcamper):
        resp = auth_client(finance_user).put(
            FIN_PLAN.format(id=converted_bootcamper.id), {'file': pdf()}, format='multipart',
        )
        assert resp.status_code == 200
        assert resp.json()['file_type'] == 'pdf'
        assert PaymentPlan.objects.filter(bootcamper=converted_bootcamper).count() == 1

    def test_finanzas_sube_plan_excel(self, db, auth_client, finance_user, converted_bootcamper):
        resp = auth_client(finance_user).put(
            FIN_PLAN.format(id=converted_bootcamper.id), {'file': xlsx()}, format='multipart',
        )
        assert resp.status_code == 200
        assert resp.json()['file_type'] == 'excel'

    def test_reemplaza_el_anterior(self, db, auth_client, finance_user, converted_bootcamper):
        client = auth_client(finance_user)
        client.put(FIN_PLAN.format(id=converted_bootcamper.id), {'file': pdf()}, format='multipart')
        client.put(FIN_PLAN.format(id=converted_bootcamper.id), {'file': xlsx()}, format='multipart')
        assert PaymentPlan.objects.filter(bootcamper=converted_bootcamper).count() == 1

    def test_tipo_invalido_se_rechaza(self, db, auth_client, finance_user, converted_bootcamper):
        jpg = SimpleUploadedFile('x.jpg', b'fake', content_type='image/jpeg')
        resp = auth_client(finance_user).put(
            FIN_PLAN.format(id=converted_bootcamper.id), {'file': jpg}, format='multipart',
        )
        assert resp.status_code == 400

    def test_bootcamper_ve_su_plan(self, db, auth_client, finance_user, converted_bootcamper):
        auth_client(finance_user).put(
            FIN_PLAN.format(id=converted_bootcamper.id), {'file': pdf()}, format='multipart',
        )
        resp = auth_client(converted_bootcamper).get(MY_PLAN)
        assert resp.status_code == 200
        assert resp.json()['file_type'] == 'pdf'

    def test_bootcamper_sin_plan_da_404(self, db, auth_client, converted_bootcamper):
        resp = auth_client(converted_bootcamper).get(MY_PLAN)
        assert resp.status_code == 404
        assert resp.json()['code'] == 'NO_PLAN'

    def test_bootcamper_no_puede_subir_plan(self, db, auth_client, converted_bootcamper):
        resp = auth_client(converted_bootcamper).put(
            FIN_PLAN.format(id=converted_bootcamper.id), {'file': pdf()}, format='multipart',
        )
        assert resp.status_code == 403

    def test_otro_bootcamper_no_ve_el_archivo(
        self, db, auth_client, finance_user, converted_bootcamper, bootcamper_user
    ):
        auth_client(finance_user).put(
            FIN_PLAN.format(id=converted_bootcamper.id), {'file': pdf()}, format='multipart',
        )
        plan = PaymentPlan.objects.get(bootcamper=converted_bootcamper)
        resp = auth_client(bootcamper_user).get(PLAN_FILE.format(id=plan.id))
        assert resp.status_code == 403


class TestResubmitWithReceipt:
    def test_reenviar_con_comprobante_nuevo(
        self, db, auth_client, converted_bootcamper, rejected_payment
    ):
        nuevo = SimpleUploadedFile('nuevo.png', b'\x89PNG fake', content_type='image/png')
        resp = auth_client(converted_bootcamper).patch(
            MY_URL.format(id=rejected_payment.id),
            {'ocr_amount': '200.00', 'receipt_file': nuevo}, format='multipart',
        )
        assert resp.status_code == 200
        rejected_payment.refresh_from_db()
        assert rejected_payment.status == Payment.Status.PENDING
        assert rejected_payment.ocr_amount == Decimal('200.00')
        assert 'nuevo' in rejected_payment.receipt_file.name
