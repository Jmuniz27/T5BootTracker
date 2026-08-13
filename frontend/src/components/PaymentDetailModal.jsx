import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPayment, approvePayment, rejectPayment, editPayment, notifyCoordinator, getMonitoring } from '../api/payments.api'
import { useModalA11y } from '../hooks/use-modal-a11y'
import Spinner from './ui/Spinner'
import Skeleton from './ui/Skeleton'
import ReceiptPreview from './payments/ReceiptPreview'

function confidenceColor(pct) {
  if (pct >= 80) return 'text-green-600'
  if (pct >= 50) return 'text-yellow-600'
  return 'text-red-500'
}

function ConfidenceBadge({ value }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  return <span className={`text-xs font-medium ${confidenceColor(pct)}`}>{pct}%</span>
}

// Los campos que Finanzas confirma. Se precargan con lo que leyó el OCR: el
// dato está a la vista en el comprobante, así que hacer que se reescriba a mano
// sólo invitaba a equivocarse.
const FIELDS = [
  { key: 'confirmed_amount',         ocr: 'ocr_amount',         conf: 'amount',         labelKey: 'amountLabel', placeholderKey: 'amountPlaceholder', inputMode: 'decimal' },
  { key: 'confirmed_bank_name',      ocr: 'ocr_bank_name',      conf: 'bank_name',      labelKey: 'bankLabel',   placeholderKey: 'bankPlaceholder' },
  { key: 'confirmed_transaction_id', ocr: 'ocr_transaction_id', conf: 'transaction_id', labelKey: 'txLabel',     placeholderKey: 'txPlaceholder' },
]

// Monto: sólo dígitos y un separador decimal, máximo 2 decimales. Mismo criterio
// que el formulario del bootcamper.
function sanitizeAmount(raw) {
  const v = raw.replace(/[^\d.,]/g, '').replace(/,/g, '.')
  const [intPart, ...rest] = v.split('.')
  if (rest.length === 0) return intPart
  return `${intPart}.${rest.join('').slice(0, 2)}`
}

