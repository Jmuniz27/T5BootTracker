import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyHistory, getMyStatus, getOCRStatus, uploadPayment, confirmPayment, getPrograms, updateMyPayment, deleteMyPayment } from '../api/payments.api'
import CustomSelect from '../components/CustomSelect'
import { useModalA11y } from '../hooks/use-modal-a11y'
import Skeleton from '../components/ui/Skeleton'
import Spinner from '../components/ui/Spinner'

const STATUS_LABELS = {
  DRAFT: 'En revisión',
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
}

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

// ─── Toast ────────────────────────────────────────────────────────────────────

const TOAST_AUTO_DISMISS_MS = 4000

function Toast({ message, type = 'success', onClose }) {
  const isError = type === 'error'
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // CB-75: dependia de `onClose`, asi que un padre que pasara una arrow inline
  // reiniciaba los 4s en cada render y el toast podia no cerrarse nunca.
  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current?.(), TOAST_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="fixed top-5 right-5 z-[70] flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg animate-slide-in-right"
    >
      <span className={`flex items-center justify-center w-6 h-6 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`}>
        {isError ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        aria-label="Cerrar notificación"
        className="text-gray-300 hover:text-white ml-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, loading }) {
  if (loading) {
    return (
      <div aria-busy="true" aria-label={`Cargando ${label}`} className="bg-white rounded-2xl border border-gray-200 p-5 min-w-[160px]">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 min-w-[160px] transition-shadow duration-200 hover:shadow-md">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ programs, onClose, onSuccess }) {
  const [programId, setProgramId] = useState('')
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [dragOver, setDragOver] = useState(false)
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
      setErrors((prev) => ({ ...prev, file: 'Solo PNG, JPG o PDF.' }))
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, file: 'Máximo 10 MB.' }))
      return
    }
    setErrors((prev) => ({ ...prev, file: null }))
    setFile(f)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = {}
    if (!programId) errs.program = 'Selecciona un programa.'
    if (!file) errs.file = 'Selecciona un comprobante.'
    if (Object.keys(errs).length) { setErrors(errs); return }

    const fd = new FormData()
    fd.append('receipt_file', file)
    fd.append('program_id', programId)
    mutation.mutate(fd)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Subir comprobante"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">📄 Subir comprobante</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-500 hover:text-gray-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213A8E]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <p className="text-sm text-gray-500 -mt-1">
            Sube tu comprobante de transferencia. Revisarás el monto y la fecha en el siguiente paso,
            una vez escaneado el documento.
          </p>

          {/* File upload — drag & drop */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante de transferencia</label>
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
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-6 transition-colors cursor-pointer ${dropZoneClass(dragOver, file)}`}
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
                    Quitar
                  </button>
                </>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-[#213A8E]">Haz clic para subir</span> o arrastra el archivo
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG o PDF (máx. 10 MB)</p>
                </>
              )}
              <input
                ref={fileRef}
                data-testid="upload-file-input"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={(e) => e.target.files[0] && validateAndSetFile(e.target.files[0])}
              />
            </div>
            {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
          </div>

          {/* Program */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Programa</label>
            <CustomSelect
              testId="upload-program"
              value={programId}
              onChange={setProgramId}
              placeholder="Selecciona un programa"
              options={programs.map((p) => ({ value: p.id, label: p.name }))}
            />
            {errors.program && <p className="text-red-500 text-xs mt-1">{errors.program}</p>}
          </div>

          {mutation.isError && (
            <p className="text-red-500 text-sm">
              {mutation.error?.response?.data?.error || 'Error al subir el comprobante.'}
            </p>
          )}

          <button
            type="submit"
            data-testid="upload-submit"
            disabled={mutation.isPending}
            className="w-full bg-[#213A8E] text-white py-2.5 rounded-lg font-medium text-sm hover:bg-[#1a2f72] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Spinner />}
            {mutation.isPending ? 'Subiendo...' : 'Subir comprobante'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Receipt Preview ──────────────────────────────────────────────────────────

function ReceiptPreview({ url, type }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
        <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Comprobante no disponible
      </div>
    )
  }
  if (type === 'pdf') {
    return (
      <object data={url} type="application/pdf" className="w-full h-full rounded-lg">
        <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-2 p-4 text-center">
          No se puede previsualizar el PDF aquí.
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#213A8E] font-medium hover:underline">
            Abrir comprobante en pestaña nueva
          </a>
        </div>
      </object>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
      <img src={url} alt="Comprobante" className="w-full h-full object-contain rounded-lg" />
    </a>
  )
}

// ─── OCR Review Modal ─────────────────────────────────────────────────────────

// mode='review' → confirmar un pago DRAFT recién escaneado (DRAFT → PENDING).
// mode='edit'   → corregir un pago REJECTED y reenviarlo (REJECTED → PENDING).
function OCRReviewModal({ payment, mode = 'review', onClose, onSuccess }) {
  const isEdit = mode === 'edit'
  const [fields, setFields] = useState({
    ocr_bank_name: payment.confirmed_bank_name || payment.ocr_bank_name || '',
    ocr_account_last_digits: payment.ocr_account_last_digits || '',
    ocr_amount: payment.confirmed_amount || payment.ocr_amount || '',
    ocr_transaction_id: payment.confirmed_transaction_id || payment.ocr_transaction_id || '',
    ocr_payment_date: payment.ocr_payment_date || '',
  })
  const qc = useQueryClient()
  const [timedOut, setTimedOut] = useState(false)

  // OCR runs async (Celery). Poll ocr-status until the backend writes the
  // confidence map (set only after the task finishes), then stop.
  const isOcrDone = (d) => d?.ocr_confidence && Object.keys(d.ocr_confidence).length > 0

  const { data: ocrData, isLoading: ocrLoading } = useQuery({
    queryKey: ['ocr-status', payment.id],
    queryFn: () => getOCRStatus(payment.id),
    enabled: !isEdit && payment.status === 'DRAFT',
    refetchInterval: (query) =>
      isOcrDone(query.state.data) || timedOut ? false : 1500,
  })

  // Give up polling after 30s so a stuck/slow OCR doesn't block manual entry.
  useEffect(() => {
    if (isEdit || payment.status !== 'DRAFT') return
    const t = setTimeout(() => setTimedOut(true), 30000)
    return () => clearTimeout(t)
  }, [isEdit, payment.status])

  const ocrReady = isOcrDone(ocrData) || isOcrDone(payment)
  const ocrProcessing = !isEdit && payment.status === 'DRAFT' && !ocrReady && !timedOut

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
    mutationFn: (data) => (isEdit ? updateMyPayment(payment.id, data) : confirmPayment(payment.id, data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-payments'] })
      onSuccess()
    },
  })

  const confidence = ocrData?.ocr_confidence || payment.ocr_confidence || {}

  const confColor = (field) => {
    const v = confidence[field]
    if (v == null) return 'text-gray-500'
    if (v >= 0.8) return 'text-green-600'
    if (v >= 0.5) return 'text-yellow-600'
    return 'text-red-500'
  }

  const confLabel = (field) => {
    const v = confidence[field]
    if (v == null) return ''
    return `${Math.round(v * 100)}% confianza`
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
  if (mutation.isPending) submitLabel = isEdit ? 'Reenviando...' : 'Confirmando...'
  else submitLabel = isEdit ? 'Reenviar pago' : 'Confirmar pago'

  const dialogRef = useModalA11y(onClose)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Editar y reenviar pago' : 'Revisar comprobante de transferencia'}
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? 'Editar y reenviar pago' : 'Revisar comprobante de transferencia'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEdit
                ? 'Corrige los datos observados y reenvía el pago para una nueva revisión'
                : 'Compara tu comprobante con los datos escaneados y corrige lo necesario antes de confirmar'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-500 hover:text-gray-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213A8E]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-0">
          {/* Comprobante subido */}
          <div className="border-b md:border-b-0 md:border-r border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Comprobante subido</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl h-72 md:h-[26rem] overflow-hidden">
              <ReceiptPreview url={payment.receipt_file} type={payment.receipt_file_type} />
            </div>
          </div>

          {/* Datos extraídos */}
          <div className="px-6 py-5 space-y-4">
          {(ocrLoading || ocrProcessing) ? (
            <div data-testid="ocr-processing" aria-busy="true" className="flex flex-col items-center justify-center py-20 text-center">
              <svg className="w-10 h-10 text-[#213A8E] animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm font-medium text-gray-700 mt-4">Escaneando texto…</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                Estamos leyendo los datos de tu comprobante. Esto puede tardar unos segundos.
              </p>
            </div>
          ) : (
            <>
              {isEdit && payment.rejection_reason && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span className="font-medium">Motivo del rechazo:</span> {payment.rejection_reason}
                </p>
              )}
              {timedOut && !ocrReady && (
                <p data-testid="ocr-timeout" className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  No se pudieron extraer los datos automáticamente. Complétalos manualmente antes de confirmar.
                </p>
              )}
              {[
                { key: 'ocr_bank_name', label: 'Banco', placeholder: 'Nombre del banco' },
                { key: 'ocr_account_last_digits', label: 'Últimos dígitos cuenta', placeholder: 'Ej: 1234' },
                { key: 'ocr_amount', label: 'Monto', placeholder: 'Ej: 500.00', type: 'text', inputMode: 'decimal' },
                { key: 'ocr_transaction_id', label: 'Nro. de transacción', placeholder: 'ID de transacción' },
                { key: 'ocr_payment_date', label: 'Fecha de pago', type: 'date' },
              ].map(({ key, label, placeholder, type = 'text', inputMode }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    {!isEdit && confidence[key] != null && (
                      <span className={`text-xs font-medium ${confColor(key)}`}>{confLabel(key)}</span>
                    )}
                  </div>
                  <input
                    type={type}
                    inputMode={inputMode}
                    value={fields[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#213A8E] focus:border-transparent"
                  />
                </div>
              ))}
            </>
          )}

          {mutation.isError && (
            <p className="text-red-500 text-sm animate-shake">
              {mutation.error?.response?.data?.error || 'Error al confirmar el pago.'}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
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
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Row ──────────────────────────────────────────────────────────────

function PaymentRow({ payment, onReview, onEdit, onDelete }) {
  // El bootcamper puede subsanar (editar/eliminar) pagos en revisión o rechazados.
  const canDelete = payment.status === 'DRAFT' || payment.status === 'REJECTED'
  const initial = (payment.program_name || 'P')[0].toUpperCase()
  const amount = payment.confirmed_amount || payment.ocr_amount
  const date = payment.ocr_payment_date || payment.submitted_at?.slice(0, 10)

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 last:border-0">
      <div className="w-10 h-10 rounded-full bg-[#213A8E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{payment.program_name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-gray-500">{date || '—'}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payment.status]}`}>
            {STATUS_LABELS[payment.status]}
          </span>
          {payment.status === 'DRAFT' && (
            <button
              onClick={() => onReview(payment)}
              className="text-xs text-[#213A8E] font-medium hover:underline"
            >
              Revisar
            </button>
          )}
          {payment.status === 'REJECTED' && (
            <button
              onClick={() => onEdit(payment)}
              className="text-xs text-[#213A8E] font-medium hover:underline"
            >
              Editar
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(payment)}
              aria-label="Eliminar pago"
              className="text-gray-500 hover:text-red-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
        {payment.status === 'REJECTED' && payment.rejection_reason && (
          <p className="text-xs text-red-500 max-w-[160px] text-right leading-snug">
            {payment.rejection_reason}
          </p>
        )}
      </div>
      <p className="text-sm font-semibold text-gray-900 w-20 text-right flex-shrink-0">
        {amount ? `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—'}
      </p>
    </div>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonPaymentRow() {
  return (
    <div aria-busy="true" className="flex items-center gap-4 py-4 border-b border-gray-100">
      <Skeleton className="w-10 h-10 flex-shrink-0" rounded="rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-5 w-20" rounded="rounded-full" />
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ payment, isPending, onClose, onConfirm }) {
  const dialogRef = useModalA11y(onClose)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Eliminar pago"
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">Eliminar pago</h2>
        <p className="text-sm text-gray-500 mt-2">
          ¿Seguro que quieres eliminar el comprobante de{' '}
          <span className="font-medium text-gray-700">{payment.program_name}</span>? Esta acción no se
          puede deshacer.
        </p>
        <div className="flex gap-3 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
          >
            {isPending && <Spinner />}
            {isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [showUpload, setShowUpload] = useState(false)
  const [reviewPayment, setReviewPayment] = useState(null)
  const [editPayment, setEditPayment] = useState(null)
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
      setToast({ message: 'Pago eliminado.' })
    },
    onError: () => setToast({ message: 'No se pudo eliminar el pago.', type: 'error' }),
  })

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['my-payments'],
    queryFn: getMyHistory,
  })

  const { data: apiPrograms = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    retry: false,
  })

  // Bootcampers get 403 on /programs/ — fall back to unique programs from their own history
  const programs = apiPrograms.length > 0
    ? apiPrograms
    : [...new Map(payments.filter((p) => p.program).map((p) => [p.program, { id: p.program, name: p.program_name }])).values()]

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
  const { data: totalDebt, isLoading: debtLoading } = useQuery({
    queryKey: ['my-debt', programIds],
    queryFn: () =>
      Promise.all(programIds.map((id) => getMyStatus(id))).then((summaries) =>
        summaries.reduce((sum, s) => sum + parseFloat(s?.deficit || 0), 0)
      ),
    enabled: programIds.length > 0,
  })

  // Sin programas descubribles (un bootcamper que todavía no subió ningún pago)
  // no hay nada que consultar: se muestra un guion en vez de un cero que diría
  // "no debes nada", que es justo lo contrario de su situación.
  let debtValue = '—'
  let debtSub = 'Sube un comprobante para ver tu saldo'
  if (programIds.length > 0 && totalDebt !== undefined) {
    debtValue = totalDebt > 0
      ? `$${totalDebt.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
      : 'Sin deuda'
    if (totalDebt <= 0) {
      debtSub = 'Completaste el pago de tu programa'
    } else if (pendingCount > 0) {
      // Sólo los pagos aprobados descuentan, así que quien acaba de subir un
      // comprobante ve su pago en la lista y la deuda intacta. Se avisa acá.
      debtSub = 'No incluye tus pagos en revisión'
    } else {
      debtSub = 'Sobre el precio acordado de tu programa'
    }
  }

  const sorted = [...payments].sort((a, b) => {
    const da = new Date(a.ocr_payment_date || a.submitted_at || 0)
    const db = new Date(b.ocr_payment_date || b.submitted_at || 0)
    return sort === 'newest' ? db - da : da - db
  })

  const SORT_OPTIONS = [
    { value: 'newest', label: 'Fecha: más reciente' },
    { value: 'oldest', label: 'Fecha: más antiguo' },
  ]

  const showToast = (message, type = 'success') => setToast({ message, type })

  return (
    <div className="flex-1 bg-gray-50 min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos</h1>
          <p className="text-sm text-gray-500 mt-1">Sube tus comprobantes y sigue el estado de tus pagos</p>
        </div>
        <button
          data-testid="upload-button"
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-[#213A8E] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#1a2f72] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Subir pago
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4 mb-6 sm:mb-8">
        <StatCard
          label="Total pagado"
          value={`$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
          sub={approved.length === 1 ? '1 pago aprobado' : `${approved.length} pagos aprobados`}
          loading={isLoading}
        />
        <StatCard
          label="Pendientes"
          value={`${pendingCount}`}
          sub={pendingCount === 1 ? '1 pago en espera de aprobación' : `${pendingCount} pagos en espera de aprobación`}
          loading={isLoading}
        />
        <StatCard
          label="Adeudado"
          value={debtValue}
          sub={debtSub}
          loading={isLoading || debtLoading}
        />
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Historial de pagos</h2>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Ordenar por fecha
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

        {isLoading && [...Array(3)].map((_, i) => <SkeletonPaymentRow key={i} />)}
        {!isLoading && sorted.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">No tienes pagos registrados aún.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-3 text-sm text-[#213A8E] font-medium hover:underline"
            >
              Subir tu primer comprobante
            </button>
          </div>
        )}
        {!isLoading && sorted.length > 0 && sorted.map((p) => (
          <PaymentRow
            key={p.id}
            payment={p}
            onReview={setReviewPayment}
            onEdit={setEditPayment}
            onDelete={setDeleteTarget}
          />
        ))}
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          programs={programs}
          onClose={() => setShowUpload(false)}
          onSuccess={(data) => {
            setShowUpload(false)
            showToast('Comprobante subido. Estamos escaneando el texto…')
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
            showToast('Pago confirmado. Queda pendiente de aprobación.')
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
            showToast('Pago reenviado. Queda pendiente de aprobación.')
          }}
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
