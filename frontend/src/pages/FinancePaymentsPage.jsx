import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignBootcamper,
  getBootcamperPool,
  getPrograms,
  releaseBootcamper,
} from '../api/payments.api'
import StatCard from '../components/StatCard'
import CustomSelect from '../components/CustomSelect'
import { getCohorts } from '../api/programs.api'
import { getBootcamperAssignmentSetting } from '../api/payments.api'
import Toast from '../components/Toast'
import Skeleton from '../components/ui/Skeleton'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS = {
  ON_TRACK: { bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  AT_RISK:  { bg: 'bg-amber-100',   text: 'text-amber-700',   bar: 'bg-amber-500'   },
  CRITICAL: { bg: 'bg-red-100',     text: 'text-red-600',     bar: 'bg-red-500'     },
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v == null) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Bootcamper Card ──────────────────────────────────────────────────────────

function BootcamperCard({ bc, onClick, action }) {
  const { t } = useTranslation()
  const statusKey = STATUS[bc.payment_status] ? bc.payment_status : 'ON_TRACK'
  const cfg       = STATUS[statusKey]
  const totalCost = parseFloat(bc.total_cost) || 1
  const totalPaid = parseFloat(bc.total_paid) || 0
  const paidPct   = Math.min((totalPaid / totalCost) * 100, 100)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl hover:shadow-md hover:border-[#213A8E]/30 transition-all group">
    {/* El botón de acción va fuera de esta zona: un <button> no puede anidarse. */}
    <button
      onClick={onClick}
      className={`p-5 text-left w-full ${action ? 'pb-3' : ''}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(bc.bootcamper_name ?? 'bootcamper')}`}
            alt={bc.bootcamper_name}
            className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0 object-cover"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#213A8E] transition-colors truncate">
              {bc.bootcamper_name}
            </p>
            <p className="text-xs text-gray-500 truncate">{bc.email}</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${cfg.bg} ${cfg.text}`}>
          {t(`payments.monitoringStatus.${statusKey}`)}
        </span>
      </div>

      {/* Programa y cohorte: sin la edición no se sabe de qué grupo se cobra */}
      <p className="text-xs text-gray-500 mb-3 truncate">
        {bc.program_name}
        {bc.cohort_number != null && (
          <span className="text-gray-400"> · {t('payments.finance.cohortNumber', { number: bc.cohort_number })}</span>
        )}
      </p>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-500">{t('payments.finance.paid')}</span>
          <span className="text-xs font-semibold text-gray-700">{paidPct.toFixed(0)}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${paidPct}%` }} />
        </div>
      </div>

      {/* Amounts */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-lg font-bold text-gray-900 leading-tight">{fmt(bc.total_paid)}</p>
          <p className="text-xs text-gray-500">{t('payments.finance.ofAmount', { amount: fmt(bc.total_cost) })}</p>
        </div>
        {bc.pending_payments > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('payments.finance.pending', { count: bc.pending_payments })}
          </span>
        )}
      </div>
    </button>
    {action && <div className="px-5 pb-4">{action}</div>}
    </div>
  )
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div aria-busy="true" className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 flex-shrink-0" rounded="rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-1.5 w-full mb-3" rounded="rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// El backend topea page_size en 100; sin paginación en la UI se pide el máximo
// y el filtrado fino (búsqueda, programa, estado) lo resuelve el servidor.
const PAGE_SIZE = 100

