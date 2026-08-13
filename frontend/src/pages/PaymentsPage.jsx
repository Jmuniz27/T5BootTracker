import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyHistory, getMyStatus, getMyPrograms, getOCRStatus, uploadPayment, confirmPayment, getPrograms, updateMyPayment, deleteMyPayment, getMyPaymentLinks } from '../api/payments.api'
import { useModalA11y } from '../hooks/use-modal-a11y'
import Skeleton from '../components/ui/Skeleton'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/Toast'
import ReceiptPreview from '../components/payments/ReceiptPreview'
import PaymentPlanPanel from '../components/payments/PaymentPlanPanel'
import { flattenUploadError } from '../lib/payments'

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-500',
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
}

function dropZoneClass(dragOver, file) {
  if (dragOver) return 'border-[#213A8E] bg-blue-50'
  if (file) return 'border-green-400 bg-green-50'
  return 'border-gray-300 hover:border-[#213A8E] hover:bg-gray-50'
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

// El ancho mínimo va detrás de `sm:`: en móvil las tarjetas son celdas de una
// grilla de dos columnas y 160px fijos las hacían desbordar un Android de
// 360px (160+160+12 de gap + 32 de padding de página = 364).
function StatCard({ label, value, sub, loading, className = '' }) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <div aria-busy="true" aria-label={t('common.loading')} className={`bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 sm:min-w-[160px] ${className}`}>
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    )
  }
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 sm:min-w-[160px] transition-shadow duration-200 hover:shadow-md ${className}`}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, onSuccess, availableLinks = [] }) {
  const { t } = useTranslation()
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [dragOver, setDragOver] = useState(false)
  const hasPaymentLink = availableLinks.length > 0
  // CR-013: cuando hay enlace(s) de pago disponibles, el bootcamper elige si
  // lo que sube es un comprobante de transferencia o la evidencia de haber
  // pagado en uno de esos enlaces (no es un comprobante bancario, así que no
  // pasa por OCR). Con más de un enlace vigente, además indica cuál usó.
  const [paymentMethod, setPaymentMethod] = useState('TRANSFER')
  const [paymentLinkId, setPaymentLinkId] = useState(availableLinks[0]?.id || '')
  const fileRef = useRef(null)
  const qc = useQueryClient()
  const dialogRef = useModalA11y(onClose)

  const mutation = useMutation({
    mutationFn: uploadPayment,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['my-payments'] })
      onSuccess(data)
    },
  })

  const validateAndSetFile = (f) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    if (!allowed.includes(f.type)) {
      setErrors((prev) => ({ ...prev, file: t('payments.bootcamper.uploadModal.onlyFormats') }))
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, file: t('payments.bootcamper.uploadModal.maxSize') }))
      return
    }
    setErrors((prev) => ({ ...prev, file: null }))
    setFile(f)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!file) { setErrors({ file: t('payments.bootcamper.uploadModal.selectReceipt') }); return }
    if (paymentMethod === 'LINK' && !paymentLinkId) {
      setErrors({ file: t('payments.bootcamper.uploadModal.selectLink') }); return
    }

    // Sin `program_id`: el backend lo deduce de la inscripción activa. El
    // bootcamper no tiene por qué elegir el programa en el que ya está inscrito.
    const fd = new FormData()
    fd.append('receipt_file', file)
    if (hasPaymentLink) {
      fd.append('payment_method', paymentMethod)
      if (paymentMethod === 'LINK') fd.append('payment_link_id', paymentLinkId)
    }
    mutation.mutate(fd)
  }

  // Tres zonas: cabecera y pie fijos, cuerpo scrollable. Sin acotar la altura,
  // en una ventana baja el panel se desborda por arriba y por abajo a la vez
  // —lo centra el `items-center` del overlay— y como `useModalA11y` bloquea el
  // scroll del body, el botón de subir queda inalcanzable: no hay forma de
  // enviar el comprobante. El pie va fuera del contenedor scrollable para que
  // la acción principal nunca se pierda de vista.
  //
  // `max-h-full` y no una unidad de viewport: el overlay es `fixed inset-0
  // p-4`, así que el 100% se resuelve contra su content box —el viewport menos
  // las 2rem del padding— y el margen queda atado al `p-4` en vez de repetido
  // en un `calc`. De paso evita que `100vh`, que en móvil ignora la barra de
  // URL, quede más alto que lo realmente visible.
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('payments.bootcamper.uploadModal.title')}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-full flex flex-col overflow-hidden focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('payments.bootcamper.uploadModal.title')}</h2>
          <button
            onClick={onClose}
            aria-label={t('payments.bootcamper.uploadModal.close')}
            className="text-gray-500 hover:text-gray-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213A8E]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6 space-y-4">
            <p className="text-sm text-gray-500 -mt-1">
              {paymentMethod === 'LINK'
                ? t('payments.bootcamper.uploadModal.introLink')
                : t('payments.bootcamper.uploadModal.intro')}
            </p>

            {hasPaymentLink && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.bootcamper.uploadModal.paymentTypeLabel')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'TRANSFER', label: t('payments.bootcamper.uploadModal.methodTransfer') },
                    { value: 'LINK', label: t('payments.bootcamper.uploadModal.methodLink') },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      className={`text-sm font-medium rounded-lg px-3 py-2 border transition-colors ${
                        paymentMethod === opt.value
                          ? 'border-[#213A8E] bg-blue-50 text-[#213A8E]'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paymentMethod === 'LINK' && availableLinks.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.bootcamper.uploadModal.whichLinkLabel')}</label>
                <select
                  value={paymentLinkId}
                  onChange={(e) => setPaymentLinkId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base sm:py-2 sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#213A8E] focus:border-transparent"
                >
                  {availableLinks.map((link) => (
                    <option key={link.id} value={link.id}>{paymentLinkLabel(link, t)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* File upload — drag & drop */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paymentMethod === 'LINK' ? t('payments.bootcamper.uploadModal.evidenceLabel') : t('payments.bootcamper.uploadModal.receiptLabel')}
              </label>
              <div
                onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files[0]
                  if (f) validateAndSetFile(f)
                }}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-8 sm:py-6 transition-colors cursor-pointer ${dropZoneClass(dragOver, file)}`}
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <>
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-green-700 truncate max-w-full px-2">{file.name}</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null) }}
                      className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                    >
                      {t('payments.bootcamper.uploadModal.remove')}
                    </button>
                  </>
                ) : (
                  <>
                    <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-[#213A8E]">{t('payments.bootcamper.uploadModal.clickToUpload')}</span>
                      <span className="hidden sm:inline">{t('payments.bootcamper.uploadModal.orDrag')}</span>
                    </p>
                    <p className="text-xs text-gray-500">{t('payments.bootcamper.uploadModal.fileHint')}</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  data-testid="upload-file-input"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && validateAndSetFile(e.target.files[0])}
                />
              </div>
              {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
            </div>
          </div>

          {/* El error de la mutación va en el pie, no en el cuerpo: ahí queda
              siempre pegado al botón que lo produjo, en vez de al final de una
              región que puede estar desplazada. */}
          <div className="shrink-0 px-5 pb-5 pt-1 sm:px-6 sm:pb-6 space-y-2">
            {mutation.isError && (
              <p className="text-red-500 text-sm">
                {flattenUploadError(mutation.error)}
              </p>
            )}
            <button
              type="submit"
              data-testid="upload-submit"
              disabled={mutation.isPending}
              className="w-full bg-[#213A8E] text-white py-2.5 rounded-lg font-medium text-sm hover:bg-[#1a2f72] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
            >
              {mutation.isPending && <Spinner />}
              {mutation.isPending ? t('payments.bootcamper.uploadModal.uploading') : t('payments.bootcamper.uploadModal.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── OCR Review Modal ─────────────────────────────────────────────────────────

// mode='review' → confirmar un pago DRAFT recién escaneado (DRAFT → PENDING).
// mode='edit'   → corregir un pago REJECTED y reenviarlo (REJECTED → PENDING).
// `mode`: 'review' confirma un borrador recién escaneado, 'edit' corrige y
// reenvía uno rechazado, y 'view' solo muestra. El de vista reusa este mismo
// componente para que la ventana se lea igual que la de edición.
function OCRReviewModal({ payment, mode = 'review', onClose, onSuccess }) {
  const { t } = useTranslation()
  const isEdit = mode === 'edit'
  const isView = mode === 'view'
  // CR-013: la evidencia de pago por link no pasa por OCR ni tiene datos
  // bancarios que leer — sólo se confirma el monto y la fecha.
  const isLink = payment.payment_method === 'LINK'
  const [fields, setFields] = useState({
    ocr_bank_name: payment.confirmed_bank_name || payment.ocr_bank_name || '',
    ocr_account_last_digits: payment.ocr_account_last_digits || '',
    ocr_amount: payment.confirmed_amount || payment.ocr_amount || '',
    ocr_transaction_id: payment.confirmed_transaction_id || payment.ocr_transaction_id || '',
    ocr_payment_date: payment.ocr_payment_date || '',
  })
  const qc = useQueryClient()
  const [timedOut, setTimedOut] = useState(false)
  // Al editar un rechazado, el bootcamper puede adjuntar un comprobante nuevo.
  const [newReceipt, setNewReceipt] = useState(null)

  // OCR runs async (Celery). Poll ocr-status until the backend writes the
  // confidence map (set only after the task finishes), then stop.
  const isOcrDone = (d) => d?.ocr_confidence && Object.keys(d.ocr_confidence).length > 0

  const { data: ocrData, isLoading: ocrLoading } = useQuery({
    queryKey: ['ocr-status', payment.id],
    queryFn: () => getOCRStatus(payment.id),
    enabled: !isEdit && !isView && !isLink && payment.status === 'DRAFT',
    refetchInterval: (query) =>
      isOcrDone(query.state.data) || timedOut ? false : 1500,
  })

  // Give up polling after 30s so a stuck/slow OCR doesn't block manual entry.
  useEffect(() => {
    if (isEdit || isView || isLink || payment.status !== 'DRAFT') return
    const t = setTimeout(() => setTimedOut(true), 30000)
    return () => clearTimeout(t)
  }, [isEdit, isView, isLink, payment.status])

  const ocrReady = isOcrDone(ocrData) || isOcrDone(payment)
  const ocrProcessing = !isEdit && !isView && !isLink && payment.status === 'DRAFT' && !ocrReady && !timedOut

  useEffect(() => {
    if (ocrData) {
      setFields({
        ocr_bank_name: ocrData.ocr_bank_name || '',
        ocr_account_last_digits: ocrData.ocr_account_last_digits || '',
        ocr_amount: ocrData.ocr_amount || '',
        ocr_transaction_id: ocrData.ocr_transaction_id || '',
        ocr_payment_date: ocrData.ocr_payment_date || '',
      })
    }
  }, [ocrData])

  const mutation = useMutation({
    mutationFn: (data) => {
      if (!isEdit) return confirmPayment(payment.id, data)
      // Con comprobante nuevo va como multipart; si no, como JSON de solo campos.
      if (newReceipt) {
        const fd = new FormData()
        Object.entries(data).forEach(([k, v]) => fd.append(k, v ?? ''))
        fd.append('receipt_file', newReceipt)
        return updateMyPayment(payment.id, fd)
      }
      return updateMyPayment(payment.id, data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-payments'] })
      onSuccess()
    },
  })

  const confidence = ocrData?.ocr_confidence || payment.ocr_confidence || {}

  // El backend emite las claves sin prefijo (`bank_name`, `amount`…, ver
  // ocr.py), pero acá los campos se llaman `ocr_bank_name` porque así se
  // llaman en el modelo. Indexar con el nombre del campo daba siempre
  // `undefined`, así que nunca se mostraba ningún porcentaje de confianza.
  const confidenceOf = (field) => confidence[field.replace(/^ocr_/, '')]

  const confColor = (field) => {
    const v = confidenceOf(field)
    if (v == null) return 'text-gray-500'
    if (v >= 0.8) return 'text-green-600'
    if (v >= 0.5) return 'text-yellow-600'
    return 'text-red-500'
  }

  const confLabel = (field) => {
    const v = confidenceOf(field)
    if (v == null) return ''
    return t('payments.bootcamper.ocrModal.confidence', { pct: Math.round(v * 100) })
  }

  // Monto: solo dígitos y un único separador decimal. Normaliza coma → punto,
  // impide letras/símbolos (incluido texto pegado) y limita a 2 decimales.
  const sanitizeAmount = (raw) => {
    let v = raw.replace(/[^\d.,]/g, '').replace(/,/g, '.')
    const [intPart, ...rest] = v.split('.')
    if (rest.length === 0) return intPart
    return `${intPart}.${rest.join('').slice(0, 2)}`
  }

  const handleFieldChange = (key, raw) => {
    const value = key === 'ocr_amount' ? sanitizeAmount(raw) : raw
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  let submitLabel
  if (mutation.isPending) submitLabel = isEdit ? t('payments.bootcamper.ocrModal.resending') : t('payments.bootcamper.ocrModal.confirming')
  else submitLabel = isEdit ? t('payments.bootcamper.ocrModal.resend') : t('payments.bootcamper.ocrModal.confirm')

  let modalTitle = isLink ? t('payments.bootcamper.ocrModal.titleReviewLink') : t('payments.bootcamper.ocrModal.titleReview')
  let modalHint = isLink ? t('payments.bootcamper.ocrModal.hintReviewLink') : t('payments.bootcamper.ocrModal.hintReview')
  if (isEdit) {
    modalTitle = t('payments.bootcamper.ocrModal.titleEdit')
    modalHint = t('payments.bootcamper.ocrModal.hintEdit')
  } else if (isView) {
    modalTitle = t('payments.bootcamper.ocrModal.titleView')
    modalHint = t('payments.bootcamper.ocrModal.hintView')
  }

  const fieldDefs = isLink
    ? [
        { key: 'ocr_amount', label: t('payments.bootcamper.ocrModal.amountLabel'), placeholder: t('payments.bootcamper.ocrModal.amountPlaceholder'), type: 'text', inputMode: 'decimal' },
        { key: 'ocr_payment_date', label: t('payments.bootcamper.ocrModal.dateLabel'), type: 'date' },
      ]
    : [
        { key: 'ocr_bank_name', label: t('payments.bootcamper.ocrModal.bankLabel'), placeholder: t('payments.bootcamper.ocrModal.bankPlaceholder') },
        { key: 'ocr_account_last_digits', label: t('payments.bootcamper.ocrModal.accountLabel'), placeholder: t('payments.bootcamper.ocrModal.accountPlaceholder') },
        { key: 'ocr_amount', label: t('payments.bootcamper.ocrModal.amountLabel'), placeholder: t('payments.bootcamper.ocrModal.amountPlaceholder'), type: 'text', inputMode: 'decimal' },
        { key: 'ocr_transaction_id', label: t('payments.bootcamper.ocrModal.txLabel'), placeholder: t('payments.bootcamper.ocrModal.txPlaceholder') },
        { key: 'ocr_payment_date', label: t('payments.bootcamper.ocrModal.dateLabel'), type: 'date' },
      ]

  const dialogRef = useModalA11y(onClose)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-full overflow-y-auto overscroll-contain focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-5 pb-4 sm:px-6 sm:pt-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{modalTitle}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{modalHint}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('payments.bootcamper.ocrModal.close')}
            className="text-gray-500 hover:text-gray-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213A8E]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-0">
          {/* Comprobante subido */}
          <div className="border-b lg:border-b-0 lg:border-r border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">{t('payments.bootcamper.ocrModal.uploadedReceipt')}</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl h-48 sm:h-64 lg:h-[26rem] overflow-hidden">
              <ReceiptPreview url={payment.receipt_file} type={payment.receipt_file_type} />
            </div>
            {isEdit && (
              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#213A8E] border border-[#213A8E]/40 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  {newReceipt ? t('payments.bootcamper.ocrModal.changeReceipt') : t('payments.bootcamper.ocrModal.replaceReceipt')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(e) => setNewReceipt(e.target.files?.[0] || null)}
                  />
                </label>
                {newReceipt && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{t('payments.bootcamper.ocrModal.newFile', { name: newReceipt.name })}</p>
                )}
              </div>
            )}
          </div>

          {/* Datos extraídos */}
          <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4">
          {(ocrLoading || ocrProcessing) ? (
            <div data-testid="ocr-processing" aria-busy="true" className="flex flex-col items-center justify-center py-12 sm:py-20 text-center">
              <svg className="w-10 h-10 text-[#213A8E] animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm font-medium text-gray-700 mt-4">{t('payments.bootcamper.ocrModal.scanning')}</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                {t('payments.bootcamper.ocrModal.scanningHint')}
              </p>
            </div>
          ) : (
            <>
              {!isLink && timedOut && !ocrReady && (
                <p data-testid="ocr-timeout" className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  {t('payments.bootcamper.ocrModal.ocrTimeout')}
                </p>
              )}
              {fieldDefs.map(({ key, label, placeholder, type = 'text', inputMode }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    {!isEdit && confidenceOf(key) != null && (
                      <span className={`text-xs font-medium ${confColor(key)}`}>{confLabel(key)}</span>
                    )}
                  </div>
                  <input
                    type={type}
                    inputMode={inputMode}
                    value={fields[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder={isView ? '—' : placeholder}
                    readOnly={isView}
                    disabled={isView}
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base sm:py-2 sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#213A8E] focus:border-transparent ${
                      isView ? 'bg-gray-50 text-gray-600 cursor-default' : ''
                    }`}
                  />
                </div>
              ))}
            </>
          )}

          {mutation.isError && (
            <p className="text-red-500 text-sm animate-shake">
              {mutation.error?.response?.data?.error || t('payments.bootcamper.ocrModal.confirmError')}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors ${isView ? 'w-full' : 'flex-1'}`}
            >
              {isView ? t('payments.bootcamper.ocrModal.close') : t('payments.bootcamper.ocrModal.cancel')}
            </button>
            {!isView && (
              <button
                type="button"
                data-testid="confirm-payment-submit"
                disabled={mutation.isPending || ocrLoading || ocrProcessing}
                onClick={() => mutation.mutate(fields)}
                className="flex-1 bg-[#213A8E] text-white py-2.5 rounded-lg font-medium text-sm hover:bg-[#1a2f72] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
              >
                {mutation.isPending && <Spinner />}
                {submitLabel}
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Actions Dropdown ─────────────────────────────────────────────────────────

/**
 * Menú de acciones de una fila del historial.
 *
 * Mismo patrón que el de la tabla de leads: el menú se posiciona `fixed` a
 * partir del botón, para que no lo recorte el `overflow-x-auto` de la tabla, y
 * se abre hacia arriba cuando queda poco espacio abajo.
 */

// Al ser `fixed`, el ancho no lo puede deducir el layout: se calcula acá y
// tiene que coincidir con la clase `w-44`.
const MENU_WIDTH = 176
const VIEWPORT_MARGIN = 8

function PaymentActionsDropdown({ payment, onReview, onEdit, onView, onViewReason, onDelete }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        (!menuRef.current || !menuRef.current.contains(e.target))
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  // Recalcula la posición a partir del botón. Al ser `fixed`, el menú no la
  // hereda del layout: hay que fijarla a mano y volver a fijarla cada vez que
  // el botón se mueve.
  const reposicionar = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const upward = window.innerHeight - rect.bottom < 200
    // Sin acotar, `rect.right - MENU_WIDTH` se sale de la pantalla: el botón
    // vive dentro de una tabla que scrollea en horizontal.
    const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
    setOpenUpward(upward)
    setPos({
      top: upward ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH), maxLeft),
    })
  }, [])

  // Se reposiciona, no se cierra. Cerrar parecía más simple, pero deja el menú
  // a merced de cualquier scroll programático: `scrollIntoView` —el que hace
  // Playwright antes de pulsar, y el del propio navegador al enfocar— llega
  // justo después de abrirlo y lo cierra en el acto. Reposicionar además evita
  // cambiarle el comportamiento a quien ya usa esto en escritorio.
  //
  // En captura: ni el scroll del `overflow-x-auto` de la tabla ni el del <main>
  // del layout burbujean hasta window.
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    return () => {
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
    }
  }, [open, reposicionar])

  const handleToggle = () => {
    if (!open) reposicionar()
    setOpen((v) => !v)
  }

  // Un borrador se revisa; un rechazado se corrige, se consulta el motivo o se
  // descarta; lo aprobado y lo pendiente ya solo se consultan.
  const actions = []
  if (payment.status === 'DRAFT') actions.push({ label: t('payments.bootcamper.actions.review'), run: onReview })
  if (payment.status === 'REJECTED') {
    actions.push({ label: t('payments.bootcamper.actions.edit'), run: onEdit })
    if (payment.rejection_reason) actions.push({ label: t('payments.bootcamper.actions.viewReason'), run: onViewReason })
  }
  if (payment.status === 'APPROVED' || payment.status === 'PENDING') {
    actions.push({ label: t('payments.bootcamper.actions.viewInfo'), run: onView })
  }
  // Se puede eliminar lo que aún no quedó aprobado: borrador, pendiente o rechazado.
  if (['DRAFT', 'PENDING', 'REJECTED'].includes(payment.status)) {
    actions.push({ label: t('payments.bootcamper.actions.delete'), run: onDelete, danger: true })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        aria-label={t('payments.bootcamper.actions.menuAria', { program: payment.program_name || t('payments.bootcamper.actions.programFallback') })}
        aria-expanded={open}
        className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-[#213A8E] text-white hover:bg-[#1a2f72] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={`fixed w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 ${openUpward ? '-translate-y-full' : ''}`}
          style={{ top: pos.top, left: pos.left }}
        >
          {actions.map(({ label, run, danger }) => (
            <button
              key={label}
              onClick={() => { run(payment); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 sm:py-2 text-sm hover:bg-gray-50 ${danger ? 'text-red-600' : 'text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Presentación compartida fila/tarjeta ─────────────────────────────────────

// La fila y la tarjeta muestran los mismos datos; el formato vive acá para que
// no puedan derivar cuando se agregue un campo.
function paymentAmountLabel(payment) {
  const amount = payment.confirmed_amount || payment.ocr_amount
  return amount
    ? `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    : '—'
}

const paymentDateLabel = (p) => p.ocr_payment_date || p.submitted_at?.slice(0, 10) || '—'

const paymentInitial = (p) => (p.program_name || 'P')[0].toUpperCase()

// ─── Payment Row ──────────────────────────────────────────────────────────────

function PaymentRow({ payment, ...actions }) {
  const { t } = useTranslation()
  return (
    <tr data-testid="payment-row" className="hover:bg-gray-50 transition-colors">
      <td className="py-3.5 px-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#213A8E] flex items-center justify-center text-white font-bold text-xs shrink-0">
            {paymentInitial(payment)}
          </span>
          <span className="font-medium text-gray-900">{payment.program_name}</span>
        </div>
      </td>
      <td className="py-3.5 px-3 text-gray-500">{paymentDateLabel(payment)}</td>
      <td className="py-3.5 px-3 font-semibold text-gray-900">
        {paymentAmountLabel(payment)}
      </td>
      <td className="py-3.5 px-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payment.status]}`}>
          {t(`payments.status.${payment.status}`)}
        </span>
      </td>
      <td className="py-3.5 px-3">
        <PaymentActionsDropdown payment={payment} {...actions} />
      </td>
    </tr>
  )
}

// ─── Payment Card ─────────────────────────────────────────────────────────────

/**
 * La misma información que `PaymentRow`, apilada, para pantallas menores a
 * `sm`. La tabla exige 600px de ancho: en un teléfono queda con scroll
 * horizontal y la única columna interactiva —Acciones— es justo la que se va
 * fuera de pantalla.
 *
 * Es un espejo de `PaymentRow`: si se agrega un dato a la fila, va también acá.
 */
function PaymentCard({ payment, ...actions }) {
  const { t } = useTranslation()
  return (
    <li data-testid="payment-card" className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-full bg-[#213A8E] flex items-center justify-center text-white font-bold text-xs shrink-0">
            {paymentInitial(payment)}
          </span>
          <span className="font-medium text-gray-900 text-sm truncate">{payment.program_name}</span>
        </div>
        <PaymentActionsDropdown payment={payment} {...actions} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-gray-900">{paymentAmountLabel(payment)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{paymentDateLabel(payment)}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_COLORS[payment.status]}`}>
          {t(`payments.status.${payment.status}`)}
        </span>
      </div>
      {/* El motivo del rechazo no se imprime acá, igual que en la fila: se lee
          en «Ver motivo» (HST-023). */}
    </li>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonPaymentRow() {
  return (
    <tr aria-busy="true" className="animate-pulse">
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-40" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-16" /></td>
      <td className="py-3.5 px-3"><div className="h-5 bg-gray-200 rounded-full w-20" /></td>
      <td className="py-3.5 px-3"><div className="h-8 bg-gray-200 rounded-lg w-8" /></td>
    </tr>
  )
}

// ─── Rejection Reason Modal ───────────────────────────────────────────────────

function RejectionReasonModal({ payment, onClose }) {
  const { t } = useTranslation()
  const dialogRef = useModalA11y(onClose)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('payments.bootcamper.rejectionModal.title')}
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-full overflow-y-auto overscroll-contain p-5 sm:p-6 focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">{t('payments.bootcamper.rejectionModal.title')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{payment.program_name}</p>

        <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {payment.rejection_reason}
        </p>

        <p className="mt-3 text-xs text-gray-500">
          {t('payments.bootcamper.rejectionModal.hint')}
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
        >
          {t('payments.bootcamper.rejectionModal.close')}
        </button>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ payment, isPending, onClose, onConfirm }) {
  const { t } = useTranslation()
  const dialogRef = useModalA11y(onClose)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('payments.bootcamper.deleteModal.title')}
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-full overflow-y-auto overscroll-contain p-5 sm:p-6 focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">{t('payments.bootcamper.deleteModal.title')}</h2>
        <p className="text-sm text-gray-500 mt-2">
          {t('payments.bootcamper.deleteModal.confirmPrefix')}
          <span className="font-medium text-gray-700">{payment.program_name}</span>{t('payments.bootcamper.deleteModal.confirmSuffix')}
        </p>
        <div className="flex gap-3 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            {t('payments.bootcamper.deleteModal.cancel')}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {isPending && <Spinner />}
            {isPending ? t('payments.bootcamper.deleteModal.deleting') : t('payments.bootcamper.deleteModal.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Links Menu (CR-013) ──────────────────────────────────────────────

// Un solo enlace vigente: link directo. Más de uno (Finanzas negoció varias
// cuotas) — menú para elegir cuál abrir.
function paymentLinkLabel(link, t) {
  if (link.note) return link.note
  if (link.amount) return `$${parseFloat(link.amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
  return t('payments.bcDetail.paymentLinks.title')
}

function PaymentLinksMenu({ links }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (links.length === 0) return null

  const buttonClass = 'flex w-full items-center justify-center gap-2 border border-[#213A8E] text-[#213A8E] px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors sm:w-auto'
  const icon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-9 4h16a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )

  if (links.length === 1) {
    return (
      <a data-testid="pay-with-card-link" href={links[0].url} target="_blank" rel="noopener noreferrer" className={buttonClass}>
        {icon}
        {t('payments.bootcamper.page.payWithCard')}
      </a>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button data-testid="pay-with-card-menu" onClick={() => setOpen((v) => !v)} className={buttonClass}>
        {icon}
        {t('payments.bootcamper.page.payWithCardCount', { count: links.length })}
      </button>
      {open && (
        <div className="absolute left-0 sm:right-0 sm:left-auto mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[220px] py-1 animate-fade-in">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {paymentLinkLabel(link, t)}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { t } = useTranslation()
  const [showUpload, setShowUpload] = useState(false)
  const [reviewPayment, setReviewPayment] = useState(null)
  const [editPayment, setEditPayment] = useState(null)
  const [viewPayment, setViewPayment] = useState(null)
  const [reasonPayment, setReasonPayment] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [sort, setSort] = useState('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [toast, setToast] = useState(null)
  const sortRef = useRef(null)
  const qc = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: deleteMyPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-payments'] })
      setDeleteTarget(null)
      setToast({ message: t('payments.bootcamper.toast.deleted') })
    },
    onError: () => setToast({ message: t('payments.bootcamper.toast.deleteError'), type: 'error' }),
  })

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['my-payments'],
    queryFn: getMyHistory,
  })

  // Bootcampers get 403 on /programs/, so /my-programs/ (their active Enrollments)
  // is the primary source. /programs/ stays as a fallback for other roles that
  // may render this page, and payment history as a last-resort safety net.
  // Se usa solo para calcular "adeudado" por programa — la subida ya no requiere
  // seleccionar programa, el backend lo deduce de la inscripción activa.
  const { data: myPrograms = [] } = useQuery({
    queryKey: ['my-programs'],
    queryFn: getMyPrograms,
    retry: false,
  })

  const { data: apiPrograms = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    retry: false,
  })

  let programs = myPrograms
  if (programs.length === 0) programs = apiPrograms
  if (programs.length === 0) {
    programs = [...new Map(payments.filter((p) => p.program).map((p) => [p.program, { id: p.program, name: p.program_name }])).values()]
  }

  useEffect(() => {
    const handler = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setShowSortMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const approved = payments.filter((p) => p.status === 'APPROVED')
  const totalPaid = approved.reduce((sum, p) => sum + parseFloat(p.confirmed_amount || 0), 0)
  const pending = payments.filter((p) => p.status === 'PENDING')
  const pendingCount = pending.length

  // `my-status` responde por programa, y una persona puede estar inscrita en más
  // de uno: se consulta cada uno y se suma el adeudado. Va en una sola query con
  // Promise.all en vez de useQueries porque ese hook no se usa en el proyecto.
  const programIds = programs.map((p) => p.id).filter(Boolean)
  const { data: statusSummaries, isLoading: debtLoading } = useQuery({
    queryKey: ['my-debt', programIds],
    queryFn: () => Promise.all(programIds.map((id) => getMyStatus(id))),
    enabled: programIds.length > 0,
  })

  const totalDebt = statusSummaries?.reduce((sum, s) => sum + parseFloat(s?.deficit || 0), 0)

  // CR-013: enlaces de pago vigentes por programa — puede haber varios a la
  // vez (Finanzas negoció más de una cuota). Se consultan todos los programas
  // en una sola query, igual que la deuda.
  const { data: paymentLinksByProgram } = useQuery({
    queryKey: ['my-payment-links', programIds],
    queryFn: () => Promise.all(programIds.map((id) => getMyPaymentLinks(id))),
    enabled: programIds.length > 0,
  })
  const activePaymentLinks = (paymentLinksByProgram || []).flat()

  // Sin programas descubribles (un bootcamper que todavía no subió ningún pago)
  // no hay nada que consultar: se muestra un guion en vez de un cero que diría
  // "no debes nada", que es justo lo contrario de su situación.
  let debtValue = '—'
  let debtSub = t('payments.bootcamper.page.debtNoData')
  if (programIds.length > 0 && totalDebt !== undefined) {
    debtValue = totalDebt > 0
      ? `$${totalDebt.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
      : t('payments.bootcamper.page.noDebt')
    if (totalDebt <= 0) {
      debtSub = t('payments.bootcamper.page.debtComplete')
    } else if (pendingCount > 0) {
      // Sólo los pagos aprobados descuentan, así que quien acaba de subir un
      // comprobante ve su pago en la lista y la deuda intacta. Se avisa acá.
      debtSub = t('payments.bootcamper.page.debtNotIncludingPending')
    } else {
      debtSub = t('payments.bootcamper.page.debtOverAgreed')
    }
  }

  const sorted = [...payments].sort((a, b) => {
    const da = new Date(a.ocr_payment_date || a.submitted_at || 0)
    const db = new Date(b.ocr_payment_date || b.submitted_at || 0)
    return sort === 'newest' ? db - da : da - db
  })

  const SORT_OPTIONS = [
    { value: 'newest', label: t('payments.bootcamper.page.sortNewest') },
    { value: 'oldest', label: t('payments.bootcamper.page.sortOldest') },
  ]

  const showToast = (message, type = 'success') => setToast({ message, type })

  return (
    <div className="flex-1 bg-gray-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('payments.bootcamper.page.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('payments.bootcamper.page.subtitle')}</p>
        </div>
        <div className="flex flex-col w-full gap-2 sm:flex-row sm:w-auto">
          <PaymentLinksMenu links={activePaymentLinks} />
          <button
            data-testid="upload-button"
            onClick={() => setShowUpload(true)}
            className="flex w-full items-center justify-center gap-2 bg-[#213A8E] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#1a2f72] transition-colors sm:w-auto sm:justify-start"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {t('payments.bootcamper.page.uploadPayment')}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4 mb-6 sm:mb-8">
        <StatCard
          label={t('payments.bootcamper.page.totalPaid')}
          value={`$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
          sub={t('payments.bootcamper.page.approved', { count: approved.length })}
          loading={isLoading}
        />
        <StatCard
          label={t('payments.bootcamper.page.pendingLabel')}
          value={`${pendingCount}`}
          sub={t('payments.bootcamper.page.pending', { count: pendingCount })}
          loading={isLoading}
        />
        <StatCard
          label={t('payments.bootcamper.page.owed')}
          value={debtValue}
          sub={debtSub}
          loading={isLoading || debtLoading}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Plan de pagos (lo sube Finanzas; el bootcamper solo lo consulta) */}
      <div className="mb-6">
        <PaymentPlanPanel mode="bootcamper" />
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('payments.bootcamper.page.historyTitle')}</h2>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              {t('payments.bootcamper.page.sortByDate')}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSortMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[180px] py-1 animate-fade-in">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSort(opt.value); setShowSortMenu(false) }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      sort === opt.value ? 'text-[#213A8E] font-medium' : 'text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* El estado vacío queda fuera de la tabla y de la lista para que se
            pinte una sola vez. Ojo: sin pagos no hay <table> en el DOM. */}
        {!isLoading && sorted.length === 0 && (
          <div className="text-center py-10 sm:py-12">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">{t('payments.bootcamper.page.empty')}</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-3 text-sm text-[#213A8E] font-medium hover:underline"
            >
              {t('payments.bootcamper.page.uploadFirst')}
            </button>
          </div>
        )}

        {(isLoading || sorted.length > 0) && (
          <>
            {/* Móvil: tarjetas */}
            <ul data-testid="payments-card-list" className="space-y-3 sm:hidden">
              {isLoading && [...Array(3)].map((_, i) => (
                <li key={i} aria-busy="true">
                  <Skeleton className="h-24 w-full" rounded="rounded-xl" />
                </li>
              ))}

              {!isLoading && sorted.map((p) => (
                <PaymentCard
                  key={p.id}
                  payment={p}
                  onReview={setReviewPayment}
                  onEdit={setEditPayment}
                  onView={setViewPayment}
                  onViewReason={setReasonPayment}
                  onDelete={setDeleteTarget}
                />
              ))}
            </ul>

            {/* sm+: tabla */}
            <div data-testid="payments-table-wrapper" className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[
                      ['program', t('payments.queue.colProgram')],
                      ['date', t('payments.queue.colDate')],
                      ['amount', t('payments.queue.colAmount')],
                      ['status', t('payments.queue.colStatus')],
                      ['actions', t('payments.queue.colActions')],
                    ].map(([key, label]) => (
                      <th key={key} className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {isLoading && [...Array(3)].map((_, i) => <SkeletonPaymentRow key={i} />)}

                  {!isLoading && sorted.map((p) => (
                    <PaymentRow
                      key={p.id}
                      payment={p}
                      onReview={setReviewPayment}
                      onEdit={setEditPayment}
                      onView={setViewPayment}
                      onViewReason={setReasonPayment}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          availableLinks={activePaymentLinks}
          onClose={() => setShowUpload(false)}
          onSuccess={(data) => {
            setShowUpload(false)
            // Pago por link: nunca hay OCR que correr (no es un comprobante
            // bancario), pero igual hay que pedirle monto y fecha al bootcamper
            // antes de dejarlo en Pendiente — a diferencia del caso de abajo,
            // acá sí se abre el modal de confirmación.
            if (data.payment_method === 'LINK') {
              showToast(t('payments.bootcamper.toast.linkEvidenceReceived'))
              setReviewPayment(data)
              return
            }
            // `ocr_queued: false` = el comprobante se guardó pero el escaneo no
            // arrancó. Prometer que lo estamos leyendo dejaría al bootcamper
            // esperando un resultado que no va a llegar.
            if (data.ocr_queued === false) {
              showToast(t('payments.bootcamper.toast.receivedNoOcr'))
              return
            }
            showToast(t('payments.bootcamper.toast.uploadedScanning'))
            if (data.status === 'DRAFT') setReviewPayment(data)
          }}
        />
      )}

      {reviewPayment && (
        <OCRReviewModal
          payment={reviewPayment}
          onClose={() => setReviewPayment(null)}
          onSuccess={() => {
            setReviewPayment(null)
            showToast(t('payments.bootcamper.toast.confirmed'))
          }}
        />
      )}

      {editPayment && (
        <OCRReviewModal
          payment={editPayment}
          mode="edit"
          onClose={() => setEditPayment(null)}
          onSuccess={() => {
            setEditPayment(null)
            showToast(t('payments.bootcamper.toast.resent'))
          }}
        />
      )}

      {viewPayment && (
        <OCRReviewModal
          payment={viewPayment}
          mode="view"
          onClose={() => setViewPayment(null)}
        />
      )}

      {reasonPayment && (
        <RejectionReasonModal
          payment={reasonPayment}
          onClose={() => setReasonPayment(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          payment={deleteTarget}
          isPending={deleteMutation.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
