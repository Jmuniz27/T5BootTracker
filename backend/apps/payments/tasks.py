"""Celery tasks for payments app."""

import logging
from celery import shared_task
from django.conf import settings

from apps.notifications.emails import send_templated_email

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def process_payment_ocr(self, payment_id):
    """Run OCR on a payment receipt and populate ocr_* fields."""
    try:
        from .models import Payment
        from .ocr import OCRService

        payment = Payment.objects.get(id=payment_id)
        file_path = payment.receipt_file.path
        mime_type = (
            "application/pdf" if payment.receipt_file_type == "pdf" else "image/jpeg"
        )

        result = OCRService().extract_from_file(file_path, mime_type)

        payment.ocr_bank_name = result["bank_name"]
        payment.ocr_account_last_digits = result["account_last_digits"]
        payment.ocr_amount = result["amount"]
        payment.ocr_transaction_id = result["transaction_id"]
        payment.ocr_payment_date = result["payment_date"]
        payment.ocr_confidence = result["confidence"]
        payment.ocr_raw_text = result["raw_text"]
        payment.payer_name = result["payer_name"]
        payment.payer_email = result["payer_email"]
        payment.payer_identification = result["payer_identification"]
        payment.document_number = result["document_number"]
        payment.save(
            update_fields=[
                "ocr_bank_name",
                "ocr_account_last_digits",
                "ocr_amount",
                "ocr_transaction_id",
                "ocr_payment_date",
                "ocr_confidence",
                "ocr_raw_text",
                "payer_name",
                "payer_email",
                "payer_identification",
                "document_number",
            ]
        )
        logger.info("OCR completed for payment %s.", payment_id)

    except Exception as exc:
        logger.exception("OCR task failed for payment %s.", payment_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_payment_status_notification(self, payment_id, new_status):
    """Notify the bootcamper that their payment was approved or rejected."""
    try:
        from .models import Payment

        payment = Payment.objects.select_related("bootcamper", "program").get(
            id=payment_id
        )
        bootcamper = payment.bootcamper

        recipient_name = bootcamper.get_full_name()

        if new_status == Payment.Status.APPROVED:
            send_templated_email(
                template="payment_approved",
                context={
                    "recipient_name": recipient_name,
                    "amount": payment.confirmed_amount,
                    "program_name": payment.program.name,
                },
                subject=f"Pago aprobado — {payment.program.name}",
                to=[bootcamper.email],
            )
        else:
            send_templated_email(
                template="payment_rejected",
                context={
                    "recipient_name": recipient_name,
                    "program_name": payment.program.name,
                    "rejection_reason": payment.rejection_reason,
                    "upload_url": f"{settings.FRONTEND_URL}/payments",
                },
                subject=f"Pago rechazado — {payment.program.name}",
                to=[bootcamper.email],
            )

        logger.info("Payment status notification sent for payment %s.", payment_id)

    except Exception as exc:
        logger.exception(
            "Error sending payment status notification for %s.", payment_id
        )
        raise self.retry(exc=exc)
