"""
Unit tests for OCRService.

Two tiers:
  1. Deterministic unit tests — exercise helpers directly with real OCR text
     fragments (no image files, no Tesseract required).  Always run.
  2. Integration tests — call extract_from_file() on real receipt images.
     Auto-skipped when tesseract-spa is not available.

Usage (inside the backend container):
    pytest tests/test_ocr_service.py -v
"""
import tempfile
from datetime import date
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _svc():
    from apps.payments.ocr import OCRService
    return OCRService()


def _tesseract_spa_available() -> bool:
    try:
        import pytesseract
        return 'spa' in pytesseract.get_languages()
    except Exception:
        return False


NEED_TESSERACT = pytest.mark.skipif(
    not _tesseract_spa_available(),
    reason='tesseract with spa language pack not available',
)

# ---------------------------------------------------------------------------
# Real OCR text fragments (what Tesseract actually reads from each receipt)
# Used as ground truth for deterministic unit tests.
# ---------------------------------------------------------------------------

# banco_pichincha.jpeg — Banco Pichincha app (white background)
TEXT_PICHINCHA = """
BANCO PICHINCHA
¡Transferencia exitosa!
Número de comprobante: 4121055
Monto                           $ 50,00
Costo de transacción            $ 0,36
IVA                             $ 0,05
Cuenta origen
Nombre          Bohorquez Gorotiza Lucia Cristina
Número de cuenta                ******3912
Cuenta destino
Nombre          Torres Bohorquez Fernando Mauricio
Número de cuenta                ******7033
Banco           Banco De Guayaquil S.a
"""

# banco_bolivariano.jpeg — Banco Bolivariano via Zymovil (white)
TEXT_BOLIVARIANO = """
TRANSFERENCIA A TERCEROS
Vie 03/02/2023 20:55
Fecha contable 03/02/2023
Comprobante: 75325973
De
PAUL ALEXANDER MOSQUERA INTRIAGO, AHORROS
095XXXX838
Para
AYLUARDO GARCIA ANDY STEVEN, AHORROS
000XXXX225, BANCO BOLIVARIANO
Acreditación inmediata
25.00 USD
+ 0.00 USD (Servicios financieros)
"""

# banco_pacifico.jpeg — Banco del Pacífico web (light background)
TEXT_PACIFICO = """
Banco del Pacífico COMPROBANTE DE TRANSACCION
Transferencias internas
DESDE LA CUENTA    10XXXXXX47
VALOR              5.00
CARGO              0.00 + IVA
PARA LA CUENTA     10XXXXXX91
A NOMBRE DE        Munizaga Torres Juan Andres
REFERENCIA         Juanito presto cinco
EMAIL              jmunizagatorres@gmail.com
Intermático - Fecha - 2022-08-11 - Hora 10:39:53 Hs.
"""

# banco_guayaquil.jpeg — Banco Guayaquil dark mode
TEXT_GUAYAQUIL_DARK = """
$6.00
Para: Celex Almuerzo
Cuenta de Ahorros XXXX325
Banco Guayaquil
"""

# espoltech/bg_juan.jpeg — real bootcamp payment Banco Guayaquil
TEXT_ESPOLTECH_JUAN = """
Banco Guayaquil         No.0011191243
$1,600.00
Pago 1 de 2 JM
31/03/2026 17:19:12
Tu transferencia llegará de forma inmediata
Munizaga Torres Juan Andres
Ahorros - 001XXX7911
Bce Empresa Publica De Servici
Banco Guayaquil Corriente - 1XXX8640
Comisión                $0.00
Valor debitado          $1,600.00
"""

# espoltech/bg_nahin1.jpeg
TEXT_ESPOLTECH_NAHIN1 = """
Banco Guayaquil         No.0004581099
$1,000.00
TRANSFERENCIA INTERNA OTRAS CTAS
30/04/2026 10:58:11
Cevallos Vinces Nahin Jussephe
Ahorros - 004XXX1806
Bce Empresa Publica De Servici
Banco Guayaquil Corriente - 1XXX8640
Comisión                $0.00
Valor debitado          $1,000.00
"""

