"""OCR service for extracting payment data from receipt images and PDFs."""

import logging
import re
from datetime import date

logger = logging.getLogger(__name__)

# Ecuadorian banks that appear in payment receipts
BANK_ALIASES = {
    "pichincha": "Banco Pichincha",
    "pacifico": "Banco del Pacífico",
    "pacífico": "Banco del Pacífico",
    "guayaquil": "Banco Guayaquil",
    "internacional": "Banco Internacional",
    "bolivariano": "Banco Bolivariano",
    "produbanco": "Banco Produbanco",
    "loja": "Banco de Loja",
    "austro": "Banco del Austro",
    "solidario": "Banco Solidario",
    "capital": "Banco Capital",
    "banecuador": "Banecuador",
    "jep": "Cooperativa JEP",
    "juventud ecuatoriana": "Cooperativa JEP",
    "mutualista": "Mutualista Pichincha",
}

MONTHS_ES = {
    # Full names
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
    # Abbreviated (e.g. "26 may 2026" from DeUna / Banco del Pacífico notifications)
    "ene": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "sep": 9,
    "set": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12,
}

# ESPOL-TECH E.P. official destination account tails (last 4 digits of each account).
# These are public beneficiary account numbers — not secrets.
# Any masked account ending in one of these is the bootcamp's account (destination),
# not the payer's account (origin).
#   Pichincha   2100300388 → 0388
#   Produbanco  72006000126 → 0126
#   Pacífico    7427786    → 7786
#   Guayaquil   11138640   → 8640
ESPOLTECH_DESTINATION_TAILS = frozenset({"0388", "0126", "7786", "8640"})

# Lines that contain a fee / deduction rather than the transfer amount.
# We exclude any candidate whose line matches these keywords.
_EXCLUSION_RE = re.compile(
    r"costo|cargo|iva|comisi[oó]n|servicio|financier|impuesto"
    r"|valor debitado|total debitado|d[eé]bito",
    re.IGNORECASE,
)

# Heuristic confidence levels for pattern match strength
_CONF_HIGH = 0.80  # strong labeled pattern
_CONF_MEDIUM = 0.50  # weak / unlabeled pattern
_CONF_ZERO = 0.00  # not found


