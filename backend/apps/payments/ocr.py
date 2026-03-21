"""OCR service for extracting payment data from receipt images and PDFs."""
import logging
import re

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


class OCRService:
    """Extract structured payment data from receipt files."""

    def extract_from_file(self, file_path: str, mime_type: str) -> dict:
        """
        Main entry point. Returns dict with extracted fields.
        Never raises — returns empty strings on failure.
        """
        result = {
            'bank_name':           '',
            'account_last_digits': '',
            'amount':              None,
            'transaction_id':      '',
            'raw_text':            '',
        }
        try:
            if mime_type == 'application/pdf':
                text = self._extract_from_pdf(file_path)
            else:
                text = self._extract_from_image(file_path)

            result['raw_text']            = text
            result['bank_name']           = self._extract_bank_name(text)
            result['account_last_digits'] = self._extract_account_last_digits(text)
            result['amount']              = self._extract_amount(text)
            result['transaction_id']      = self._extract_transaction_id(text)
        except Exception:
            logger.exception('OCR extraction failed for %s', file_path)
        return result

    def _extract_from_image(self, file_path: str) -> str:
        """Run pytesseract on an image file."""
        import pytesseract
        from PIL import Image
        img = Image.open(file_path)
        return pytesseract.image_to_string(img, lang='spa')

    def _extract_from_pdf(self, file_path: str) -> str:
        """Extract text from a PDF using Pillow + pytesseract on each page."""
        import pytesseract
        from PIL import Image
        try:
            import pdf2image
            pages = pdf2image.convert_from_path(file_path)
            return '\n'.join(pytesseract.image_to_string(page, lang='spa') for page in pages)
        except ImportError:
            # Fallback: treat PDF as image
            img = Image.open(file_path)
            return pytesseract.image_to_string(img, lang='spa')

    def _extract_bank_name(self, text: str) -> str:
        """Find a known Ecuadorian bank name in the text."""
        lower = text.lower()
        for alias, canonical in BANK_ALIASES.items():
            if alias in lower:
                return canonical
        return ''

    def _extract_account_last_digits(self, text: str) -> str:
        """Extract the last 4 digits of an account number."""
        patterns = [
            r'cuenta[:\s]*\*+(\d{4})',
            r'cta[:\s]*\*+(\d{4})',
            r'account[:\s]*\*+(\d{4})',
            r'\*{3,}(\d{4})\b',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return ''

    def _extract_amount(self, text: str) -> float | None:
        """Extract the payment amount (USD) from text."""
        patterns = [
            r'valor[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
            r'monto[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
            r'total[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
            r'amount[:\s]+\$?\s*([\d,]+\.?\d{0,2})',
            r'\$\s*([\d,]+\.?\d{0,2})',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                raw = match.group(1).replace(',', '')
                try:
                    return float(raw)
                except ValueError:
                    continue
        return None

    def _extract_transaction_id(self, text: str) -> str:
        """Extract a transaction or reference number."""
        patterns = [
            r'transacci[oó]n[:\s#]*([A-Z0-9]{6,20})',
            r'referencia[:\s#]*([A-Z0-9]{6,20})',
            r'n[uú]mero[:\s#]*([A-Z0-9]{6,20})',
            r'ref[:\s#]*([A-Z0-9]{6,20})',
            r'comprobante[:\s#]*([A-Z0-9]{6,20})',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return ''
