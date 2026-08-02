"""Tests for the OCR service."""
from unittest.mock import patch

from apps.payments.ocr import OCRService


class TestOCRExtractBankName:
    def test_extract_pichincha(self):
        text = 'Comprobante Banco Pichincha\nFecha: 2026-03-01'
        result, _conf = OCRService()._extract_bank_name(text, [])
        assert result == 'Banco Pichincha'

    def test_extract_pacífico(self):
        text = 'Transferencia exitosa\nbanco del pacifico\ncuenta: ****1234'
        result, _conf = OCRService()._extract_bank_name(text, [])
        assert result == 'Banco del Pacífico'

    def test_no_bank_found(self):
        text = 'Este texto no contiene nombre de banco conocido.'
        result, _conf = OCRService()._extract_bank_name(text, [])
        assert result == ''


class TestOCRExtractAmount:
    def test_extract_amount_valor_label(self):
        text = 'Valor: $250.00\nFecha: 01/03/2026'
        result, _conf = OCRService()._extract_amount(text, [])
        assert result == 250.0

    def test_extract_amount_monto_label(self):
        text = 'Monto: 400.50'
        result, _conf = OCRService()._extract_amount(text, [])
        assert result == 400.5

    def test_no_amount_found(self):
        text = 'Este comprobante no tiene monto reconocible.'
        result, _conf = OCRService()._extract_amount(text, [])
        assert result is None


class TestOCRGracefulFailure:
    def test_graceful_failure_on_corrupt_file(self, tmp_path):
        """extract_from_file never raises, returns empty dict on failure."""
        fake_file = tmp_path / 'corrupt.jpg'
        fake_file.write_bytes(b'not an image')

        with patch('apps.payments.ocr.OCRService._extract_from_image', side_effect=Exception('corrupt')):
            result = OCRService().extract_from_file(str(fake_file), 'image/jpeg')

        assert result['bank_name'] == ''
        assert result['amount'] is None
        assert result['transaction_id'] == ''
        assert result['raw_text'] == ''
        assert result['payer_name'] == ''
        assert result['payer_identification'] == ''
        assert result['payer_email'] == ''
        assert result['payer_address'] == ''
        assert result['payer_phone'] == ''
        assert result['document_number'] == ''


class TestOCRBillingFields:
    """CR-009 / CB-123: extract_from_file() must surface the new billing
    fields and their confidence scores alongside the existing OCR fields."""

    def test_result_includes_billing_field_keys(self, tmp_path):
        fake_file = tmp_path / 'corrupt.jpg'
        fake_file.write_bytes(b'not an image')

        with patch('apps.payments.ocr.OCRService._extract_from_image', side_effect=Exception('corrupt')):
            result = OCRService().extract_from_file(str(fake_file), 'image/jpeg')

        for field in ('payer_name', 'payer_identification', 'payer_email',
                      'payer_address', 'payer_phone', 'document_number'):
            assert field in result

    def test_field_scores_include_billing_confidence_keys(self):
        text = (
            'Banco Pichincha\n'
            'De Munizaga Torres Juan Andres\n'
            'Comprobante: 4121055\n'
            'Correo: jmunizaga@example.com\n'
        )
        with patch.object(OCRService, '_extract_from_image', return_value=(text, [])):
            result = OCRService().extract_from_file('dummy.jpg', 'image/jpeg')

        confidence = result['confidence']
        for field in ('payer_name', 'payer_email', 'payer_identification',
                      'document_number'):
            assert field in confidence
        assert result['payer_name'] == 'Munizaga Torres Juan Andres'
        assert result['payer_email'] == 'jmunizaga@example.com'
        assert result['document_number'] == '4121055'
