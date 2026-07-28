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

        return "spa" in pytesseract.get_languages()
    except Exception:
        return False


NEED_TESSERACT = pytest.mark.skipif(
    not _tesseract_spa_available(),
    reason="tesseract with spa language pack not available",
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

# ---------------------------------------------------------------------------
# Fase 4: raw OCR text from the blind test corpus (test/ folder)
# ---------------------------------------------------------------------------

# WhatsApp 10:51 — Pichincha $20 (label + mask fully garbled by OCR)
TEXT_TEST_PICHINCHA20 = """
7 BANCO PICHINCHA

¡Transferencia exitosa!

$ 20.00

A Torres Rangel Andrea...
El 27 de abril de 2026
De Andrade Veloz Mariu |...

Cuenta destino AA 27D4
Banco destino Banco Pichincha
CUORE OAEeea. 8890
N* de comprobante 900718118
Motivo Transferencia

Verificar la transacción con este QR.
"""

# WhatsApp 10:54 — Guayaquil $40 (OCR reads leading 0 as O → 0O3XXX4662)
TEXT_TEST_GUAYAQUIL40 = """
Banco
Guayaquil No.0004485746

$40.00

Playa 2026

30/04/2026 40/4897

Tu transferencia llegará de forma inmediata

Diaz Tapia Zahid Alejandro
Ahorros - 0O3XXX4662

Munizaga Torres Juan Andres
Banco Guayaquil Ahorros - 001XXX7911

Comisión $0.00

Valor debitado $40.00
"""

# WhatsApp 10:54 (1) — Pichincha $37.99 ("Cuenta origen" label + full account digits)
TEXT_TEST_PICHINCHA3799 = """
* BANCO PICHINCHA

¡Transferencia exitosa!

S 37.99

A Junaid Hadeel Ammar Ahmed
El 15 de abril de 2026

De Munizaga Torres Juan Andres

Cuenta destino ***** 8220
Banco destino Banco Pichincha
Cuenta origen 221336 2942
N* de comprobante 3759105
Motivo Pedido Hoodie Ts
"""

# WhatsApp 10:54 (2) — DeUna / BdP notification (abbreviated month "may")
TEXT_TEST_DEUNA = """
Envío realizado

Isabella ha enviado $8.61 a tu cuenta 001...7911
de Banco Guayaquil

Martes, 26 may 2026 - 19:16
Número de comprobante: 19122026052619161225

La transferencia se acreditará de
forma inmediata.
"""

# WhatsApp 10:54 (3) — Guayaquil $13 (OCR reads leading 0 as O → 0O4XXX8860)
TEXT_TEST_GUAYAQUIL13 = """
Cua quil No.0012054960

$13.00

Zapatera saltamonte

22/05/2026/13/05:49

Tu transferencia llegará de forma inmediata

Munizaga Torres Jose Daniel
Ahorros - 0O4XXX8860

Munizaga Torres Juan Andres
Banco Guayaquil Ahorros - 1xXXX7911

Comisión $0.00

Valor debitado $13.00
"""

EMPTY_WORDS: list[float] = []  # no Tesseract word-level conf (forces heuristic)


# ===========================================================================
# 1. _parse_decimal
# ===========================================================================


class TestParseDecimal:
    def test_comma_decimal_two_digits(self):
        assert _svc()._parse_decimal("50,00") == 50.0

    def test_us_comma_thousands_dot_decimal(self):
        assert _svc()._parse_decimal("1,600.00") == 1600.0

    def test_european_dot_thousands_comma_decimal(self):
        assert _svc()._parse_decimal("1.234,56") == 1234.56

    def test_plain_dot_decimal(self):
        assert _svc()._parse_decimal("25.00") == 25.0

    def test_plain_integer(self):
        assert _svc()._parse_decimal("600") == 600.0

    def test_small_amount(self):
        assert _svc()._parse_decimal("5.00") == 5.0

    def test_zero_fee(self):
        assert _svc()._parse_decimal("0.00") == 0.0

    def test_dollar_prefix_stripped(self):
        assert _svc()._parse_decimal("$1,600.00") == 1600.0


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
        assert abs(val - 50.0) < 0.01, f"Expected 50.0, got {val}"

    def test_pichincha_excludes_fee_036(self):
        """Costo de transacción $0,36 must NOT be chosen."""
        val = self._amount(TEXT_PICHINCHA)
        assert val is None or abs(val - 0.36) > 0.01

    def test_bolivariano_25_without_dollar_sign(self):
        """25.00 USD (no $) must be captured."""
        val = self._amount(TEXT_BOLIVARIANO)
        assert val is not None
        assert abs(val - 25.0) < 0.01, f"Expected 25.0, got {val}"

    def test_bolivariano_excludes_services_000(self):
        """0.00 USD (Servicios financieros) must be excluded."""
        val = self._amount(TEXT_BOLIVARIANO)
        assert val is None or abs(val - 0.0) > 0.01

    def test_pacifico_valor_5(self):
        val = self._amount(TEXT_PACIFICO)
        assert val is not None
        assert abs(val - 5.0) < 0.01, f"Expected 5.0, got {val}"

    def test_pacifico_excludes_cargo_000(self):
        """CARGO 0.00 + IVA must be excluded."""
        val = self._amount(TEXT_PACIFICO)
        assert val is None or abs(val - 0.0) > 0.01

    def test_guayaquil_dark_6(self):
        val = self._amount(TEXT_GUAYAQUIL_DARK)
        assert val is not None
        assert abs(val - 6.0) < 0.01, f"Expected 6.0, got {val}"

    def test_espoltech_juan_1600_not_debitado(self):
        """Banner $1,600.00 chosen; Valor debitado $1,600.00 line excluded (same value
        here but we check the exclusion logic does not break the result)."""
        val = self._amount(TEXT_ESPOLTECH_JUAN)
        assert val is not None
        assert abs(val - 1600.0) < 0.01, f"Expected 1600.0, got {val}"

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
        text = "Comisión $0.00\nValor debitado $0.00\n"
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
        assert self._digits("Número de cuenta ******3912") == "3912"

    def test_x_mask_3_digits(self):
        assert self._digits("Cuenta de Ahorros XXXX325") == "325"

    def test_leading_digits_x_mask_2_digits(self):
        assert self._digits("DESDE LA CUENTA 10XXXXXX47") == "47"

    def test_leading_digits_x_mask_3_digits(self):
        assert self._digits("095XXXX838") == "838"

    def test_espoltech_origin_7911(self):
        """Origin label 'Ahorros - 001XXX7911' should give 7911."""
        assert self._digits(TEXT_ESPOLTECH_JUAN) == "7911"

    def test_espoltech_nahin_origin_1806(self):
        assert self._digits(TEXT_ESPOLTECH_NAHIN1) == "1806"

    def test_no_mask_returns_empty(self):
        assert self._digits("No hay cuenta aquí.") == ""

    # --- Fase 4: O/0 confusion + spaces + destination discard ---

    def test_o_as_zero_guayaquil40(self):
        """0O3XXX4662: Tesseract reads leading 0 as O — must still capture 4662."""
        assert self._digits(TEXT_TEST_GUAYAQUIL40) == "4662"

    def test_o_as_zero_guayaquil13(self):
        """0O4XXX8860: same O/0 confusion — must capture 8860, not the destination 7911."""
        assert self._digits(TEXT_TEST_GUAYAQUIL13) == "8860"

    def test_spaces_in_mask_pichincha3799(self):
        """'Cuenta origen 221336 2942': label-based fallback extracts 2942."""
        assert self._digits(TEXT_TEST_PICHINCHA3799) == "2942"

    def test_destination_tail_discarded_espoltech(self):
        """8640 is an ESPOL-TECH destination tail; 7911 must be returned as origin."""
        assert self._digits(TEXT_ESPOLTECH_JUAN) == "7911"

    def test_destination_tail_discarded_inline(self):
        """When the only masked account is a known destination tail, return empty."""
        text = "Banco Guayaquil Corriente - 1XXX8640\n"
        assert self._digits(text) == ""

    def test_star_mask_with_space(self):
        """'***** 8220' (space between mask and digits) must match."""
        assert self._digits("Cuenta destino ***** 8220") == "8220"


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
        assert self._bank(TEXT_PICHINCHA) == "Banco Pichincha"

    def test_bolivariano_detected(self):
        assert self._bank(TEXT_BOLIVARIANO) == "Banco Bolivariano"

    def test_pacifico_detected(self):
        assert self._bank(TEXT_PACIFICO) == "Banco del Pacífico"

    def test_guayaquil_detected(self):
        assert self._bank(TEXT_GUAYAQUIL_DARK) == "Banco Guayaquil"

    def test_espoltech_guayaquil(self):
        assert self._bank(TEXT_ESPOLTECH_JUAN) == "Banco Guayaquil"

    def test_unknown_bank_returns_empty(self):
        assert self._bank("No bank mentioned here.") == ""


# ===========================================================================
# 5. _extract_transaction_id
# ===========================================================================


class TestExtractTransactionId:
    def _tx(self, text: str) -> str:
        val, _ = _svc()._extract_transaction_id(text, EMPTY_WORDS)
        return val

    def test_pichincha_comprobante_number(self):
        val = self._tx(TEXT_PICHINCHA)
        assert val == "4121055", f"Got: {val!r}"

    def test_bolivariano_comprobante_number(self):
        val = self._tx(TEXT_BOLIVARIANO)
        assert val == "75325973", f"Got: {val!r}"

    def test_pacifico_referencia_not_free_text(self):
        """'REFERENCIA Juanito presto cinco' must NOT be captured (no digits in 'Juanito')."""
        val = self._tx(TEXT_PACIFICO)
        assert val != "Juanito", f"Got free text: {val!r}"

    def test_espoltech_no_prefix(self):
        """No.0011191243 → '0011191243'."""
        val = self._tx(TEXT_ESPOLTECH_JUAN)
        assert val == "0011191243", f"Got: {val!r}"

    def test_espoltech_nahin1(self):
        val = self._tx(TEXT_ESPOLTECH_NAHIN1)
        assert val == "0004581099", f"Got: {val!r}"

    def test_espoltech_nahin2(self):
        val = self._tx(TEXT_ESPOLTECH_NAHIN2)
        assert val == "0014001876", f"Got: {val!r}"


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
        d = self._date("Quito, 12 de junio de 2026")
        assert d == date(2026, 6, 12)

    def test_no_date_returns_none(self):
        assert self._date("No hay fecha aqui") is None

    # --- Fase 4: abbreviated Spanish month names ---

    def test_abbreviated_month_may(self):
        """'26 may 2026' (DeUna notification format) must parse correctly."""
        assert self._date("Martes, 26 may 2026 - 19:16") == date(2026, 5, 26)

    def test_abbreviated_month_abr(self):
        assert self._date("El 27 de abr de 2026") == date(2026, 4, 27)

    def test_abbreviated_month_dic(self):
        assert self._date("3 dic 2025") == date(2025, 12, 3)


# ===========================================================================
# 7. Confidence heuristic (no images)
# ===========================================================================


class TestConfidenceHeuristic:
    def test_strong_match_gives_high_conf(self):
        assert _svc()._confidence("Banco Pichincha", EMPTY_WORDS, True) == 0.80

    def test_weak_match_gives_medium_conf(self):
        assert _svc()._confidence("350", EMPTY_WORDS, False) == 0.50

    def test_empty_gives_zero(self):
        assert _svc()._confidence("", EMPTY_WORDS, True) == 0.0

    def test_none_gives_zero(self):
        assert _svc()._confidence(None, EMPTY_WORDS, True) == 0.0

    def test_word_conf_takes_precedence(self):
        conf = _svc()._confidence("Banco", [0.70, 0.80], strong_match=False)
        assert abs(conf - 0.75) < 1e-4


# ===========================================================================
# 7b. Billing field extractors (CR-009 / CB-123)
# ===========================================================================


class TestExtractPayerName:
    def _name(self, text: str) -> str:
        val, _ = _svc()._extract_payer_name(text, EMPTY_WORDS)
        return val

    def test_pichincha_nombre_label_under_cuenta_origen(self):
        assert self._name(TEXT_PICHINCHA) == "Bohorquez Gorotiza Lucia Cristina"

    def test_bolivariano_name_line_after_de(self):
        """No 'Nombre' label — name is the bare line right after 'De'; the
        trailing ', AHORROS' account-type suffix must be stripped."""
        assert self._name(TEXT_BOLIVARIANO) == "PAUL ALEXANDER MOSQUERA INTRIAGO"

    def test_pacifico_a_nombre_de_is_destination_not_payer(self):
        """'A NOMBRE DE' is the beneficiary — must NOT be returned as payer."""
        assert self._name(TEXT_PACIFICO) == ""

    def test_guayaquil_dark_no_origin_data_returns_empty(self):
        assert self._name(TEXT_GUAYAQUIL_DARK) == ""

    def test_espoltech_juan_guayaquil_app_layout(self):
        """No label at all — name sits right above 'Ahorros - ...'."""
        assert self._name(TEXT_ESPOLTECH_JUAN) == "Munizaga Torres Juan Andres"

    def test_inline_de_name_whatsapp_screenshot(self):
        """'De Andrade Veloz Mariu |...' — inline sender marker; trailing
        OCR noise ('|...') must be stripped."""
        assert self._name(TEXT_TEST_PICHINCHA20) == "Andrade Veloz Mariu"

    def test_guayaquil40_sender_before_recipient(self):
        assert self._name(TEXT_TEST_GUAYAQUIL40) == "Diaz Tapia Zahid Alejandro"

    def test_pichincha3799_inline_de_avoids_false_positive(self):
        """
        Regression: an earlier version kept scanning past 'Cuenta origen
        221336 2942' (a bare account line, no name subsection) until it
        wrongly grabbed 'Motivo Pedido Hoodie Ts' as the name. The inline
        'De Munizaga...' marker must be matched first and returned directly.
        """
        assert self._name(TEXT_TEST_PICHINCHA3799) == "Munizaga Torres Juan Andres"

    def test_deuna_notification_de_banco_is_not_a_name(self):
        """'de Banco Guayaquil' attributes the bank, not a sender — must not
        be returned as a payer name."""
        assert self._name(TEXT_TEST_DEUNA) == ""

    def test_guayaquil13_sender_before_recipient(self):
        assert self._name(TEXT_TEST_GUAYAQUIL13) == "Munizaga Torres Jose Daniel"

    def test_no_name_data_returns_empty(self):
        assert self._name("No hay nombre aquí.") == ""


class TestExtractPayerEmail:
    def _email(self, text: str) -> str:
        val, _ = _svc()._extract_payer_email(text, EMPTY_WORDS)
        return val

    def test_pacifico_email(self):
        assert self._email(TEXT_PACIFICO) == "jmunizagatorres@gmail.com"

    def test_no_email_returns_empty(self):
        assert self._email("Sin correo electrónico aquí.") == ""

    def test_first_email_wins(self):
        text = "Contacto: a@example.com y b@example.com"
        assert self._email(text) == "a@example.com"


class TestExtractDocumentNumber:
    def _doc(self, text: str) -> str:
        val, _ = _svc()._extract_document_number(text, EMPTY_WORDS)
        return val

    def test_pichincha_numero_de_comprobante_label(self):
        assert self._doc(TEXT_PICHINCHA) == "4121055"

    def test_bolivariano_comprobante_label(self):
        assert self._doc(TEXT_BOLIVARIANO) == "75325973"

    def test_no_document_number_returns_empty(self):
        assert self._doc("Sin comprobante aquí.") == ""


class TestExtractPayerIdentification:
    def _id(self, text: str) -> str:
        val, _ = _svc()._extract_payer_identification(text, EMPTY_WORDS)
        return val

    def test_cedula_10_digits(self):
        assert self._id("Cédula: 1713175071") == "1713175071"

    def test_ruc_13_digits_not_truncated(self):
        """Regression: alternation order must prefer the 13-digit RUC match
        over a truncated 10-digit prefix."""
        assert self._id("RUC 1792146739001") == "1792146739001"

    def test_no_identification_returns_empty(self):
        """Most receipts never include the payer's cédula/RUC — best effort."""
        assert self._id(TEXT_PICHINCHA) == ""


# ===========================================================================
# 8. Integration tests (real images — skipped without tesseract-spa)
# ===========================================================================

RECEIPTS_DIR = Path(__file__).parent.parent / "media" / "receipts" / "Comprobantes"

REAL_IMAGES = [
    (RECEIPTS_DIR / "banco_pichincha.jpeg", "Banco Pichincha", 50.0),
    (RECEIPTS_DIR / "banco_guayaquil.jpeg", "Banco Guayaquil", 6.0),
    (RECEIPTS_DIR / "banco_pacifico.jpeg", "Banco del Pacífico", 5.0),
    (RECEIPTS_DIR / "banco_bolivariano.jpeg", "Banco Bolivariano", 25.0),
    (RECEIPTS_DIR / "espoltech" / "bg_juan.jpeg", "Banco Guayaquil", 1600.0),
    (RECEIPTS_DIR / "espoltech" / "bg_nahin1.jpeg", "Banco Guayaquil", 1000.0),
    (RECEIPTS_DIR / "espoltech" / "bg_nahin2.jpeg", "Banco Guayaquil", 600.0),
]


@NEED_TESSERACT
@pytest.mark.parametrize("img_path,expected_bank,expected_amount", REAL_IMAGES)
def test_real_image_bank_and_amount(img_path, expected_bank, expected_amount):
    """
    Integration: run full OCRService on each real receipt.
    Asserts bank name and amount (within 1 USD tolerance).
    Skips missing files gracefully.
    """
    if not img_path.exists():
        pytest.skip(f"Receipt not found: {img_path}")

    result = _svc().extract_from_file(str(img_path), "image/jpeg")

    assert result["bank_name"] == expected_bank, (
        f"{img_path.name}: bank expected={expected_bank!r} got={result['bank_name']!r}\n"
        f"Raw text: {result['raw_text'][:300]}"
    )
    assert result["amount"] is not None, (
        f"{img_path.name}: amount not extracted. Raw: {result['raw_text'][:300]}"
    )
    assert abs(result["amount"] - expected_amount) < 1.0, (
        f"{img_path.name}: amount expected={expected_amount} got={result['amount']}\n"
        f"Raw text: {result['raw_text'][:300]}"
    )


TEST_DIR = RECEIPTS_DIR / "test"

# (img_path, expected_bank, expected_amount, expected_origin, expected_date)
# expected_origin=None  → field not visible in that receipt, skip assert
# expected_date=None    → unreliable (garbled OCR in banner), skip assert
BLIND_TEST_IMAGES = [
    (
        TEST_DIR / "WhatsApp Image 2026-06-12 at 10.51.52 AM.jpeg",
        "Banco Pichincha",
        20.0,
        None,  # mask fully garbled by OCR — not assertable
        date(2026, 4, 27),
    ),
    (
        TEST_DIR / "WhatsApp Image 2026-06-12 at 10.54.40 AM.jpeg",
        "Banco Guayaquil",
        40.0,
        "4662",  # 0O3XXX4662 → O/0 fix gives 4662
        None,  # year misread as 2020 by OCR — banner low contrast
    ),
    (
        TEST_DIR / "WhatsApp Image 2026-06-12 at 10.54.40 AM (1).jpeg",
        "Banco Pichincha",
        37.99,
        "2942",  # Cuenta origen 221336 2942 → label fallback
        date(2026, 4, 15),
    ),
    (
        TEST_DIR / "WhatsApp Image 2026-06-12 at 10.54.40 AM (2).jpeg",
        "Banco Guayaquil",
        8.61,
        None,  # notification format: sender not shown
        date(2026, 5, 26),  # "26 may 2026" — now parsed with abbreviated months
    ),
    (
        TEST_DIR / "WhatsApp Image 2026-06-12 at 10.54.40 AM (3).jpeg",
        "Banco Guayaquil",
        13.0,
        "8860",  # 0O4XXX8860 → O/0 fix gives 8860
        date(2026, 5, 22),
    ),
]


@NEED_TESSERACT
@pytest.mark.parametrize(
    "img_path,expected_bank,expected_amount,expected_origin,expected_date",
    BLIND_TEST_IMAGES,
)
def test_blind_corpus_bank_amount_origin_date(
    img_path, expected_bank, expected_amount, expected_origin, expected_date
):
    """
    Fase 4 integration: blind test corpus with account-origin and date assertions.
    Fields marked None are skipped (OCR limitation, not a code bug).
    """
    if not img_path.exists():
        pytest.skip(f"Receipt not found: {img_path}")

    result = _svc().extract_from_file(str(img_path), "image/jpeg")

    assert result["bank_name"] == expected_bank, (
        f"{img_path.name}: bank expected={expected_bank!r} got={result['bank_name']!r}"
    )
    assert (
        result["amount"] is not None and abs(result["amount"] - expected_amount) < 1.0
    ), f"{img_path.name}: amount expected={expected_amount} got={result['amount']}"
    if expected_origin is not None:
        assert result["account_last_digits"] == expected_origin, (
            f"{img_path.name}: origin expected={expected_origin!r} "
            f"got={result['account_last_digits']!r}\nRaw: {result['raw_text'][:400]}"
        )
    if expected_date is not None:
        assert result["payment_date"] == expected_date, (
            f"{img_path.name}: date expected={expected_date} got={result['payment_date']}"
        )


@NEED_TESSERACT
def test_never_raises_on_garbage():
    """OCRService must never propagate exceptions."""
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(b"\x00\x01\x02\x03")
        path = f.name
    result = _svc().extract_from_file(path, "image/jpeg")
    assert isinstance(result, dict)
    assert result["bank_name"] == ""
    assert result["amount"] is None
    Path(path).unlink(missing_ok=True)
