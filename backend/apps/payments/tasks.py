"""Celery tasks for payments app."""

import logging
from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

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

        if new_status == Payment.Status.APPROVED:
            subject = f"Pago aprobado — {payment.program.name}"
            text_body = (
                f"Hola {bootcamper.get_full_name()},\n\n"
                f"Tu pago por ${payment.confirmed_amount} ha sido aprobado "
                f"para el programa {payment.program.name}.\n\n"
                f"Gracias por tu puntualidad."
            )
            html_body = f"""
            <p>Hola <strong>{bootcamper.get_full_name()}</strong>,</p>
            <p>Tu pago por <strong>${payment.confirmed_amount}</strong> ha sido
            <span style="color:green">aprobado</span> para el programa
            <strong>{payment.program.name}</strong>.</p>
            <p>Gracias por tu puntualidad.</p>
            """
        else:
            subject = f"Pago rechazado — {payment.program.name}"
            text_body = (
                f"Hola {bootcamper.get_full_name()},\n\n"
                f"Tu pago ha sido rechazado.\n"
                f"Motivo: {payment.rejection_reason}\n\n"
                f"Por favor, contacta a tu coordinador para más información."
            )
            html_body = f"""
            <p>Hola <strong>{bootcamper.get_full_name()}</strong>,</p>
            <p>Tu pago ha sido <span style="color:red">rechazado</span>.</p>
            <p><strong>Motivo:</strong> {payment.rejection_reason}</p>
            <p>Por favor, contacta a tu coordinador para más información.</p>
            """

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[bootcamper.email],
        )
        msg.attach_alternative(html_body, "text/html")
        msg.send()
        logger.info("Payment status notification sent for payment %s.", payment_id)

    except Exception as exc:
        logger.exception(
            "Error sending payment status notification for %s.", payment_id
        )
        raise self.retry(exc=exc)
