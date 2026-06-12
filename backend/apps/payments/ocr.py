"""OCR service for extracting payment data from receipt images and PDFs."""
import logging
import re
from datetime import date

logger = logging.getLogger(__name__)

# Ecuadorian banks that appear in payment receipts
KNOWN_BANKS = [
    'Banco Pichincha', 'Banco del Pacífico', 'Banco Guayaquil', 'Banco Internacional',
    'Banco Bolivariano', 'Banco Produbanco', 'Banco de Loja', 'Banco del Austro',
    'Banco Solidario', 'Banco Capital', 'Banecuador', 'Cooperativa JEP',
    'Cooperativa Juventud Ecuatoriana', 'Mutualista Pichincha',
]

BANK_ALIASES = {
    'pichincha': 'Banco Pichincha',
    'pacifico': 'Banco del Pacífico',
    'pacífico': 'Banco del Pacífico',
    'guayaquil': 'Banco Guayaquil',
    'internacional': 'Banco Internacional',
    'bolivariano': 'Banco Bolivariano',
    'produbanco': 'Banco Produbanco',
    'loja': 'Banco de Loja',
    'austro': 'Banco del Austro',
    'solidario': 'Banco Solidario',
    'capital': 'Banco Capital',
    'banecuador': 'Banecuador',
    'jep': 'Cooperativa JEP',
    'juventud ecuatoriana': 'Cooperativa JEP',
    'mutualista': 'Mutualista Pichincha',
}

MONTHS_ES = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
    'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
    'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
}

# Heuristic confidence levels for pattern match strength
_CONF_HIGH   = 0.80  # Strong labeled pattern  (e.g. "valor: $350.00")
_CONF_MEDIUM = 0.50  # Weak/unlabeled pattern   (e.g. bare "$350")
_CONF_ZERO   = 0.00  # Field not found


