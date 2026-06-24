import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyHistory, getOCRStatus, uploadPayment, confirmPayment, getPrograms } from '../api/payments.api'

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

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])
  const isError = type === 'error'
  return (
    <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg">
      <span className={`flex items-center justify-center w-6 h-6 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`}>
        {isError ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white ml-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="bg-white rounded-2xl border border-gray-200 p-5 min-w-[160px] animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-24 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-32" />
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 min-w-[160px]">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ programs, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [programId, setProgramId] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)
  const qc = useQueryClient()

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">📄 Upload payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D3176] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1D3176] focus:border-transparent"
              />
            </div>
          </div>

          {/* Program */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1D3176] focus:border-transparent bg-white"
            >
              <option value="">Select program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.program && <p className="text-red-500 text-xs mt-1">{errors.program}</p>}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter detailed notes about the interaction..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D3176] focus:border-transparent resize-none"
            />
          </div>

          {/* File upload — drag & drop */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment proof</label>
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
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-6 transition-colors cursor-pointer ${
                dragOver
                  ? 'border-[#1D3176] bg-blue-50'
                  : file
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-[#1D3176] hover:bg-gray-50'
              }`}
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
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-[#1D3176]">Click to upload</span> or drag & drop
                  </p>
                  <p className="text-xs text-gray-400">PNG, JPG or PDF (max 10 MB)</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={(e) => e.target.files[0] && validateAndSetFile(e.target.files[0])}
              />
            </div>
            {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
          </div>

          {mutation.isError && (
            <p className="text-red-500 text-sm">
              {mutation.error?.response?.data?.error || 'Error al subir el comprobante.'}
            </p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-[#1D3176] text-white py-2.5 rounded-lg font-medium text-sm hover:bg-[#16265d] disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? 'Subiendo...' : 'Submit payment'}
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
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
        <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#1D3176] font-medium hover:underline">
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

function OCRReviewModal({ payment, onClose, onSuccess }) {
  const [fields, setFields] = useState({
    ocr_bank_name: payment.ocr_bank_name || '',
    ocr_account_last_digits: payment.ocr_account_last_digits || '',
    ocr_amount: payment.ocr_amount || '',
    ocr_transaction_id: payment.ocr_transaction_id || '',
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
    enabled: payment.status === 'DRAFT',
    refetchInterval: (query) =>
      isOcrDone(query.state.data) || timedOut ? false : 1500,
  })

  // Give up polling after 30s so a stuck/slow OCR doesn't block manual entry.
  useEffect(() => {
    if (payment.status !== 'DRAFT') return
    const t = setTimeout(() => setTimedOut(true), 30000)
    return () => clearTimeout(t)
  }, [payment.status])

  const ocrReady = isOcrDone(ocrData) || isOcrDone(payment)
  const ocrProcessing = payment.status === 'DRAFT' && !ocrReady && !timedOut

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
    mutationFn: (data) => confirmPayment(payment.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-payments'] })
      onSuccess()
    },
  })

  const confidence = ocrData?.ocr_confidence || payment.ocr_confidence || {}

  const confColor = (field) => {
    const v = confidence[field]
    if (v == null) return 'text-gray-400'
    if (v >= 0.8) return 'text-green-600'
    if (v >= 0.5) return 'text-yellow-600'
    return 'text-red-500'
  }

  const confLabel = (field) => {
    const v = confidence[field]
    if (v == null) return ''
    return `${Math.round(v * 100)}% confianza`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Revisar campos OCR</h2>
            <p className="text-xs text-gray-500 mt-0.5">Compara tu comprobante con los datos extraídos y corrige lo necesario antes de confirmar</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <svg className="w-10 h-10 text-[#1D3176] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm font-medium text-gray-700 mt-4">Procesando OCR…</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Estamos extrayendo los datos de tu comprobante. Esto puede tardar unos segundos.
              </p>
            </div>
          ) : (
            <>
              {timedOut && !ocrReady && (
                <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  No se pudieron extraer los datos automáticamente. Complétalos manualmente antes de confirmar.
                </p>
              )}
              {[
                { key: 'ocr_bank_name', label: 'Banco', placeholder: 'Nombre del banco' },
                { key: 'ocr_account_last_digits', label: 'Últimos dígitos cuenta', placeholder: 'Ej: 1234' },
                { key: 'ocr_amount', label: 'Monto', placeholder: 'Ej: 500.00', type: 'number' },
                { key: 'ocr_transaction_id', label: 'Nro. de transacción', placeholder: 'ID de transacción' },
                { key: 'ocr_payment_date', label: 'Fecha de pago', type: 'date' },
              ].map(({ key, label, placeholder, type = 'text' }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    {confidence[key] != null && (
                      <span className={`text-xs font-medium ${confColor(key)}`}>{confLabel(key)}</span>
                    )}
                  </div>
                  <input
                    type={type}
                    value={fields[key]}
                    onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3176] focus:border-transparent"
                  />
                </div>
              ))}
            </>
          )}

          {mutation.isError && (
            <p className="text-red-500 text-sm">
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
              disabled={mutation.isPending || ocrLoading || ocrProcessing}
              onClick={() => mutation.mutate(fields)}
              className="flex-1 bg-[#1D3176] text-white py-2.5 rounded-lg font-medium text-sm hover:bg-[#16265d] disabled:opacity-60 transition-colors"
            >
              {mutation.isPending ? 'Confirmando...' : 'Confirmar pago'}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Row ──────────────────────────────────────────────────────────────

function PaymentRow({ payment, onReview }) {
  const initial = (payment.program_name || 'P')[0].toUpperCase()
  const amount = payment.confirmed_amount || payment.ocr_amount
  const date = payment.ocr_payment_date || payment.submitted_at?.slice(0, 10)

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 last:border-0">
      <div className="w-10 h-10 rounded-full bg-[#1D3176] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{payment.program_name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-gray-400">{date || '—'}</span>
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
              className="text-xs text-[#1D3176] font-medium hover:underline"
            >
              Revisar
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
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-40" />
        <div className="h-3 bg-gray-100 rounded w-24" />
      </div>
      <div className="h-5 bg-gray-200 rounded-full w-20" />
      <div className="h-4 bg-gray-200 rounded w-16" />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [showUpload, setShowUpload] = useState(false)
  const [reviewPayment, setReviewPayment] = useState(null)
  const [sort, setSort] = useState('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [toast, setToast] = useState(null)
  const sortRef = useRef(null)

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
          <h1 className="text-2xl font-bold text-gray-900">💰 Payments</h1>
          <p className="text-sm text-gray-500 mt-1">Upload proof of payment and track your transactions</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-[#1D3176] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#16265d] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload payment
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4 mb-6 sm:mb-8">
        <StatCard
          label="Total Paid"
          value={`$${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
          sub={`${approved.length} approved payment${approved.length !== 1 ? 's' : ''}`}
          loading={isLoading}
        />
        <StatCard
          label="Pending"
          value={`${pendingCount}`}
          sub={pendingCount === 1 ? '1 payment awaiting approval' : `${pendingCount} payments awaiting approval`}
          loading={isLoading}
        />
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Sort by date
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSortMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[180px] py-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSort(opt.value); setShowSortMenu(false) }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      sort === opt.value ? 'text-[#1D3176] font-medium' : 'text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          [...Array(3)].map((_, i) => <SkeletonPaymentRow key={i} />)
        ) : sorted.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">No tienes pagos registrados aún.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-3 text-sm text-[#1D3176] font-medium hover:underline"
            >
              Subir tu primer comprobante
            </button>
          </div>
        ) : (
          sorted.map((p) => (
            <PaymentRow key={p.id} payment={p} onReview={setReviewPayment} />
          ))
        )}
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          programs={programs}
          onClose={() => setShowUpload(false)}
          onSuccess={(data) => {
            setShowUpload(false)
            showToast('Comprobante subido. El OCR está procesando.')
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

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
