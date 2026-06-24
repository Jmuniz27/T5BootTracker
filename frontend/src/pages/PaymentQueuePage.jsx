import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  getPaymentQueue,
  getPayment,
  approvePayment,
  rejectPayment,
  getPrograms,
  notifyCoordinator,
} from '../api/payments.api'

const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
  DRAFT: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  DRAFT: 'En revisión',
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

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ value }) {
  if (value == null) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'
  return <span className={`text-xs font-medium ${color}`}>{pct}%</span>
}

// ─── Payment Detail Modal ─────────────────────────────────────────────────────

function PaymentDetailModal({ paymentId, bootcamperId, onClose, onSuccess }) {
  const [tab, setTab] = useState('details')
  const [approveData, setApproveData] = useState({ confirmed_amount: '', confirmed_bank_name: '', confirmed_transaction_id: '' })
  const [rejectReason, setRejectReason] = useState('')
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()

  const { data: payment, isLoading } = useQuery({
    queryKey: ['payment-detail', paymentId],
    queryFn: () => getPayment(paymentId),
  })

  const approveMutation = useMutation({
    mutationFn: (data) => approvePayment(paymentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-queue'] })
      onSuccess('Pago aprobado.')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (data) => rejectPayment(paymentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-queue'] })
      onSuccess('Pago rechazado.')
    },
  })

  const notifyMutation = useMutation({
    mutationFn: () => notifyCoordinator(bootcamperId, payment?.program),
    onSuccess: () => onSuccess('Coordinador notificado.'),
  })

  const handleCopy = () => {
    if (payment?.ocr_raw_text) {
      navigator.clipboard.writeText(payment.ocr_raw_text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const confidence = payment?.ocr_confidence || {}

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Detalle del pago</h2>
            {payment && (
              <p className="text-xs text-gray-500 mt-0.5">{payment.bootcamper_name} · {payment.program_name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse overflow-y-auto">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
          </div>
        ) : payment ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
              {[
                { id: 'details', label: 'Campos OCR' },
                { id: 'raw', label: 'Texto crudo' },
                { id: 'action', label: 'Aprobar / Rechazar' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    tab === t.id
                      ? 'border-[#1D3176] text-[#1D3176]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 overflow-y-auto h-[60vh]">
              {/* OCR Fields tab */}
              {tab === 'details' && (
                <div className="space-y-1">
                  {[
                    { label: 'Banco', value: payment.ocr_bank_name, conf: 'bank_name' },
                    { label: 'Cuenta (últimos dígitos)', value: payment.ocr_account_last_digits, conf: 'account_last_digits' },
                    { label: 'Monto', value: payment.ocr_amount ? `$${parseFloat(payment.ocr_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null, conf: 'amount' },
                    { label: 'Nro. transacción', value: payment.ocr_transaction_id, conf: 'transaction_id' },
                    { label: 'Fecha de pago', value: payment.ocr_payment_date, conf: 'payment_date' },
                  ].map(({ label, value, conf }) => (
                    <div key={label} className="flex items-center justify-between py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-500 w-52">{label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-900">{value || <span className="text-gray-400">—</span>}</span>
                        <ConfidenceBadge value={confidence[conf]} />
                      </div>
                    </div>
                  ))}

                  {/* TODO: Ver comprobante — pendiente de implementar */}
                </div>
              )}

              {/* Raw text tab */}
              {tab === 'raw' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-500">Texto extraído por OCR — copia para pegar en otro sistema.</p>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-xs font-medium text-[#1D3176] hover:underline"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                    {payment.ocr_raw_text || 'Sin texto OCR disponible.'}
                  </pre>
                </div>
              )}

              {/* Action tab */}
              {tab === 'action' && (
                <div className="space-y-6">
                  {/* Approve */}
                  <div className="border border-green-200 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-green-700">Aprobar pago</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Monto confirmado *</label>
                        <input
                          type="number"
                          placeholder="Ej: 500.00"
                          value={approveData.confirmed_amount}
                          onChange={(e) => setApproveData((p) => ({ ...p, confirmed_amount: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Banco (opcional)</label>
                        <input
                          type="text"
                          placeholder="Nombre del banco"
                          value={approveData.confirmed_bank_name}
                          onChange={(e) => setApproveData((p) => ({ ...p, confirmed_bank_name: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nro. transacción (opcional)</label>
                        <input
                          type="text"
                          placeholder="ID de transacción confirmado"
                          value={approveData.confirmed_transaction_id}
                          onChange={(e) => setApproveData((p) => ({ ...p, confirmed_transaction_id: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                    {approveMutation.isError && (
                      <p className="text-red-500 text-xs">{approveMutation.error?.response?.data?.error || 'Error al aprobar.'}</p>
                    )}
                    <button
                      disabled={!approveData.confirmed_amount || approveMutation.isPending}
                      onClick={() => approveMutation.mutate(approveData)}
                      className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
                    >
                      {approveMutation.isPending ? 'Aprobando...' : 'Aprobar pago'}
                    </button>
                  </div>

                  {/* Reject */}
                  <div className="border border-red-200 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-red-600">Rechazar pago</h3>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de rechazo *</label>
                      <textarea
                        rows={3}
                        placeholder="Describe el motivo del rechazo..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                      />
                    </div>
                    {rejectMutation.isError && (
                      <p className="text-red-500 text-xs">{rejectMutation.error?.response?.data?.error || 'Error al rechazar.'}</p>
                    )}
                    <button
                      disabled={!rejectReason.trim() || rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate({ rejection_reason: rejectReason })}
                      className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
                    >
                      {rejectMutation.isPending ? 'Rechazando...' : 'Rechazar pago'}
                    </button>
                  </div>

                  {/* Notify coordinator */}
                  <div className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700">Notificar coordinador</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Envía una alerta al coordinador del programa.</p>
                      </div>
                      <button
                        disabled={notifyMutation.isPending}
                        onClick={() => notifyMutation.mutate()}
                        className="text-sm text-[#1D3176] font-medium border border-[#1D3176] px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition-colors"
                      >
                        {notifyMutation.isPending ? 'Enviando...' : 'Notificar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── Queue Row ────────────────────────────────────────────────────────────────

function QueueRow({ payment, onClick }) {
  const date = payment.ocr_payment_date || payment.submitted_at?.slice(0, 10)
  const amount = payment.ocr_amount

  return (
    <tr
      onClick={onClick}
      className="hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <td className="py-3.5 px-4">
        <p className="text-sm font-medium text-gray-900">{payment.bootcamper_name}</p>
        <p className="text-xs text-gray-400">{payment.bootcamper}</p>
      </td>
      <td className="py-3.5 px-4 text-sm text-gray-700">{payment.program_name}</td>
      <td className="py-3.5 px-4 text-sm text-gray-700">
        {amount ? `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
      </td>
      <td className="py-3.5 px-4 text-sm text-gray-500">{date || '—'}</td>
      <td className="py-3.5 px-4">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payment.status]}`}>
          {STATUS_LABELS[payment.status]}
        </span>
      </td>
      <td className="py-3.5 px-4">
        <button className="p-1.5 bg-[#1D3176] hover:bg-[#162560] text-white rounded-lg transition-colors" title="Ver detalle">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </td>
    </tr>
  )
}

function SkeletonQueueRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <td key={i} className="py-3.5 px-4">
          <div className="h-3.5 bg-gray-200 rounded w-24" />
        </td>
      ))}
    </tr>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentQueuePage() {
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [search, setSearch] = useState('')
  const [programId, setProgramId] = useState('')
  const [toast, setToast] = useState(null)

  const { data: queue = [], isLoading, isFetching } = useQuery({
    queryKey: ['payment-queue', { search, programId }],
    queryFn: () => getPaymentQueue({ search: search || undefined, program_id: programId || undefined }),
    placeholderData: keepPreviousData,
  })

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  })

  const showToast = (message, type = 'success') => setToast({ message, type })

  return (
    <div className="flex-1 bg-gray-50 min-h-screen p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payment Queue</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 items-center">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar bootcamper..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3176] focus:border-transparent bg-white"
          />
        </div>
        <select
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3176] focus:border-transparent bg-white"
        >
          <option value="">Todos los programas</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {isFetching && !isLoading && (
          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {/* Queue table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bootcamper</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Programa</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => <SkeletonQueueRow key={i} />)
            ) : queue.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm text-gray-500">No hay pagos pendientes de revisión.</p>
                </td>
              </tr>
            ) : (
              queue.map((p) => (
                <QueueRow key={p.id} payment={p} onClick={() => setSelectedPayment(p)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedPayment && (
        <PaymentDetailModal
          paymentId={selectedPayment.id}
          bootcamperId={selectedPayment.bootcamper}
          onClose={() => setSelectedPayment(null)}
          onSuccess={(msg) => {
            setSelectedPayment(null)
            showToast(msg)
          }}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