class OCRService:
    """Extract structured payment data from receipt files."""

    def extract_from_file(self, file_path: str, mime_type: str) -> dict:
        """
        Main entry point. Returns dict with extracted fields plus confidence scores.
        Never raises — returns empty strings / None / 0.0 on failure.

        Returns:
            bank_name, account_last_digits, amount, transaction_id,
            payment_date, raw_text, confidence (dict per field + overall)
        """
        result = {
            'bank_name':           '',
            'account_last_digits': '',
            'amount':              None,
            'transaction_id':      '',
            'payment_date':        None,
            'raw_text':            '',
            'confidence':          {},
        }
        try:
            if mime_type == 'application/pdf':
                text, words_conf = self._extract_from_pdf(file_path)
            else:
                text, words_conf = self._extract_from_image(file_path)

            result['raw_text'] = text

            bank_name, bank_conf            = self._extract_bank_name(text, words_conf)
            account, account_conf           = self._extract_account_last_digits(text, words_conf)
            amount, amount_conf             = self._extract_amount(text, words_conf)
            transaction_id, tx_conf         = self._extract_transaction_id(text, words_conf)
            payment_date, date_conf         = self._extract_payment_date(text, words_conf)

            result['bank_name']           = bank_name
            result['account_last_digits'] = account
            result['amount']              = amount
            result['transaction_id']      = transaction_id
            result['payment_date']        = payment_date

            field_scores = {
                'bank_name':           bank_conf,
                'account_last_digits': account_conf,
                'amount':              amount_conf,
                'transaction_id':      tx_conf,
                'payment_date':        date_conf,
            }
            non_zero = [v for v in field_scores.values() if v > 0]
            field_scores['overall'] = round(sum(non_zero) / len(non_zero), 4) if non_zero else 0.0
            result['confidence'] = field_scores

        except Exception:
            logger.exception('OCR extraction failed for %s', file_path)
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: image / PDF → (text, word_confidences)
    # ──────────────────────────────────────────────────────────────────────────

    def _extract_from_image(self, file_path: str) -> tuple[str, list[float]]:
        """Run pytesseract on an image file. Returns (text, word_confidences)."""
        import pytesseract
        from PIL import Image
        from pytesseract import Output

        img = Image.open(file_path)
        text = pytesseract.image_to_string(img, lang='spa')
        data = pytesseract.image_to_data(img, lang='spa', output_type=Output.DICT)
        word_conf = [
            int(c) / 100
            for c, w in zip(data['conf'], data['text'])
            if str(c).lstrip('-').isdigit() and int(c) >= 0 and w.strip()
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
            # Fallback: treat PDF as image (only works for single-page image-PDFs)
            img = Image.open(file_path)
            pages = [img]

        texts, all_conf = [], []
        for page in pages:
            texts.append(pytesseract.image_to_string(page, lang='spa'))
            data = pytesseract.image_to_data(page, lang='spa', output_type=Output.DICT)
            all_conf.extend(
                int(c) / 100
                for c, w in zip(data['conf'], data['text'])
                if str(c).lstrip('-').isdigit() and int(c) >= 0 and w.strip()
            )
        return '\n'.join(texts), all_conf

    # ──────────────────────────────────────────────────────────────────────────
    # Confidence helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _word_level_confidence(self, value: str, words_conf: list[float]) -> float | None:
        """
        Try to derive confidence from Tesseract word scores.

        We use the average of all word confidences as a proxy for the overall
        quality of the region — finding the exact word-level score for a specific
        extracted value would require positional data we don't carry here.
        Returns None when words_conf is empty (caller will use heuristic fallback).
        """
        if not words_conf or not value:
            return None
        return round(sum(words_conf) / len(words_conf), 4)

    def _confidence(
        self,
        value: str | None,
        words_conf: list[float],
        strong_match: bool,
    ) -> float:
        """
        Hybrid confidence: Tesseract word-level average when available,
        heuristic fallback otherwise.
        """
        if not value:
            return _CONF_ZERO
        tess = self._word_level_confidence(value, words_conf)
        if tess is not None:
            return tess
        return _CONF_HIGH if strong_match else _CONF_MEDIUM

    # ──────────────────────────────────────────────────────────────────────────
    # Field extractors
    # ──────────────────────────────────────────────────────────────────────────

    def _extract_bank_name(
        self, text: str, words_conf: list[float]
    ) -> tuple[str, float]:
        lower = text.lower()
        for alias, canonical in BANK_ALIASES.items():
            if alias in lower:
                conf = self._confidence(canonical, words_conf, strong_match=True)
                return canonical, conf
        return '', _CONF_ZERO

    def _extract_account_last_digits(
        self, text: str, words_conf: list[float]
    ) -> tuple[str, float]:
        strong_patterns = [
            r'cuenta[:\s]*\*+(\d{4})',
            r'cta[:\s]*\*+(\d{4})',
            r'account[:\s]*\*+(\d{4})',
        ]
        weak_patterns = [
            r'\*{3,}(\d{4})\b',
        ]
        for p in strong_patterns:
            m = re.search(p, text, re.IGNORECASE)
            if m:
                val = m.group(1)
                return val, self._confidence(val, words_conf, strong_match=True)
        for p in weak_patterns:
            m = re.search(p, text, re.IGNORECASE)
            if m:
                val = m.group(1)
                return val, self._confidence(val, words_conf, strong_match=False)
        return '', _CONF_ZERO

    def _extract_amount(
        self, text: str, words_conf: list[float]
    ) -> tuple[float | None, float]:
        strong_patterns = [
            r'valor[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
            r'monto[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
            r'total[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
            r'amount[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
        ]
        weak_patterns = [
            r'\$\s*([\d,]+\.?\d{0,2})',
        ]
        for p in strong_patterns:
            m = re.search(p, text, re.IGNORECASE)
            if m:
                raw = m.group(1).replace(',', '')
                try:
                    val = float(raw)
                    return val, self._confidence(raw, words_conf, strong_match=True)
                except ValueError:
                    continue
        for p in weak_patterns:
            m = re.search(p, text, re.IGNORECASE)
            if m:
                raw = m.group(1).replace(',', '')
                try:
                    val = float(raw)
                    return val, self._confidence(raw, words_conf, strong_match=False)
                except ValueError:
                    continue
        return None, _CONF_ZERO

    def _extract_transaction_id(
        self, text: str, words_conf: list[float]
    ) -> tuple[str, float]:
        patterns = [
            (r'transacci[oó]n[:\s#]*([A-Z0-9]{6,20})', True),
            (r'referencia[:\s#]*([A-Z0-9]{6,20})',      True),
            (r'n[uú]mero[:\s#]*([A-Z0-9]{6,20})',       True),
            (r'ref[:\s#]*([A-Z0-9]{6,20})',              True),
            (r'comprobante[:\s#]*([A-Z0-9]{6,20})',      True),
        ]
        for p, strong in patterns:
            m = re.search(p, text, re.IGNORECASE)
            if m:
                val = m.group(1)
                return val, self._confidence(val, words_conf, strong_match=strong)
        return '', _CONF_ZERO

    def _extract_payment_date(
        self, text: str, words_conf: list[float]
    ) -> tuple[date | None, float]:
        """
        Extract payment date from text. Supports:
          - dd/mm/yyyy or dd-mm-yyyy (Ecuador standard)
          - yyyy-mm-dd  (ISO)
          - "12 de junio de 2026" (prose Spanish)
        Returns (date, confidence) or (None, 0.0).
        """
        # ISO: yyyy-mm-dd
        m = re.search(r'\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b', text)
        if m:
            try:
                d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                return d, self._confidence(str(d), words_conf, strong_match=True)
            except ValueError:
                pass

        # dd/mm/yyyy or dd-mm-yyyy
        m = re.search(
            r'\b(0[1-9]|[12]\d|3[01])[/-](0[1-9]|1[0-2])[/-](20\d{2})\b', text
        )
        if m:
            try:
                d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                return d, self._confidence(str(d), words_conf, strong_match=True)
            except ValueError:
                pass

        # "12 de junio de 2026" (or without "de")
        m = re.search(
            r'\b(\d{1,2})\s+de\s+(' + '|'.join(MONTHS_ES) + r')\s+(?:de\s+)?(20\d{2})\b',
            text, re.IGNORECASE,
        )
        if m:
            try:
                d = date(int(m.group(3)), MONTHS_ES[m.group(2).lower()], int(m.group(1)))
                return d, self._confidence(str(d), words_conf, strong_match=True)
            except ValueError:
                pass

        return None, _CONF_ZERO