class OCRService:
    """Extract structured payment data from receipt files."""

    def extract_from_file(self, file_path: str, mime_type: str) -> dict:
        """
        Main entry point.  Returns a dict with all extracted fields + confidence.
        Never raises — returns empty / None / 0.0 on failure.
        """
        result = {
            "bank_name": "",
            "account_last_digits": "",
            "amount": None,
            "transaction_id": "",
            "payment_date": None,
            "raw_text": "",
            "confidence": {},
        }
        try:
            if mime_type == "application/pdf":
                text, words_conf = self._extract_from_pdf(file_path)
            else:
                text, words_conf = self._extract_from_image(file_path)

            result["raw_text"] = text

            bank_name, bank_conf = self._extract_bank_name(text, words_conf)
            account, account_conf = self._extract_account_last_digits(text, words_conf)
            amount, amount_conf = self._extract_amount(text, words_conf)
            tx_id, tx_conf = self._extract_transaction_id(text, words_conf)
            pay_date, date_conf = self._extract_payment_date(text, words_conf)

            result["bank_name"] = bank_name
            result["account_last_digits"] = account
            result["amount"] = amount
            result["transaction_id"] = tx_id
            result["payment_date"] = pay_date

            field_scores = {
                "bank_name": bank_conf,
                "account_last_digits": account_conf,
                "amount": amount_conf,
                "transaction_id": tx_conf,
                "payment_date": date_conf,
            }
            non_zero = [v for v in field_scores.values() if v > 0]
            field_scores["overall"] = (
                round(sum(non_zero) / len(non_zero), 4) if non_zero else 0.0
            )
            result["confidence"] = field_scores

        except Exception:
            logger.exception("OCR extraction failed for %s", file_path)
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # Image / PDF → (text, word_confidences)
    # ──────────────────────────────────────────────────────────────────────────

    def _preprocess(self, img):
        """
        Improve OCR accuracy: grayscale → auto-invert dark backgrounds →
        upscale small images → autocontrast.
        """
        from PIL import Image, ImageOps, ImageStat

        img = img.convert("L")

        # Auto-invert: dark background (white-on-black app screenshots)
        if ImageStat.Stat(img).mean[0] < 128:  # img ya es 'L' (1 canal)
            img = ImageOps.invert(img)

        # Upscale tiny captures so Tesseract has enough resolution
        w, h = img.size
        if w < 1000:
            scale = max(2, 1000 // w)
            img = img.resize((w * scale, h * scale), Image.LANCZOS)

        img = ImageOps.autocontrast(img)
        return img

    def _extract_from_image(self, file_path: str) -> tuple[str, list[float]]:
        """Run pytesseract on an image file. Returns (text, word_confidences)."""
        import pytesseract
        from PIL import Image
        from pytesseract import Output

        img = self._preprocess(Image.open(file_path))
        text = pytesseract.image_to_string(img, lang="spa")
        data = pytesseract.image_to_data(img, lang="spa", output_type=Output.DICT)
        word_conf = [
            int(c) / 100
            for c, w in zip(data["conf"], data["text"])
            if str(c).lstrip("-").isdigit() and int(c) >= 0 and w.strip()
        ]
        return text, word_conf

    def _extract_from_pdf(self, file_path: str) -> tuple[str, list[float]]:
        """Extract text from a PDF. Returns (text, word_confidences)."""
        import pytesseract
        from PIL import Image
        from pytesseract import Output

        try:
            import pdf2image

            pages = pdf2image.convert_from_path(file_path)
        except ImportError:
            pages = [Image.open(file_path)]

        texts, all_conf = [], []
        for page in pages:
            page = self._preprocess(page)
            texts.append(pytesseract.image_to_string(page, lang="spa"))
            data = pytesseract.image_to_data(page, lang="spa", output_type=Output.DICT)
            all_conf.extend(
                int(c) / 100
                for c, w in zip(data["conf"], data["text"])
                if str(c).lstrip("-").isdigit() and int(c) >= 0 and w.strip()
            )
        return "\n".join(texts), all_conf

    # ──────────────────────────────────────────────────────────────────────────
    # Confidence helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _word_level_confidence(
        self, value: str, words_conf: list[float]
    ) -> float | None:
        """Average Tesseract word confidence; None when unavailable."""
        if not words_conf or not value:
            return None
        return round(sum(words_conf) / len(words_conf), 4)

    def _confidence(self, value, words_conf: list[float], strong_match: bool) -> float:
        """Hybrid: Tesseract word-level average when available, heuristic fallback."""
        if not value:
            return _CONF_ZERO
        tess = self._word_level_confidence(str(value), words_conf)
        if tess is not None:
            return tess
        return _CONF_HIGH if strong_match else _CONF_MEDIUM

    # ──────────────────────────────────────────────────────────────────────────
    # Field extractors
    # ──────────────────────────────────────────────────────────────────────────

    def _extract_bank_name(
        self, text: str, words_conf: list[float]
    ) -> tuple[str, float]:
        """
        Return the bank whose alias appears earliest in the text.
        This resolves the "two banks on one receipt" problem: the issuing bank's
        logo/header is always first; the destination bank appears later.
        """
        lower = text.lower()
        best_pos, best_canonical = len(lower) + 1, ""
        for alias, canonical in BANK_ALIASES.items():
            pos = lower.find(alias)
            if pos != -1 and pos < best_pos:
                best_pos = pos
                best_canonical = canonical
        if best_canonical:
            return best_canonical, self._confidence(best_canonical, words_conf, True)
        return "", _CONF_ZERO

    def _extract_account_last_digits(
        self, text: str, words_conf: list[float]
    ) -> tuple[str, float]:
        """
        Extract the last 2–4 digits of the ORIGIN (sender) account.

        Improvements vs v1:
        - Mask class includes 'O'/'o' (Tesseract confusion with zero: 003→0O3).
        - Allows spaces between mask chars and trailing digits (*** 8220).
        - Discards ESPOLTECH_DESTINATION_TAILS — fixed bootcamp accounts so we
          never return the bootcamp's own account as the payer.
        - Label-based fallback for 'Cuenta origen' lines where the mask is fully
          garbled (e.g. Tesseract reads '****8890' as 'OAEeea. 8890').
        - Collects ALL candidates; prefers origin-labelled, else first by position
          (sender always appears before recipient in the Guayaquil app layout).
        """
        dest_tails = ESPOLTECH_DESTINATION_TAILS

        # Extended mask: leading digits/Os, 2+ mask chars (including O as zero),
        # optional spaces, then 2-4 trailing digits.
        mask_pat = re.compile(
            r"(?<!\w)[\doO]{0,4}[\*xXoO•·]{2,}[\s]*(\d{2,4})(?!\d)",
            re.IGNORECASE,
        )

        lines = text.splitlines()

        # Collect all candidates: (tail_digits, line_index, is_origin_labeled)
        candidates: list[tuple[str, int, bool]] = []

        for i, line in enumerate(lines):
            is_origin = bool(
                re.search(r"cuenta\s+(?:de\s+)?origen", line, re.IGNORECASE)
            )

            matched_on_line = False
            for m in mask_pat.finditer(line):
                tail = m.group(1)
                if tail not in dest_tails:
                    candidates.append((tail, i, is_origin))
                    matched_on_line = True

            # Fallback for "Cuenta origen" lines where the mask was garbled by OCR.
            # Grab the last digit sequence on the line (trailing account digits).
            if is_origin and not matched_on_line:
                digits = re.findall(r"\d{2,}", line)
                if digits:
                    tail = digits[-1][-4:]  # last up to 4 digits
                    if tail not in dest_tails:
                        candidates.append((tail, i, True))

        if not candidates:
            return "", _CONF_ZERO

        # Prefer origin-labelled candidates, else use document order (sender first)
        origin_candidates = [c for c in candidates if c[2]]
        pool = origin_candidates if origin_candidates else candidates

        val = pool[0][0]
        strong = bool(origin_candidates)
        return val, self._confidence(val, words_conf, strong_match=strong)

    def _parse_decimal(self, raw: str) -> float | None:
        """
        Robust decimal parser for EC / US number formats:
          50,00   → 50.00  (comma-as-decimal, 2 digits after)
          1.234,56 → 1234.56  (European: dot-thousands, comma-decimal)
          1,600.00 → 1600.00  (US: comma-thousands, dot-decimal)
          5.00     → 5.00
          25.00    → 25.00
        Rule: the LAST separator (comma or period) is the decimal separator,
        UNLESS the candidate after it has more than 2 digits (then it's thousands).
        """
        raw = raw.strip()
        # Remove currency symbols and whitespace
        raw = re.sub(r"[\$\s]", "", raw)

        # If no separator at all
        if "." not in raw and "," not in raw:
            try:
                return float(raw)
            except ValueError:
                return None

        last_comma = raw.rfind(",")
        last_dot = raw.rfind(".")

        if last_comma > last_dot:
            # Last separator is a comma → decimal separator
            after_comma = raw[last_comma + 1 :]
            if len(after_comma) <= 2:
                # 50,00 or 1.234,56
                normalized = (
                    raw[:last_comma].replace(".", "").replace(",", "")
                    + "."
                    + after_comma
                )
            else:
                # e.g. 1,234 (no decimal part) — treat comma as thousands
                normalized = raw.replace(",", "")
        else:
            # Last separator is a dot → decimal separator
            after_dot = raw[last_dot + 1 :]
            if len(after_dot) <= 2:
                # 5.00 or 1,600.00
                normalized = (
                    raw[:last_dot].replace(",", "").replace(".", "") + "." + after_dot
                )
            else:
                # e.g. 1.234 (no decimal part) — treat dot as thousands
                normalized = raw.replace(".", "")

        try:
            return float(normalized)
        except ValueError:
            return None

    def _extract_amount(
        self, text: str, words_conf: list[float]
    ) -> tuple[float | None, float]:
        """
        Extract the principal transfer amount, ignoring fees and debit totals.

        Priority:
          (a) Line with a strong label (monto/valor, NOT debitado) + $ or USD.
          (b) First $ amount that is NOT on an exclusion line.
          (c) Largest amount that is NOT on an exclusion line.
        """
        lines = text.splitlines()

        def _is_excluded(line: str) -> bool:
            return bool(_EXCLUSION_RE.search(line))

        # Pattern: optional label, optional $, number (handles coma/period separators)
        amount_re = re.compile(
            r"(?:(?P<label>monto|valor|total)[:\s]+)?"
            r"\$?\s*(?P<num>[\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}|\d+)"
            r"(?:\s*(?:USD|US\$))?",
            re.IGNORECASE,
        )

        # --- Pass 1: labeled strong matches (monto/valor, not debitado) ---
        labeled: list[tuple[float, bool]] = []  # (value, has_dollar)
        unlabeled_first: float | None = None
        all_valid: list[float] = []

        for line in lines:
            if _is_excluded(line):
                continue
            for m in amount_re.finditer(line):
                raw = m.group("num")
                val = self._parse_decimal(raw)
                if val is None or val <= 0:
                    continue
                has_dollar = "$" in line or "USD" in line.upper()
                has_decimal = "." in raw or "," in raw
                has_label = bool(m.group("label"))
                # Require currency signal OR decimal point for unlabeled candidates.
                # Pure integers without any signal are likely account numbers / codes.
                if not (has_dollar or has_decimal or has_label):
                    continue
                all_valid.append(val)
                if has_label:
                    labeled.append((val, has_dollar))
                elif unlabeled_first is None and has_dollar:
                    unlabeled_first = val

        if labeled:
            # Prefer labeled with $ first, then labeled without
            dollar_labeled = [v for v, has_d in labeled if has_d]
            chosen = dollar_labeled[0] if dollar_labeled else labeled[0][0]
            return chosen, self._confidence(str(chosen), words_conf, strong_match=True)

        if unlabeled_first is not None:
            return unlabeled_first, self._confidence(
                str(unlabeled_first), words_conf, False
            )

        if all_valid:
            chosen = max(all_valid)
            return chosen, self._confidence(str(chosen), words_conf, strong_match=False)

        return None, _CONF_ZERO

    def _extract_transaction_id(
        self, text: str, words_conf: list[float]
    ) -> tuple[str, float]:
        """
        Extract a transaction / comprobante reference number.

        Patterns (in priority order):
          1. No.XXXXXXX  (Guayaquil app: 'No.0011191243')
          2. comprobante: XXXXXXX
          3. transacción / referencia / ref
        Requires at least one digit in the captured value.
        """
        patterns = [
            # No. prefix (Banco Guayaquil app)
            (r"n[o°º][\.\s]*[:\s]*(\d{5,20})", True),
            (r"comprobante[:\s#]*(\d{5,20})", True),
            (r"transacci[oó]n[:\s#]*([A-Z0-9]{5,20})", True),
            (r"n[uú]mero[:\s#]*([A-Z0-9]{5,20})", True),
            (r"referencia[:\s#]*([A-Z0-9]{5,20})", True),
            (r"\bref[:\s#]*([A-Z0-9]{5,20})", True),
        ]
        for pattern, strong in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                val = m.group(1)
                # Must contain at least one digit (guards against free-text references)
                if re.search(r"\d", val):
                    return val, self._confidence(val, words_conf, strong_match=strong)
        return "", _CONF_ZERO

    def _extract_payment_date(
        self, text: str, words_conf: list[float]
    ) -> tuple[date | None, float]:
        """
        Extract payment date.  Supports:
          - dd/mm/yyyy or dd-mm-yyyy (Ecuador standard; optionally with time HH:MM:SS)
          - yyyy-mm-dd  (ISO)
          - "12 de junio de 2026" (prose Spanish)
        """
        # dd/mm/yyyy or dd-mm-yyyy (+ optional time)
        m = re.search(
            r"\b(0[1-9]|[12]\d|3[01])[/-](0[1-9]|1[0-2])[/-](20\d{2})"
            r"(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?",
            text,
        )
        if m:
            try:
                d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                return d, self._confidence(str(d), words_conf, strong_match=True)
            except ValueError:
                pass

        # ISO: yyyy-mm-dd
        m = re.search(
            r"\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b", text
        )
        if m:
            try:
                d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                return d, self._confidence(str(d), words_conf, strong_match=True)
            except ValueError:
                pass

        # Prose Spanish: "12 de junio de 2026" OR abbreviated "26 may 2026".
        # Sort month keys longest-first so 'septiembre' matches before 'sep'.
        month_alternation = "|".join(sorted(MONTHS_ES, key=len, reverse=True))
        m = re.search(
            r"\b(\d{1,2})\s+(?:de\s+)?("
            + month_alternation
            + r")\s+(?:de\s+)?(20\d{2})\b",
            text,
            re.IGNORECASE,
        )
        if m:
            try:
                d = date(
                    int(m.group(3)), MONTHS_ES[m.group(2).lower()], int(m.group(1))
                )
                return d, self._confidence(str(d), words_conf, strong_match=True)
            except ValueError:
                pass

        return None, _CONF_ZERO
