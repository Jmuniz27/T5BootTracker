// Vista del comprobante subido por el bootcamper. Lo comparten la pantalla del
// bootcamper (revisar lo que leyó el OCR) y la de Finanzas (validar el pago),
// que es el documento oficial contra el que se aprueba.
//
// `url` es la URL firmada que emite el backend (`make_receipt_token`), no una
// ruta de archivo: el navegador la pide desde <img>/<object> sin poder adjuntar
// el JWT.
import { useTranslation } from 'react-i18next'

export default function ReceiptPreview({ url, type }) {
  const { t } = useTranslation()
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
        <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {t('payments.receipt.unavailable')}
      </div>
    )
  }
  if (type === 'pdf') {
    return (
      <>
        <object data={url} type="application/pdf" className="hidden sm:block w-full h-full rounded-lg">
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-2 p-4 text-center">
            {t('payments.receipt.pdfNoPreview')}
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#213A8E] font-medium hover:underline">
              {t('payments.receipt.openNewTab')}
            </a>
          </div>
        </object>
        {/* Los navegadores móviles no muestran PDFs embebidos y tampoco caen al
            contenido alternativo del <object>: dejan un rectángulo gris vacío,
            sin forma de llegar al documento. */}
        <div className="sm:hidden flex flex-col items-center justify-center h-full gap-2 p-4 text-center text-sm text-gray-500">
          {t('payments.receipt.mobileNoPreview')}
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#213A8E] font-medium hover:underline">
            {t('payments.receipt.openPdf')}
          </a>
        </div>
      </>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
      <img src={url} alt={t('payments.receipt.alt')} className="w-full h-full object-contain rounded-lg" />
    </a>
  )
}
