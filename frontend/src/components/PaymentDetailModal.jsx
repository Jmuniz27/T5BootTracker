import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPayment, approvePayment, rejectPayment, notifyCoordinator } from '../api/payments.api'

function confidenceColor(pct) {
  if (pct >= 80) return 'text-green-600'
  if (pct >= 50) return 'text-yellow-600'
  return 'text-red-500'
}

function ConfidenceBadge({ value }) {
  if (value == null) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.round(value * 100)
  return <span className={`text-xs font-medium ${confidenceColor(pct)}`}>{pct}%</span>
}

export default function PaymentDetailModal({ paymentId, bootcamperId, onClose, onSuccess }) {
  const [tab, setTab] = useState('details')
  const [approveData, setApproveData] = useState({ confirmed_amount: '', confirmed_bank_name: '', confirmed_transaction_id: '' })
  const [rejectReason, setRejectReason] = useState('')
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()

  const { data: payment, isLoading } = useQuery({
    queryKey: ['payment-detail', paymentId],
    queryFn: () => getPayment(paymentId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payment-queue'] })
    qc.invalidateQueries({ queryKey: ['payment-queue-bootcamper'] })
    qc.invalidateQueries({ queryKey: ['payment-monitoring'] })
  }

  const approveMutation = useMutation({
    mutationFn: (data) => approvePayment(paymentId, data),
    onSuccess: () => { invalidate(); onSuccess('Pago aprobado.') },
  })

  const rejectMutation = useMutation({
    mutationFn: (data) => rejectPayment(paymentId, data),
    onSuccess: () => { invalidate(); onSuccess('Pago rechazado.') },
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

  function renderTabs() {
    return (
      <>
        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-4 sm:px-6 flex-shrink-0">
          {[
            { id: 'details', label: 'Campos OCR' },
            { id: 'raw',     label: 'Texto crudo' },
            { id: 'action',  label: 'Aprobar / Rechazar' },
          ].map((t) => (
            <button
              key={t.id}
              data-testid={`payment-tab-${t.id}`}
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
          {/* OCR Fields */}
          {tab === 'details' && (
            <div className="space-y-1">
              {[
                { label: 'Banco',                    value: payment.ocr_bank_name,         conf: 'bank_name' },
                { label: 'Cuenta (últimos dígitos)', value: payment.ocr_account_last_digits, conf: 'account_last_digits' },
                { label: 'Monto',                    value: payment.ocr_amount ? `$${parseFloat(payment.ocr_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null, conf: 'amount' },
                { label: 'Nro. transacción',         value: payment.ocr_transaction_id,     conf: 'transaction_id' },
                { label: 'Fecha de pago',            value: payment.ocr_payment_date,       conf: 'payment_date' },
              ].map(({ label, value, conf }) => (
                <div key={label} className="flex items-center justify-between py-3 border-b border-gray-50">
                  <span className="text-sm text-gray-500 w-52">{label}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-900">{value || <span className="text-gray-400">—</span>}</span>
                    <ConfidenceBadge value={confidence[conf]} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Raw text */}
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

          {/* Approve / Reject */}
          {tab === 'action' && (
            <div className="space-y-6">
              <div className="border border-green-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-green-700">Aprobar pago</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Monto confirmado *</label>
                    <input
                      type="number"
                      data-testid="approve-amount"
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
                  data-testid="approve-submit"
                  disabled={!approveData.confirmed_amount || approveMutation.isPending}
                  onClick={() => approveMutation.mutate(approveData)}
                  className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
                >
                  {approveMutation.isPending ? 'Aprobando...' : 'Aprobar pago'}
                </button>
              </div>

              <div className="border border-red-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-red-600">Rechazar pago</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de rechazo *</label>
                  <textarea
                    rows={3}
                    data-testid="reject-reason"
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
                  data-testid="reject-submit"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate({ rejection_reason: rejectReason })}
                  className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {rejectMutation.isPending ? 'Rechazando...' : 'Rechazar pago'}
                </button>
              </div>

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
    )
  }

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

        {isLoading && (
          <div className="p-6 space-y-3 animate-pulse overflow-y-auto">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
          </div>
        )}
        {!isLoading && payment && renderTabs()}
      </div>
    </div>
  )
}