# espoltech/bg_nahin2.jpeg
TEXT_ESPOLTECH_NAHIN2 = """
Banco Guayaquil         No.0014001876
$600.00
2do pago Bootcamps Nahin
02/06/2026 20:00:18
Cevallos Vinces Nahin Jussephe
Ahorros - 004XXX1806
Bce Empresa Publica De Servici
Banco Guayaquil Corriente - 1XXX8640
Comisión                $0.00
Valor debitado          $600.00
"""

EMPTY_WORDS: list[float] = []  # no Tesseract word-level conf (forces heuristic)


# ===========================================================================
# 1. _parse_decimal
# ===========================================================================

class TestParseDecimal:
    def test_comma_decimal_two_digits(self):
        assert _svc()._parse_decimal('50,00') == 50.0

    def test_us_comma_thousands_dot_decimal(self):
        assert _svc()._parse_decimal('1,600.00') == 1600.0

    def test_european_dot_thousands_comma_decimal(self):
        assert _svc()._parse_decimal('1.234,56') == 1234.56

    def test_plain_dot_decimal(self):
        assert _svc()._parse_decimal('25.00') == 25.0

    def test_plain_integer(self):
        assert _svc()._parse_decimal('600') == 600.0

    def test_small_amount(self):
        assert _svc()._parse_decimal('5.00') == 5.0

    def test_zero_fee(self):
        assert _svc()._parse_decimal('0.00') == 0.0

    def test_dollar_prefix_stripped(self):
        assert _svc()._parse_decimal('$1,600.00') == 1600.0


# ===========================================================================
# 2. _extract_amount  (deterministic, text-only)
# ===========================================================================

class TestExtractAmount:
    def _amount(self, text: str) -> float | None:
        val, _ = _svc()._extract_amount(text, EMPTY_WORDS)
        return val

    def test_pichincha_50_not_5000(self):
        """Coma decimal: Monto $ 50,00 must give 50.0, not 5000."""
        val = self._amount(TEXT_PICHINCHA)
        assert val is not None
        assert abs(val - 50.0) < 0.01, f'Expected 50.0, got {val}'

    def test_pichincha_excludes_fee_036(self):
        """Costo de transacción $0,36 must NOT be chosen."""
        val = self._amount(TEXT_PICHINCHA)
        assert val is None or abs(val - 0.36) > 0.01

    def test_bolivariano_25_without_dollar_sign(self):
        """25.00 USD (no $) must be captured."""
        val = self._amount(TEXT_BOLIVARIANO)
        assert val is not None
        assert abs(val - 25.0) < 0.01, f'Expected 25.0, got {val}'

    def test_bolivariano_excludes_services_000(self):
        """0.00 USD (Servicios financieros) must be excluded."""
        val = self._amount(TEXT_BOLIVARIANO)
        assert val is None or abs(val - 0.0) > 0.01

    def test_pacifico_valor_5(self):
        val = self._amount(TEXT_PACIFICO)
        assert val is not None
        assert abs(val - 5.0) < 0.01, f'Expected 5.0, got {val}'

    def test_pacifico_excludes_cargo_000(self):
        """CARGO 0.00 + IVA must be excluded."""
        val = self._amount(TEXT_PACIFICO)
        assert val is None or abs(val - 0.0) > 0.01

    def test_guayaquil_dark_6(self):
        val = self._amount(TEXT_GUAYAQUIL_DARK)
        assert val is not None
        assert abs(val - 6.0) < 0.01, f'Expected 6.0, got {val}'

    def test_espoltech_juan_1600_not_debitado(self):
        """Banner $1,600.00 chosen; Valor debitado $1,600.00 line excluded (same value
        here but we check the exclusion logic does not break the result)."""
        val = self._amount(TEXT_ESPOLTECH_JUAN)
        assert val is not None
        assert abs(val - 1600.0) < 0.01, f'Expected 1600.0, got {val}'

    def test_espoltech_nahin1_1000(self):
        val = self._amount(TEXT_ESPOLTECH_NAHIN1)
        assert val is not None
        assert abs(val - 1000.0) < 0.01

    def test_espoltech_nahin2_600(self):
        val = self._amount(TEXT_ESPOLTECH_NAHIN2)
        assert val is not None
        assert abs(val - 600.0) < 0.01

    def test_comision_zero_not_selected(self):
        """A receipt where the only dollar amount is the fee must return None."""
        text = 'Comisión $0.00\nValor debitado $0.00\n'
        val = self._amount(text)
        assert val is None or val == 0.0  # 0.0 is acceptable (no valid transfer amount)