export default function FinancePaymentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch]             = useState('')
  const [tab, setTab]                   = useState('cobro')
  const [programId, setProgramId]       = useState('')
  const [cohortId, setCohortId]         = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [toast, setToast]               = useState(null) // { message, type }

  const showToast = (message, type = 'success') => setToast({ message, type })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['bootcamper-pool', { programId, cohortId, statusFilter, search }],
    queryFn: () => getBootcamperPool({
      program_id: programId || undefined,
      cohort_id:  cohortId || undefined,
      status:     statusFilter || undefined,
      search:     search || undefined,
      page_size:  PAGE_SIZE,
    }),
  })

  const { data: cohorts = [] } = useQuery({
    queryKey: ['cohorts', programId],
    queryFn: () => getCohorts(programId),
    enabled: Boolean(programId),
  })

  // Si el Administrador apagó la auto-asignación, el botón de tomar del pool no
  // debe ofrecerse: el backend responde 403 igual, y ofrecerlo sería engañoso.
  const { data: assignSetting } = useQuery({
    queryKey: ['bootcamper-assignment-setting'],
    queryFn: getBootcamperAssignmentSetting,
  })
  const puedeAutoasignarse = assignSetting?.self_assign_enabled ?? true

  const mine      = data?.my_bootcampers ?? []
  const available = data?.available_bootcampers ?? []

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  })

  const refreshPool = () => {
    queryClient.invalidateQueries({ queryKey: ['bootcamper-pool'] })
    queryClient.invalidateQueries({ queryKey: ['payment-monitoring'] })
  }

  const assignMutation = useMutation({
    mutationFn: assignBootcamper,
    onSuccess: () => {
      refreshPool()
      showToast(t('payments.finance.toast.assigned'))
    },
    onError: (err) => {
      // 409: otra persona de Finanzas lo tomó primero. Se refresca igual para
      // que la tarjeta desaparezca del pool en vez de quedar como señuelo.
      refreshPool()
      showToast(err.response?.data?.error ?? t('payments.finance.toast.assignError'), 'error')
    },
  })

  const releaseMutation = useMutation({
    mutationFn: releaseBootcamper,
    onSuccess: () => {
      refreshPool()
      showToast(t('payments.finance.toast.released'))
    },
    onError: (err) => {
      showToast(err.response?.data?.error ?? t('payments.finance.toast.releaseError'), 'error')
    },
  })

  // Quien terminó de pagar sigue asignado a la misma persona de Finanzas: se
  // separa la vista, no la responsabilidad. Liberarlo automáticamente borraría
  // el rastro de quién lo cobró.
  const enCobro    = mine.filter((b) => !b.is_fully_paid)
  const finalizados = mine.filter((b) => b.is_fully_paid)
  const visibles   = tab === 'finalizados' ? finalizados : enCobro

  let mensajeVacio = t('payments.finance.emptyNoOne')
  if (tab === 'finalizados') mensajeVacio = t('payments.finance.emptyNoneFinished')
  else if (search) mensajeVacio = t('payments.finance.emptyNoMatch')

  const stats = {
    total:    enCobro.length,
    critical: enCobro.filter((b) => b.payment_status === 'CRITICAL').length,
    atRisk:   enCobro.filter((b) => b.payment_status === 'AT_RISK').length,
    onTrack:  enCobro.filter((b) => b.payment_status === 'ON_TRACK').length,
  }

  const handleCardClick = (bc) => {
    navigate(`/payments/${bc.bootcamper_id}/${bc.program_id}`, { state: { bc } })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('payments.finance.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('payments.finance.subtitle')}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      {!isLoading && mine.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label={t('payments.finance.statBootcampers')}
            value={stats.total}
            iconClass="bg-[#213A8E]/10 text-[#213A8E]"
            icon={(
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            )}
          />
          <StatCard
            label={t('payments.finance.statCritical')}
            value={stats.critical}
            containerClass="bg-red-50 border-red-100"
            valueClass="text-red-600"
            labelClass="text-red-500"
            iconClass="bg-red-100 text-red-600"
            icon={(
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
          />
          <StatCard
            label={t('payments.finance.statAtRisk')}
            value={stats.atRisk}
            containerClass="bg-amber-50 border-amber-100"
            valueClass="text-amber-600"
            labelClass="text-amber-600"
            iconClass="bg-amber-100 text-amber-600"
            icon={(
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            )}
          />
          <StatCard
            label={t('payments.finance.statOnTrack')}
            value={stats.onTrack}
            containerClass="bg-emerald-50 border-emerald-100"
            valueClass="text-emerald-600"
            labelClass="text-emerald-600"
            iconClass="bg-emerald-100 text-emerald-600"
            icon={(
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('payments.finance.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent bg-white"
          />
        </div>
        <CustomSelect
          value={programId}
          onChange={(val) => { setProgramId(val); setCohortId('') }}
          options={[
            { value: '', label: t('payments.finance.allPrograms') },
            ...programs.map((p) => ({ value: p.id, label: p.name })),
          ]}
          placeholder={t('payments.finance.allPrograms')}
        />
        {/* Sólo con un programa elegido: una cohorte suelta no identifica nada,
            porque el número se repite entre programas. */}
        {programId && (
          <CustomSelect
            value={cohortId}
            onChange={setCohortId}
            options={[
              { value: '', label: t('payments.finance.allCohorts') },
              ...cohorts.map((c) => ({
                value: c.id,
                label: t('payments.finance.cohortOption', { number: c.number, status: c.status_label }),
              })),
            ]}
            placeholder={t('payments.finance.allCohorts')}
            ariaLabel={t('payments.finance.filterByCohort')}
          />
        )}
        <CustomSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: t('payments.finance.allStatuses') },
            { value: 'CRITICAL', label: t('payments.monitoringStatus.CRITICAL') },
            { value: 'AT_RISK', label: t('payments.monitoringStatus.AT_RISK') },
            { value: 'ON_TRACK', label: t('payments.monitoringStatus.ON_TRACK') },
          ]}
          placeholder={t('payments.finance.allStatuses')}
        />
        {isFetching && !isLoading && (
          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!isLoading && (
        <>
          {/* Quien completó el pago no desaparece ni se libera: pasa de pestaña.
              Así se distingue a quién hay que seguir cobrando. */}
          <div role="tablist" aria-label={t('payments.finance.tablistAria')} className="flex gap-1 mb-5 border-b border-gray-200">
            {[
              { id: 'cobro', label: t('payments.finance.tabInProgress', { count: enCobro.length }) },
              { id: 'finalizados', label: t('payments.finance.tabFinished', { count: finalizados.length }) },
            ].map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  tab === id
                    ? 'border-[#1D3176] text-[#1D3176]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Section
            title={tab === 'finalizados' ? t('payments.finance.sectionFinished') : t('payments.finance.sectionMine')}
            count={visibles.length}
            empty={mensajeVacio}
            cards={visibles}
            onCardClick={handleCardClick}
            renderAction={(bc) => (
              <CardAction
                label={t('payments.finance.release')}
                pendingLabel={t('payments.finance.releasing')}
                variant="secondary"
                // Con la auto-asignación apagada el pool lo maneja el Admin: si
                // liberás no podrías retomarlo, así que tampoco se libera.
                disabled={!puedeAutoasignarse}
                isPending={releaseMutation.isPending && releaseMutation.variables === bc.bootcamper_id}
                onClick={() => releaseMutation.mutate(bc.bootcamper_id)}
              />
            )}
          />

          <Section
            title={t('payments.finance.available')}
            subtitle={
              puedeAutoasignarse
                ? t('payments.finance.availableSubtitle')
                : t('payments.finance.availableSubtitleDisabled')
            }
            count={available.length}
            empty={t('payments.finance.poolEmpty')}
            cards={available}
            onCardClick={handleCardClick}
            renderAction={(bc) => (
              <CardAction
                label={t('payments.finance.assign')}
                pendingLabel={t('payments.finance.assigning')}
                disabled={!puedeAutoasignarse}
                isPending={assignMutation.isPending && assignMutation.variables === bc.bootcamper_id}
                onClick={() => assignMutation.mutate(bc.bootcamper_id)}
              />
            )}
          />
        </>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

// ─── Secciones ────────────────────────────────────────────────────────────────

function Section({ title, subtitle, count, empty, cards, onCardClick, renderAction }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
        {subtitle && <span className="text-xs text-gray-400">— {subtitle}</span>}
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl py-8 text-center">
          {empty}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((bc) => (
            <BootcamperCard
              key={`${bc.bootcamper_id}-${bc.program_id}`}
              bc={bc}
              onClick={() => onCardClick(bc)}
              action={renderAction(bc)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CardAction({ label, pendingLabel, onClick, isPending, disabled = false, variant = 'primary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-[#213A8E] text-white hover:bg-[#1a2f72]'
      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'

  return (
    <button
      onClick={onClick}
      disabled={isPending || disabled}
      className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60 ${styles}`}
    >
      {isPending ? pendingLabel : label}
    </button>
  )
}
