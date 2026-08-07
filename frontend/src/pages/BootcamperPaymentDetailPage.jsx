import { useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getMonitoring, getPaymentQueue, getPaymentHistory, notifyCoordinator } from '../api/payments.api'
import PaymentDetailModal from '../components/PaymentDetailModal'
import Toast from '../components/Toast'
import Skeleton from '../components/ui/Skeleton'
import PaymentHistory from '../components/payments/PaymentHistory'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS = {
  ON_TRACK: { label: 'Al día',    bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  AT_RISK:  { label: 'En riesgo', bg: 'bg-amber-100',   text: 'text-amber-700',   bar: 'bg-amber-500'   },
  CRITICAL: { label: 'Crítico',   bg: 'bg-red-100',     text: 'text-red-600',     bar: 'bg-red-500'     },
}

const PAYMENT_STATUS_COLORS = {
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
  DRAFT:    'bg-gray-100 text-gray-500',
}

const PAYMENT_STATUS_LABELS = {
  PENDING:  'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  DRAFT:    'En revisión',
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function deficitColor(deficit, isCritical) {
  if (deficit <= 0) return 'text-emerald-600'
  return isCritical ? 'text-red-600' : 'text-amber-600'
}

function fmt(v) {
  if (v == null) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── SVG Donut Chart ──────────────────────────────────────────────────────────

function DonutChart({ totalCost, totalPaid, deficit }) {
  const r = 52, cx = 68, cy = 68
  const C = 2 * Math.PI * r
  const total = parseFloat(totalCost) || 1
  const paid  = parseFloat(totalPaid) || 0
  const def   = parseFloat(deficit)   || 0
  const paidPct = Math.min(paid / total, 1)
  const defPct  = Math.min(def / total, Math.max(0, 1 - paidPct))
  const paidLen = paidPct * C
  const defLen  = defPct * C
  const paidDeg = paidPct * 360
  const arcColor = '#10b981'

  return (
    <svg
      viewBox="0 0 136 136"
      role="img"
      aria-label={`${Math.round(paidPct * 100)}% pagado`}
      className="w-28 h-28 sm:w-[8.5rem] sm:h-[8.5rem]"
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="13" />
      {defLen > 0.5 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef4444" strokeWidth="13"
          strokeDasharray={`${defLen} ${C - defLen}`}
          transform={`rotate(${-90 + paidDeg} ${cx} ${cy})`} />
      )}
      {paidLen > 0.5 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={arcColor} strokeWidth="13"
          strokeDasharray={`${paidLen} ${C - paidLen}`}
          transform={`rotate(-90 ${cx} ${cy})`} />
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill="#111827">
        {Math.round(paidPct * 100)}%
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="11" fill="#9ca3af">pagado</text>
    </svg>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, barClass, label, sublabel }) {
  const clamped = Math.min(Math.max(value || 0, 0), 100)
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs font-semibold text-gray-800">{clamped.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${clamped}%` }} />
      </div>
      {sublabel && <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>}
    </div>
  )
}

// ─── Payment Row ──────────────────────────────────────────────────────────────

function PaymentRow({ payment, onViewDetail }) {
  const date = payment.ocr_payment_date || payment.submitted_at?.slice(0, 10)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {payment.ocr_amount ? fmt(payment.ocr_amount) : 'Sin monto'}
          {payment.ocr_bank_name && <span className="text-gray-500 font-normal"> · {payment.ocr_bank_name}</span>}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{date || 'Sin fecha'}</p>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[payment.status]}`}>
          {PAYMENT_STATUS_LABELS[payment.status]}
        </span>
        <button
          onClick={() => onViewDetail(payment)}
          className="flex items-center gap-1.5 text-xs font-medium text-[#213A8E] border border-[#213A8E]/30 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Ver detalle
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BootcamperPaymentDetailPage() {
  const { bootcamperId, programId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [toast, setToast] = useState(null)

  // Always fetch live data; use navigation state only as initialData for instant render
  const initialBc = location.state?.bc

  const { data: monitoringData = [] } = useQuery({
    queryKey: ['payment-monitoring', { programId }],
    queryFn: () => getMonitoring({ program_id: programId }),
    initialData: initialBc ? [initialBc] : undefined,
  })

  const bc = monitoringData.find(
    (b) => b.bootcamper_id === bootcamperId && b.program_id === programId,
  ) || initialBc

  // Historial: incluye las ya revisadas, que es lo que la cola no devuelve.
  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['payment-history', bootcamperId, programId],
    queryFn: () => getPaymentHistory({ bootcamper_id: bootcamperId, program_id: programId }),
    enabled: Boolean(bootcamperId),
  })

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['payment-queue-bootcamper', bc?.email, programId],
    queryFn: () => getPaymentQueue({ search: bc.email, program_id: programId }),
    enabled: !!bc?.email,
  })

  const notifyMutation = useMutation({
    mutationFn: () => notifyCoordinator(bootcamperId, programId, { source: 'critical_deficit' }),
    onSuccess: () => setToast({ message: 'Coordinador notificado.' }),
    // Sin esto un fallo dejaba el boton como si nada hubiera pasado, y no habia
    // forma de distinguirlo de no haber hecho clic.
    onError: () => setToast({ message: 'No se pudo notificar al coordinador.', type: 'error' }),
  })

  // CB-114: el spinner centrado dejaba la pantalla practicamente en blanco.
  // El skeleton anticipa el layout real, asi que la vista no salta al cargar.
  if (!bc) {
    return (
      <div aria-busy="true" aria-label="Cargando detalle del pago" className="p-4 sm:p-6 lg:p-8 animate-fade-in">
        <Skeleton className="h-4 w-32 mb-6" />
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-14 h-14" rounded="rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-full max-w-[16rem]" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
              <Skeleton className="h-3 w-24 mb-3" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" rounded="rounded-xl" />)}
        </div>
      </div>
    )
  }

  const cfg            = STATUS[bc.payment_status] || STATUS.ON_TRACK
  const totalCost      = parseFloat(bc.total_cost)              || 0
  const totalPaid      = parseFloat(bc.total_paid)              || 0
  const deficit        = parseFloat(bc.deficit)                 || 0
  const paymentPct     = bc.payment_percentage                  || 0
  const timePct        = bc.time_elapsed_percentage             || 0
  const expectedByNow  = parseFloat(bc.expected_payment_by_now) || 0
  const surplus        = parseFloat(bc.surplus_amount)          || 0
  const behindBy       = Math.max(expectedByNow - totalPaid, 0)

  return (
    <div className="p-4 sm:p-6 lg:p-8">

      {/* Back button */}
      <button
        onClick={() => navigate('/payments')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors group"
      >
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver a monitoreo
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <img
            src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(bc.bootcamper_name ?? 'bootcamper')}`}
            alt={bc.bootcamper_name}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-100 shrink-0 object-cover"
          />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{bc.bootcamper_name}</h1>
            <p className="text-sm text-gray-500 mt-0.5 break-words">{bc.email} · {bc.program_name}</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-medium flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">

        {/* ── Avance de pagos ── */}
        <div className="space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Avance de pagos</h2>

          {/* Donut + stats */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex-shrink-0">
                <DonutChart
                  totalCost={totalCost}
                  totalPaid={totalPaid}
                  deficit={deficit}
                />
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total pagado</p>
                  <p className="text-2xl font-bold text-gray-900">{fmt(totalPaid)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Costo total</p>
                    <p className="text-base font-semibold text-gray-700">{fmt(totalCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Adeudado</p>
                    <p className={`text-base font-semibold ${deficitColor(deficit, bc.is_critical)}`}>
                      {deficit > 0 ? fmt(deficit) : 'Sin deuda'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pagos aprobados</p>
                    <p className="text-base font-semibold text-gray-700">{bc.payment_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Pendientes</p>
                    <p className={`text-base font-semibold ${bc.pending_payments > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                      {bc.pending_payments ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progress bars */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 space-y-4">
            <ProgressBar
              value={timePct}
              barClass="bg-slate-400"
              label="Tiempo del programa"
              sublabel={bc.program_start && bc.program_end ? `${bc.program_start} → ${bc.program_end}` : undefined}
            />
            <ProgressBar
              value={paymentPct}
              barClass={cfg.bar}
              label="Pagos realizados"
              sublabel={`${bc.payment_count ?? 0} pago${bc.payment_count !== 1 ? 's' : ''} aprobado${bc.payment_count !== 1 ? 's' : ''}`}
            />
          </div>

          {/* Alert */}
          {bc.payment_status === 'CRITICAL' && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-700">Pago crítico</p>
                  <p className="text-xs text-red-500 mt-1">
                    El déficit supera el 10% del costo total. Debería haber pagado {fmt(expectedByNow)} según el tiempo transcurrido ({timePct.toFixed(1)}% del programa).
                  </p>
                </div>
              </div>
              <button
                disabled={notifyMutation.isPending}
                onClick={() => notifyMutation.mutate()}
                className="w-full sm:w-auto shrink-0 text-xs font-medium text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {notifyMutation.isPending ? 'Enviando...' : 'Notificar coordinador'}
              </button>
            </div>
          )}

          {bc.payment_status === 'AT_RISK' && behindBy > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-amber-700">
                Atrasado en <strong>{fmt(behindBy)}</strong> respecto al avance esperado según el tiempo del programa.
              </p>
            </div>
          )}

          {bc.payment_status === 'ON_TRACK' && surplus > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
              <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-emerald-700">
                Adelantado en <strong>{fmt(surplus)}</strong> respecto al avance esperado. ¡Al día!
              </p>
            </div>
          )}
        </div>

        {/* ── Pagos pendientes ── */}
        <div className="space-y-5">
          <h2 className="text-base font-semibold text-gray-900">
            Pagos pendientes de revisión
            {payments.length > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {payments.length}
              </span>
            )}
          </h2>

          {loadingPayments && (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" rounded="rounded-xl" />)}
            </div>
          )}
          {!loadingPayments && payments.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl py-10 sm:py-16 text-center">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm text-gray-500">Sin pagos pendientes de revisión.</p>
            </div>
          )}
          {!loadingPayments && payments.length > 0 && (
            <div className="space-y-2">
              {payments.map((p) => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  onViewDetail={setSelectedPayment}
                />
              ))}
            </div>
          )}

          <PaymentHistory
            items={history}
            isLoading={loadingHistory}
            onViewDetail={setSelectedPayment}
          />
        </div>
      </div>

      {/* Payment detail modal (OCR + approve/reject) */}
      {selectedPayment && (
        <PaymentDetailModal
          paymentId={selectedPayment.id}
          bootcamperId={bootcamperId}
          onClose={() => setSelectedPayment(null)}
          onSuccess={(msg) => {
            setSelectedPayment(null)
            setToast({ message: msg })
          }}
          onNotice={(msg, type) => setToast({ message: msg, type })}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
