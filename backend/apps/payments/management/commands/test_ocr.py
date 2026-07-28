"""
Management command: test_ocr — run OCRService against a local receipt file.

Usage (inside the backend container or virtualenv):
    python manage.py test_ocr <path_to_file> [--pdf]

Examples:
    python manage.py test_ocr media/receipts/comprobante.jpg
    python manage.py test_ocr media/receipts/transfer.pdf --pdf

No database, authentication, or Celery required.  Use this command to iterate
quickly on regex patterns in ocr.py without going through the full upload flow.
"""

import os
from django.core.management.base import BaseCommand, CommandError


MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
}


class Command(BaseCommand):
    help = "Run OCRService against a local receipt file and print extracted fields + confidence."

    def add_arguments(self, parser):
        parser.add_argument("file_path", help="Path to the receipt file (image or PDF)")
        parser.add_argument(
            "--pdf",
            action="store_true",
            help="Force MIME type application/pdf (auto-detected from extension by default)",
        )

    def handle(self, *args, **options):
        from apps.payments.ocr import OCRService

        path = options["file_path"]
        if not os.path.isfile(path):
            raise CommandError(f"File not found: {path}")

        ext = os.path.splitext(path)[1].lower()
        if options["pdf"]:
            mime = "application/pdf"
        else:
            mime = MIME_BY_EXT.get(ext)
            if mime is None:
                raise CommandError(
                    f'Cannot determine MIME type for "{ext}". '
                    "Supported: .jpg .jpeg .png .pdf  — or pass --pdf explicitly."
                )

        self.stdout.write(
            self.style.MIGRATE_HEADING(f"\nRunning OCR on: {path}  [{mime}]\n")
        )

        result = OCRService().extract_from_file(path, mime)

        self.stdout.write(self.style.SUCCESS("── Extracted fields ──"))
        fields = [
            ("bank_name", result["bank_name"]),
            ("account_last_digits", result["account_last_digits"]),
            ("amount", result["amount"]),
            ("transaction_id", result["transaction_id"]),
            ("payment_date", result["payment_date"]),
            ("payer_name", result["payer_name"]),
            ("payer_identification", result["payer_identification"]),
            ("payer_email", result["payer_email"]),
            ("document_number", result["document_number"]),
        ]
        conf = result.get("confidence", {})
        for name, value in fields:
            score = conf.get(name, 0.0)
            bar = _conf_bar(score)
            label = str(value) if value is not None else "(not found)"
            self.stdout.write(f"  {name:<22} {label:<30} conf={score:.2f} {bar}")

        overall = conf.get("overall", 0.0)
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                f"  Overall confidence: {overall:.2f} {_conf_bar(overall)}"
            )
        )

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("── Raw OCR text ──"))
        raw = result.get("raw_text", "")
        if raw.strip():
            self.stdout.write(raw)
        else:
            self.stdout.write(
                self.style.ERROR(
                    "  (empty — check Tesseract install and language pack)"
                )
            )


def _conf_bar(score: float) -> str:
    """ASCII progress bar for confidence score 0.0–1.0."""
    filled = round(score * 10)
    return "[" + "█" * filled + "░" * (10 - filled) + "]"
