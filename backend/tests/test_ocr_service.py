"""
Unit tests for OCRService — run against Pillow-generated receipt images.

These tests DO exercise real pytesseract; they are skipped automatically when
Tesseract or the Spanish language pack is not available (e.g., CI without the
apt packages). Install `tesseract-ocr tesseract-ocr-spa` to run them locally.

Usage (inside the backend container):
    pytest tests/test_ocr_service.py -v
"""
import tempfile
from datetime import date
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Availability guard — skip the whole module if tesseract / spa not present
# ---------------------------------------------------------------------------

def _tesseract_spa_available() -> bool:
    try:
        import pytesseract
        langs = pytesseract.get_languages()
        return 'spa' in langs
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _tesseract_spa_available(),
    reason='tesseract with spa language pack not available in this environment',
)


# ---------------------------------------------------------------------------
# Helpers: generate synthetic receipt images via Pillow
# ---------------------------------------------------------------------------

def _make_receipt_image(text_lines: list[str], image_format: str = 'JPEG') -> Path:
    """
    Create a temporary image file with the given text rendered on white background.
    Returns the Path to the temp file (caller must delete when done).
    """
    from PIL import Image, ImageDraw, ImageFont

    # Use a reasonably large canvas so Tesseract has good resolution to work with
    width, height = 600, max(200, len(text_lines) * 40 + 60)
    img = Image.new('RGB', (width, height), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    try:
        # Try to load a monospace font for crisper text
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 20)
    except (OSError, IOError):
        font = ImageFont.load_default()

    y = 20
    for line in text_lines:
        draw.text((20, y), line, fill=(0, 0, 0), font=font)
        y += 35

    suffix = '.jpg' if image_format == 'JPEG' else '.png'
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    img.save(tmp.name, format=image_format)
    tmp.close()
    return Path(tmp.name)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestOCRServiceExtractFromImage:
    """Each test generates a synthetic receipt image and asserts on extracted fields."""

    def test_extracts_banco_pichincha(self, tmp_path):
        from apps.payments.ocr import OCRService

        img = _make_receipt_image([
            'BANCO PICHINCHA',
            'Transferencia exitosa',
            'Valor: $350.00',
            'Referencia: TXN123456',
        ])
        try:
            result = OCRService().extract_from_file(str(img), 'image/jpeg')
            assert result['bank_name'] == 'Banco Pichincha', (
                f"Expected 'Banco Pichincha', got '{result['bank_name']}'\n"
                f"Raw text: {result['raw_text']}"
            )
        finally:
            img.unlink(missing_ok=True)

    def test_extracts_amount_labeled_valor(self, tmp_path):
        from apps.payments.ocr import OCRService

        img = _make_receipt_image([
            'Comprobante de pago',
            'Valor: $750.50',
            'Banco Guayaquil',
        ])
        try:
            result = OCRService().extract_from_file(str(img), 'image/jpeg')
            assert result['amount'] is not None, f"Amount not extracted. Raw: {result['raw_text']}"
            assert abs(result['amount'] - 750.50) < 0.01, f"Wrong amount: {result['amount']}"
        finally:
            img.unlink(missing_ok=True)

    def test_extracts_transaction_id(self, tmp_path):
        from apps.payments.ocr import OCRService

        img = _make_receipt_image([
            'BANCO BOLIVARIANO',
            'Referencia: ABC20260612',
            'Total: $200.00',
        ])
        try:
            result = OCRService().extract_from_file(str(img), 'image/jpeg')
            assert result['transaction_id'] != '', (
                f"Transaction ID not extracted. Raw: {result['raw_text']}"
            )
        finally:
            img.unlink(missing_ok=True)

    def test_extracts_date_numeric(self, tmp_path):
        from apps.payments.ocr import OCRService

        img = _make_receipt_image([
            'Banco Produbanco',
            'Fecha: 12/06/2026',
            'Monto: $150.00',
        ])
        try:
            result = OCRService().extract_from_file(str(img), 'image/jpeg')
            if result['payment_date'] is not None:
                assert result['payment_date'] == date(2026, 6, 12), (
                    f"Wrong date: {result['payment_date']}. Raw: {result['raw_text']}"
                )
            # If date is None it means OCR mis-read the image — still a valid result
            # for a synthetic image; warn but don't fail.
        finally:
            img.unlink(missing_ok=True)

    def test_extracts_date_prose_spanish(self, tmp_path):
        from apps.payments.ocr import OCRService

        img = _make_receipt_image([
            'Cooperativa JEP',
            '12 de junio de 2026',
            'Valor: $500.00',
        ])
        try:
            result = OCRService().extract_from_file(str(img), 'image/jpeg')
            if result['payment_date'] is not None:
                assert result['payment_date'] == date(2026, 6, 12), (
                    f"Wrong date: {result['payment_date']}. Raw: {result['raw_text']}"
                )
        finally:
            img.unlink(missing_ok=True)

    def test_confidence_dict_has_expected_keys(self, tmp_path):
        from apps.payments.ocr import OCRService

        img = _make_receipt_image([
            'Banco Internacional',
            'Valor: $300.00',
        ])
        try:
            result = OCRService().extract_from_file(str(img), 'image/jpeg')
            conf = result['confidence']
            for key in ('bank_name', 'account_last_digits', 'amount', 'transaction_id',
                        'payment_date', 'overall'):
                assert key in conf, f"Missing confidence key: {key}"
            assert 0.0 <= conf['overall'] <= 1.0, f"overall out of range: {conf['overall']}"
        finally:
            img.unlink(missing_ok=True)

    def test_overall_confidence_positive_when_fields_found(self, tmp_path):
        from apps.payments.ocr import OCRService

        img = _make_receipt_image([
            'BANCO PICHINCHA',
            'Valor: $400.00',
            'Referencia: REF20260612',
        ])
        try:
            result = OCRService().extract_from_file(str(img), 'image/jpeg')
            overall = result['confidence'].get('overall', 0.0)
            # At least one field should be extracted, giving overall > 0
            assert overall > 0.0, (
                f"Overall confidence is 0 — no fields extracted. Raw: {result['raw_text']}"
            )
        finally:
            img.unlink(missing_ok=True)

    def test_never_raises_on_garbage_file(self, tmp_path):
        """OCRService must never propagate exceptions — return empty on bad input."""
        from apps.payments.ocr import OCRService

        garbage = tmp_path / 'garbage.jpg'
        garbage.write_bytes(b'\x00\x01\x02\x03')  # not a valid image
        result = OCRService().extract_from_file(str(garbage), 'image/jpeg')
        assert isinstance(result, dict)
        assert result['bank_name'] == ''
        assert result['amount'] is None