# ===========================================================================
# 3. _extract_account_last_digits  (ORIGIN)
# ===========================================================================

class TestExtractAccountLastDigits:
    def _digits(self, text: str) -> str:
        val, _ = _svc()._extract_account_last_digits(text, EMPTY_WORDS)
        return val

    def test_star_mask_4_digits(self):
        assert self._digits('Número de cuenta ******3912') == '3912'

    def test_x_mask_3_digits(self):
        assert self._digits('Cuenta de Ahorros XXXX325') == '325'

    def test_leading_digits_x_mask_2_digits(self):
        assert self._digits('DESDE LA CUENTA 10XXXXXX47') == '47'

    def test_leading_digits_x_mask_3_digits(self):
        assert self._digits('095XXXX838') == '838'

    def test_espoltech_origin_7911(self):
        """Origin label 'Ahorros - 001XXX7911' should give 7911."""
        assert self._digits(TEXT_ESPOLTECH_JUAN) == '7911'

    def test_espoltech_nahin_origin_1806(self):
        assert self._digits(TEXT_ESPOLTECH_NAHIN1) == '1806'

    def test_no_mask_returns_empty(self):
        assert self._digits('No hay cuenta aquí.') == ''


# ===========================================================================
# 4. _extract_bank_name  (by position)
# ===========================================================================

class TestExtractBankName:
    def _bank(self, text: str) -> str:
        val, _ = _svc()._extract_bank_name(text, EMPTY_WORDS)
        return val

    def test_pichincha_header_wins_over_guayaquil_destination(self):
        """
        Pichincha receipt names Guayaquil as the destination bank.
        The issuing bank (Pichincha, first in text) must be returned.
        """
        assert self._bank(TEXT_PICHINCHA) == 'Banco Pichincha'

    def test_bolivariano_detected(self):
        assert self._bank(TEXT_BOLIVARIANO) == 'Banco Bolivariano'

    def test_pacifico_detected(self):
        assert self._bank(TEXT_PACIFICO) == 'Banco del Pacífico'

    def test_guayaquil_detected(self):
        assert self._bank(TEXT_GUAYAQUIL_DARK) == 'Banco Guayaquil'

    def test_espoltech_guayaquil(self):
        assert self._bank(TEXT_ESPOLTECH_JUAN) == 'Banco Guayaquil'

    def test_unknown_bank_returns_empty(self):
        assert self._bank('No bank mentioned here.') == ''


# ===========================================================================
# 5. _extract_transaction_id
# ===========================================================================

class TestExtractTransactionId:
    def _tx(self, text: str) -> str:
        val, _ = _svc()._extract_transaction_id(text, EMPTY_WORDS)
        return val

    def test_pichincha_comprobante_number(self):
        val = self._tx(TEXT_PICHINCHA)
        assert val == '4121055', f'Got: {val!r}'

    def test_bolivariano_comprobante_number(self):
        val = self._tx(TEXT_BOLIVARIANO)
        assert val == '75325973', f'Got: {val!r}'

    def test_pacifico_referencia_not_free_text(self):
        """'REFERENCIA Juanito presto cinco' must NOT be captured (no digits in 'Juanito')."""
        val = self._tx(TEXT_PACIFICO)
        assert val != 'Juanito', f'Got free text: {val!r}'

    def test_espoltech_no_prefix(self):
        """No.0011191243 → '0011191243'."""
        val = self._tx(TEXT_ESPOLTECH_JUAN)
        assert val == '0011191243', f'Got: {val!r}'

    def test_espoltech_nahin1(self):
        val = self._tx(TEXT_ESPOLTECH_NAHIN1)
        assert val == '0004581099', f'Got: {val!r}'

    def test_espoltech_nahin2(self):
        val = self._tx(TEXT_ESPOLTECH_NAHIN2)
        assert val == '0014001876', f'Got: {val!r}'


# ===========================================================================
# 6. _extract_payment_date
# ===========================================================================