// `onNotice` avisa sin cerrar el modal: aprobar y rechazar terminan la revision,
// pero notificar al coordinador no, y usar `onSuccess` para ambos hacia que
// avisarle al coordinador cerrara la pantalla del comprobante que se revisaba.
export default function PaymentDetailModal({ paymentId, bootcamperId, onClose, onSuccess, onNotice }) {
  const { t } = useTranslation()
  const [fields, setFields] = useState({ confirmed_amount: '', confirmed_bank_name: '', confirmed_transaction_id: '' })
  // Datos del comprobante que Finanzas puede corregir en un pendiente (fecha,
  // banco/cuenta y últimos dígitos) antes de aprobar o rechazar.
  const [ocrEdit, setOcrEdit] = useState({ ocr_payment_date: '', ocr_bank_name: '', ocr_account_last_digits: '' })
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
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

  // Precarga con lo confirmado si ya se revisó, y si no con lo que leyó el OCR.
  useEffect(() => {
    if (!payment) return
    setFields({
      confirmed_amount: payment.confirmed_amount || payment.ocr_amount || '',
      confirmed_bank_name: payment.confirmed_bank_name || payment.ocr_bank_name || '',
      confirmed_transaction_id: payment.confirmed_transaction_id || payment.ocr_transaction_id || '',
    })
    setOcrEdit({
      ocr_payment_date: payment.ocr_payment_date || '',
      ocr_bank_name: payment.ocr_bank_name || '',
      ocr_account_last_digits: payment.ocr_account_last_digits || '',
    })
  }, [payment])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payment-queue'] })
    qc.invalidateQueries({ queryKey: ['payment-queue-bootcamper'] })
    qc.invalidateQueries({ queryKey: ['payment-monitoring'] })
    // Al aprobar/rechazar, el pago sale de pendientes y entra al historial:
    // sin esto había que recargar la página para verlo ahí.
    qc.invalidateQueries({ queryKey: ['payment-history'] })
    qc.invalidateQueries({ queryKey: ['payment-detail', paymentId] })
  }

  const approveMutation = useMutation({
    mutationFn: (data) => approvePayment(paymentId, data),
    onSuccess: () => { invalidate(); onSuccess(t('payments.detail.toast.approved')) },
  })

  const rejectMutation = useMutation({
    mutationFn: (data) => rejectPayment(paymentId, data),
    onSuccess: () => { invalidate(); onSuccess(t('payments.detail.toast.rejected')) },
  })

  const editMutation = useMutation({
    mutationFn: (data) => editPayment(paymentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-detail', paymentId] })
      qc.invalidateQueries({ queryKey: ['payment-queue'] })
      onSuccess(t('payments.detail.toast.updated'))
    },
  })

  const notify = onNotice || onSuccess

  const notifyMutation = useMutation({
    mutationFn: () =>
      notifyCoordinator(bootcamperId, payment?.program, {
        source: 'receipt_review',
        paymentId,
      }),
    onSuccess: () => notify(t('payments.detail.toast.notified')),
    onError: () => notify(t('payments.detail.toast.notifyError'), 'error'),
  })

  const handleCopy = () => {
    if (payment?.ocr_raw_text) {
      navigator.clipboard.writeText(payment.ocr_raw_text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const setField = (key, value) =>
    setFields((prev) => ({ ...prev, [key]: key === 'confirmed_amount' ? sanitizeAmount(value) : value }))

  const confidence = payment?.ocr_confidence || {}

  // Sólo un pago sin revisar se puede aprobar o rechazar. En el historial la
  // solicitud ya fue resuelta, así que ofrecer esas acciones era engañoso: el
  // backend responde 400 porque el pago no está pendiente.
  const isPending = payment ? ['PENDING', 'DRAFT'].includes(payment.status) : false
  const isRejected = payment?.status === 'REJECTED'

  function renderBody() {
    return (
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* Comprobante — el documento oficial contra el que se valida */}
        <div className="lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-100 p-4 sm:p-6 gap-3 lg:min-h-0">
          <div className="flex items-center justify-between flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-700">{t('payments.detail.receipt')}</h3>
            {payment.receipt_file && (
              <a
                href={payment.receipt_file}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="receipt-open"
                className="flex items-center gap-1.5 text-xs font-medium text-[#213A8E] hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {t('payments.detail.openDownload')}
              </a>
            )}
          </div>
          <div
            data-testid="receipt-preview"
            className="flex-1 min-h-[280px] lg:min-h-0 bg-gray-50 border border-gray-200 rounded-xl p-2"
          >
            <ReceiptPreview url={payment.receipt_file} type={payment.receipt_file_type} />
          </div>
        </div>

        {/* Datos y acciones */}
        <div className="lg:w-1/2 p-4 sm:p-6 space-y-5 lg:overflow-y-auto lg:min-h-0">
          {isRejected && (
            <div>
              <h3 className="text-sm font-semibold text-red-600 mb-2">{t('payments.detail.rejectionTitle')}</h3>
              <p
                data-testid="payment-rejection-reason"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-wrap"
              >
                {payment.rejection_reason || t('payments.detail.noReason')}
              </p>
              {payment.validated_by_name && (
                <p className="mt-2 text-xs text-gray-500">
                  {t('payments.detail.rejectedBy', { name: payment.validated_by_name })}
                  {payment.validated_at && t('payments.detail.rejectedOn', { date: new Date(payment.validated_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) })}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">
              {isPending ? t('payments.detail.paymentData') : t('payments.detail.confirmedData')}
            </h3>
            <p className="text-xs text-gray-500 -mt-1">
              {isPending
                ? t('payments.detail.pendingHint')
                : t('payments.detail.resolvedHint')}
            </p>

            {FIELDS.map(({ key, conf, labelKey, placeholderKey, inputMode }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={key} className="text-xs font-medium text-gray-600">{t(`payments.detail.${labelKey}`)}</label>
                  <ConfidenceBadge value={confidence[conf]} />
                </div>
                <input
                  id={key}
                  type="text"
                  inputMode={inputMode}
                  data-testid={key === 'confirmed_amount' ? 'approve-amount' : key}
                  placeholder={isPending ? t(`payments.detail.${placeholderKey}`) : '—'}
                  value={fields[key]}
                  readOnly={!isPending}
                  disabled={!isPending}
                  onChange={(e) => setField(key, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#213A8E] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
            ))}

            {/* Fecha y cuenta/banco: en un pendiente, Finanzas los puede corregir. */}
            {isPending ? (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ocr_payment_date" className="block text-xs font-medium text-gray-600 mb-1">{t('payments.detail.paymentDate')}</label>
                    <input
                      id="ocr_payment_date"
                      type="date"
                      data-testid="edit-payment-date"
                      value={ocrEdit.ocr_payment_date || ''}
                      onChange={(e) => setOcrEdit((p) => ({ ...p, ocr_payment_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#213A8E] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="ocr_account_last_digits" className="block text-xs font-medium text-gray-600 mb-1">{t('payments.detail.accountLastDigits')}</label>
                    <input
                      id="ocr_account_last_digits"
                      type="text"
                      inputMode="numeric"
                      value={ocrEdit.ocr_account_last_digits || ''}
                      onChange={(e) => setOcrEdit((p) => ({ ...p, ocr_account_last_digits: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#213A8E] focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="ocr_bank_name" className="block text-xs font-medium text-gray-600 mb-1">{t('payments.detail.bankAccountDest')}</label>
                  <input
                    id="ocr_bank_name"
                    type="text"
                    value={ocrEdit.ocr_bank_name || ''}
                    onChange={(e) => setOcrEdit((p) => ({ ...p, ocr_bank_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#213A8E] focus:border-transparent"
                  />
                </div>
                <button
                  data-testid="edit-payment-save"
                  disabled={editMutation.isPending}
                  onClick={() => editMutation.mutate(ocrEdit)}
                  className="text-xs font-medium text-[#213A8E] border border-[#213A8E] px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
                >
                  {editMutation.isPending && <Spinner />}
                  {editMutation.isPending ? t('payments.detail.saving') : t('payments.detail.saveDateAccount')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs text-gray-500">{t('payments.detail.paymentDate')}</p>
                  <p className="text-sm text-gray-900">{payment.ocr_payment_date || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('payments.detail.accountLastDigits')}</p>
                  <p className="text-sm text-gray-900">{payment.ocr_account_last_digits || '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Texto crudo: herramienta de diagnóstico, no algo que se mire siempre. */}
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => setShowRaw((v) => !v)}
              aria-expanded={showRaw}
              data-testid="toggle-raw-text"
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showRaw ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('payments.detail.rawTextToggle')}
            </button>
            {showRaw && (
              <div className="mt-2">
                <div className="flex justify-end mb-1">
                  <button onClick={handleCopy} className="text-xs font-medium text-[#213A8E] hover:underline">
                    {copied ? t('payments.detail.copied') : t('payments.detail.copy')}
                  </button>
                </div>
                <pre className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                  {payment.ocr_raw_text || t('payments.detail.noRawText')}
                </pre>
              </div>
            )}
          </div>

          {isPending && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              {approveMutation.isError && (
                <p className="text-red-500 text-xs animate-shake">{approveMutation.error?.response?.data?.error || t('payments.detail.approveError')}</p>
              )}
              <button
                data-testid="approve-submit"
                disabled={!fields.confirmed_amount || approveMutation.isPending}
                onClick={() => approveMutation.mutate(fields)}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
              >
                {approveMutation.isPending && <Spinner />}
                {approveMutation.isPending ? t('payments.detail.approving') : t('payments.detail.approve')}
              </button>

              {!showReject ? (
                <button
                  data-testid="reject-open"
                  onClick={() => setShowReject(true)}
                  className="w-full border border-red-300 text-red-600 py-2.5 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  {t('payments.detail.reject')}
                </button>
              ) : (
                <div className="border border-red-200 rounded-xl p-4 space-y-3">
                  <label htmlFor="reject-reason" className="block text-xs font-medium text-gray-600">{t('payments.detail.rejectReasonLabel')}</label>
                  <textarea
                    id="reject-reason"
                    rows={3}
                    maxLength={300}
                    data-testid="reject-reason"
                    placeholder={t('payments.detail.rejectPlaceholder')}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value.slice(0, 300))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  />
                  <p className="text-right text-xs text-gray-400">{rejectReason.length}/300</p>
                  {rejectMutation.isError && (
                    <p className="text-red-500 text-xs animate-shake">{rejectMutation.error?.response?.data?.error || t('payments.detail.rejectError')}</p>
                  )}
                  <button
                    data-testid="reject-submit"
                    disabled={!rejectReason.trim() || rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate({ rejection_reason: rejectReason })}
                    className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {rejectMutation.isPending && <Spinner />}
                    {rejectMutation.isPending ? t('payments.detail.rejecting') : t('payments.detail.confirmReject')}
                  </button>
                </div>
              )}

              {isCritical && (
                <div className="border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">{t('payments.detail.notifyTitle')}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{t('payments.detail.notifyHint')}</p>
                  </div>
                  <button
                    disabled={notifyMutation.isPending}
                    onClick={() => notifyMutation.mutate()}
                    className="flex-shrink-0 text-sm text-[#213A8E] font-medium border border-[#213A8E] px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition-colors"
                  >
                    {notifyMutation.isPending ? t('payments.detail.sending') : t('payments.detail.notify')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('payments.detail.title')}
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden focus:outline-none animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('payments.detail.title')}</h2>
            {payment && (
              <p className="text-xs text-gray-500 mt-0.5">{payment.bootcamper_name} · {payment.program_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t('payments.detail.close')}
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
        {!isLoading && payment && renderBody()}
      </div>
    </div>
  )
}