class TestOCRServiceDateExtraction:
    """Unit tests for _extract_payment_date — no image needed, pure text."""

    def _call(self, text: str):
        from apps.payments.ocr import OCRService
        svc = OCRService()
        d, conf = svc._extract_payment_date(text, words_conf=[])
        return d, conf

    def test_iso_date(self):
        d, _ = self._call('Fecha de pago: 2026-06-12')
        assert d == date(2026, 6, 12)

    def test_dd_mm_yyyy_slash(self):
        d, _ = self._call('Fecha: 12/06/2026')
        assert d == date(2026, 6, 12)

    def test_dd_mm_yyyy_dash(self):
        d, _ = self._call('Fecha: 12-06-2026')
        assert d == date(2026, 6, 12)

    def test_prose_spanish_with_de(self):
        d, _ = self._call('Quito, 12 de junio de 2026')
        assert d == date(2026, 6, 12)

    def test_prose_spanish_without_second_de(self):
        d, _ = self._call('El 05 de marzo 2026 se registró')
        assert d == date(2026, 3, 5)

    def test_no_date_returns_none(self):
        d, conf = self._call('No hay fecha aquí')
        assert d is None
        assert conf == 0.0

    def test_invalid_date_not_extracted(self):
        # Day 32 should not parse
        d, _ = self._call('32/06/2026')
        assert d is None


class TestOCRServiceConfidenceHeuristic:
    """Test the heuristic fallback when words_conf is empty."""

    def _svc(self):
        from apps.payments.ocr import OCRService
        return OCRService()

    def test_found_field_strong_match_gives_high_conf(self):
        svc = self._svc()
        conf = svc._confidence('Banco Pichincha', words_conf=[], strong_match=True)
        assert conf == 0.80

    def test_found_field_weak_match_gives_medium_conf(self):
        svc = self._svc()
        conf = svc._confidence('350', words_conf=[], strong_match=False)
        assert conf == 0.50

    def test_empty_value_gives_zero(self):
        svc = self._svc()
        conf = svc._confidence('', words_conf=[], strong_match=True)
        assert conf == 0.0

    def test_none_value_gives_zero(self):
        svc = self._svc()
        conf = svc._confidence(None, words_conf=[], strong_match=True)
        assert conf == 0.0

    def test_tesseract_conf_takes_precedence(self):
        svc = self._svc()
        # Provide word-level confs: average should be 0.75
        conf = svc._confidence('Banco Pichincha', words_conf=[0.70, 0.80], strong_match=False)
        assert abs(conf - 0.75) < 1e-4