class TestExtractPaymentDate:
    def _date(self, text: str) -> date | None:
        d, _ = _svc()._extract_payment_date(text, EMPTY_WORDS)
        return d

    def test_bolivariano_ddmmyyyy(self):
        assert self._date(TEXT_BOLIVARIANO) == date(2023, 2, 3)

    def test_pacifico_iso(self):
        assert self._date(TEXT_PACIFICO) == date(2022, 8, 11)

    def test_espoltech_juan_date(self):
        assert self._date(TEXT_ESPOLTECH_JUAN) == date(2026, 3, 31)

    def test_espoltech_nahin1_date(self):
        assert self._date(TEXT_ESPOLTECH_NAHIN1) == date(2026, 4, 30)

    def test_espoltech_nahin2_date(self):
        assert self._date(TEXT_ESPOLTECH_NAHIN2) == date(2026, 6, 2)

    def test_prose_spanish(self):
        d = self._date('Quito, 12 de junio de 2026')
        assert d == date(2026, 6, 12)

    def test_no_date_returns_none(self):
        assert self._date('No hay fecha aqui') is None


# ===========================================================================
# 7. Confidence heuristic (no images)
# ===========================================================================

class TestConfidenceHeuristic:
    def test_strong_match_gives_high_conf(self):
        assert _svc()._confidence('Banco Pichincha', EMPTY_WORDS, True) == 0.80

    def test_weak_match_gives_medium_conf(self):
        assert _svc()._confidence('350', EMPTY_WORDS, False) == 0.50

    def test_empty_gives_zero(self):
        assert _svc()._confidence('', EMPTY_WORDS, True) == 0.0

    def test_none_gives_zero(self):
        assert _svc()._confidence(None, EMPTY_WORDS, True) == 0.0

    def test_word_conf_takes_precedence(self):
        conf = _svc()._confidence('Banco', [0.70, 0.80], strong_match=False)
        assert abs(conf - 0.75) < 1e-4


# ===========================================================================
# 8. Integration tests (real images — skipped without tesseract-spa)
# ===========================================================================

RECEIPTS_DIR = Path(__file__).parent.parent / 'media' / 'receipts' / 'Comprobantes'

REAL_IMAGES = [
    (RECEIPTS_DIR / 'banco_pichincha.jpeg',          'Banco Pichincha',   50.0),
    (RECEIPTS_DIR / 'banco_guayaquil.jpeg',           'Banco Guayaquil',   6.0),
    (RECEIPTS_DIR / 'banco_pacifico.jpeg',            'Banco del Pacífico', 5.0),
    (RECEIPTS_DIR / 'banco_bolivariano.jpeg',         'Banco Bolivariano', 25.0),
    (RECEIPTS_DIR / 'espoltech' / 'bg_juan.jpeg',     'Banco Guayaquil',   1600.0),
    (RECEIPTS_DIR / 'espoltech' / 'bg_nahin1.jpeg',   'Banco Guayaquil',   1000.0),
    (RECEIPTS_DIR / 'espoltech' / 'bg_nahin2.jpeg',   'Banco Guayaquil',   600.0),
]


@NEED_TESSERACT
@pytest.mark.parametrize('img_path,expected_bank,expected_amount', REAL_IMAGES)
def test_real_image_bank_and_amount(img_path, expected_bank, expected_amount):
    """
    Integration: run full OCRService on each real receipt.
    Asserts bank name and amount (within 1 USD tolerance).
    Skips missing files gracefully.
    """
    if not img_path.exists():
        pytest.skip(f'Receipt not found: {img_path}')

    result = _svc().extract_from_file(str(img_path), 'image/jpeg')

    assert result['bank_name'] == expected_bank, (
        f'{img_path.name}: bank expected={expected_bank!r} got={result["bank_name"]!r}\n'
        f'Raw text: {result["raw_text"][:300]}'
    )
    assert result['amount'] is not None, (
        f'{img_path.name}: amount not extracted. Raw: {result["raw_text"][:300]}'
    )
    assert abs(result['amount'] - expected_amount) < 1.0, (
        f'{img_path.name}: amount expected={expected_amount} got={result["amount"]}\n'
        f'Raw text: {result["raw_text"][:300]}'
    )


@NEED_TESSERACT
def test_never_raises_on_garbage():
    """OCRService must never propagate exceptions."""
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
        f.write(b'\x00\x01\x02\x03')
        path = f.name
    result = _svc().extract_from_file(path, 'image/jpeg')
    assert isinstance(result, dict)
    assert result['bank_name'] == ''
    assert result['amount'] is None
    Path(path).unlink(missing_ok=True)
