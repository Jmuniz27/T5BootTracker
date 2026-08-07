import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPayment, approvePayment, rejectPayment, notifyCoordinator, getMonitoring } from '../api/payments.api'
import { useModalA11y } from '../hooks/use-modal-a11y'
import Spinner from './ui/Spinner'
import Skeleton from './ui/Skeleton'

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

// `onNotice` avisa sin cerrar el modal: aprobar y rechazar terminan la revision,
// pero notificar al coordinador no, y usar `onSuccess` para ambos hacia que
// avisarle al coordinador cerrara la pantalla del comprobante que se revisaba.
export default function PaymentDetailModal({ paymentId, bootcamperId, onClose, onSuccess, onNotice }) {
  const [tab, setTab] = useState('details')
  const [approveData, setApproveData] = useState({ confirmed_amount: '', confirmed_bank_name: '', confirmed_transaction_id: '' })
  const [rejectReason, setRejectReason] = useState('')
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()
  const dialogRef = useModalA11y(onClose)

  const { data: payment, isLoading } = useQuery({
    queryKey: ['payment-detail', paymentId],
    queryFn: () => getPayment(paymentId),
  })

  // Mismo criterio que BootcamperPaymentDetailPage: sólo se puede notificar al
  // coordinador si el pago está en estado crítico. El backend es la fuente de
  // verdad (devuelve 400 si no lo está); esto sólo evita mostrar el botón
  // habilitado cuando de todas formas va a fallar.
  const { data: monitoring } = useQuery({
    queryKey: ['payment-monitoring-for-notify', payment?.program],
    queryFn: () => getMonitoring({ program_id: payment.program }),
    enabled: !!payment?.program,
  })
  const bootcamperSummary = monitoring?.find((row) => row.bootcamper_id === bootcamperId)
  const isCritical = bootcamperSummary?.payment_status === 'CRITICAL'

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

  const notify = onNotice || onSuccess

  const notifyMutation = useMutation({
    mutationFn: () =>
      notifyCoordinator(bootcamperId, payment?.program, {
        source: 'receipt_review',
        paymentId,
      }),
    onSuccess: () => notify('Coordinador notificado.'),
    onError: () => notify('No se pudo notificar al coordinador.', 'error'),
  })

  const handleCopy = () => {
    if (payment?.ocr_raw_text) {
      navigator.clipboard.writeText(payment.ocr_raw_text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const confidence = payment?.ocr_confidence || {}

  // Sólo un pago sin revisar se puede aprobar o rechazar. En el historial la
  // solicitud ya fue resuelta, así que ofrecer esas acciones era engañoso: el
  // backend responde 400 porque el pago no está pendiente.
  const isPending = payment ? ['PENDING', 'DRAFT'].includes(payment.status) : false
  const isRejected = payment?.status === 'REJECTED'

  const tabs = [
    { id: 'details', label: 'Campos OCR' },
    { id: 'raw',     label: 'Texto crudo' },
    // El motivo se lee acá y no en la tarjeta del historial: la tarjeta lista,
    // el detalle explica.
    ...(isRejected ? [{ id: 'reason', label: 'Motivo del rechazo' }] : []),
    ...(isPending ? [{ id: 'action', label: 'Aprobar / Rechazar' }] : []),
  ]

  // Si la pestaña activa no existe para este pago —por ejemplo 'action' tras
  // aprobarlo en esta misma sesión— se vuelve a la primera.
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'details'

  function renderTabs() {
    return (
      <>
        {/* Tabs */}
        <div role="tablist" aria-label="Secciones del pago" className="flex border-b border-gray-100 px-4 sm:px-6 flex-shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              data-testid={`payment-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213A8E] ${
                activeTab === t.id
                  ? 'border-[#213A8E] text-[#213A8E]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div key={activeTab} className="px-6 py-5 overflow-y-auto flex-1 min-h-0 animate-fade-in">
          {/* OCR Fields */}
          {activeTab === 'details' && (
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
                    <span className="text-sm font-medium text-gray-900">{value || <span className="text-gray-500">—</span>}</span>
                    <ConfidenceBadge value={confidence[conf]} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Raw text */}
          {activeTab === 'raw' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">Texto extraído por OCR — copia para pegar en otro sistema.</p>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#213A8E] hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

          {/* Motivo del rechazo */}
          {activeTab === 'reason' && (
            <div>
              <p className="text-sm text-gray-500 mb-3">
                Motivo que registró quien revisó la solicitud.
              </p>
              <p
                data-testid="payment-rejection-reason"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-wrap"
              >
                {payment.rejection_reason || 'No se registró un motivo.'}
              </p>
              {payment.validated_by_name && (
                <p className="mt-3 text-xs text-gray-500">
                  Rechazado por {payment.validated_by_name}
                  {payment.validated_at && ` el ${new Date(payment.validated_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                </p>
              )}
            </div>
          )}

          {/* Approve / Reject */}
          {activeTab === 'action' && (
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
                  <div className="sm:col-span-2">
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
                  <p className="text-red-500 text-xs animate-shake">{approveMutation.error?.response?.data?.error || 'Error al aprobar.'}</p>
                )}
                <button
                  data-testid="approve-submit"
                  disabled={!approveData.confirmed_amount || approveMutation.isPending}
                  onClick={() => approveMutation.mutate(approveData)}
                  className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
                >
                  {approveMutation.isPending && <Spinner />}
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
                  <p className="text-red-500 text-xs animate-shake">{rejectMutation.error?.response?.data?.error || 'Error al rechazar.'}</p>
                )}
                <button
                  data-testid="reject-submit"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate({ rejection_reason: rejectReason })}
                  className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
                >
                  {rejectMutation.isPending && <Spinner />}
                  {rejectMutation.isPending ? 'Rechazando...' : 'Rechazar pago'}
                </button>
              </div>

              {isCritical && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700">Notificar coordinador</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Envía una alerta al coordinador del programa.</p>
                    </div>
                    <button
                      disabled={notifyMutation.isPending}
                      onClick={() => notifyMutation.mutate()}
                      className="text-sm text-[#213A8E] font-medium border border-[#213A8E] px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition-colors"
                    >
                      {notifyMutation.isPending ? 'Enviando...' : 'Notificar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del pago"
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Detalle del pago</h2>
            {payment && (
              <p className="text-xs text-gray-500 mt-0.5">{payment.bootcamper_name} · {payment.program_name}</p>
            )}
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

        {isLoading && (
          <div aria-busy="true" className="p-6 space-y-3 overflow-y-auto">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}
        {!isLoading && payment && renderTabs()}
      </div>
    </div>
  )
}
