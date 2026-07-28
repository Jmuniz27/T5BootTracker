import { useState, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getDashboard } from '../api/analytics.api'
import { getPrograms } from '../api/payments.api'
import KpiCard from '../components/analytics/KpiCard'
import DateRangeFilter from '../components/analytics/DateRangeFilter'
import LeadsTrendChart from '../components/analytics/LeadsTrendChart'
import RevenueChart from '../components/analytics/RevenueChart'
import StatusBreakdown from '../components/analytics/StatusBreakdown'
import ConversionFunnel from '../components/analytics/ConversionFunnel'
import LeadManagementMetrics from '../components/analytics/LeadManagementMetrics'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const fmtMoney = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const [tab, setTab] = useState('graficos')
  const [filters, setFilters] = useState({
    dateFrom: isoDaysAgo(29),
    dateTo: isoDaysAgo(0),
    segment: 'all',
    programId: '',
  })

  const patch = (partial) => setFilters((f) => ({ ...f, ...partial }))

  const invalidRange =
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  })

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['analytics-dashboard', filters],
    queryFn: () =>
      getDashboard({
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        segment: filters.segment || undefined,
        program_id: filters.programId || undefined,
      }),
    enabled: !invalidRange,
    placeholderData: keepPreviousData,
  })

  const kpis = data?.kpis
  const hasData = useMemo(
    () => !!data && (kpis?.total_leads > 0 || (data.leads_over_time?.length ?? 0) > 0),
    [data, kpis],
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Métricas de leads, conversión y pagos</p>
        </div>
        {isFetching && !isLoading && (
          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {/* Filters */}
      <DateRangeFilter
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        segment={filters.segment}
        programId={filters.programId}
        programs={programs}
        onChange={patch}
        invalidRange={invalidRange}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { id: 'graficos', label: 'Resumen' },
          { id: 'gestion', label: 'Gestión de leads' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-[#213A8E] text-[#213A8E]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {isError ? (
        <div className="py-20 text-center">
          <p className="text-sm text-gray-500 mb-4">No se pudieron cargar las métricas.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2.5 rounded-xl bg-[#213A8E] text-white text-sm font-semibold hover:bg-[#1a2f72] transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* Tab: Resumen — KPIs + gráficos */}
          {tab === 'graficos' && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <KpiCard label="Total de leads" value={kpis?.total_leads ?? '—'} deltaPct={kpis?.leads_delta_pct} loading={isLoading} />
                <KpiCard label="Tasa de conversión" value={fmtPct(kpis?.conversion_rate)} deltaPct={kpis?.conversion_delta_pct} loading={isLoading} />
                <KpiCard label="Ingresos recaudados" value={fmtMoney(kpis?.revenue_collected)} deltaPct={kpis?.revenue_delta_pct} loading={isLoading} />
                <KpiCard label="Pagos pendientes" value={kpis?.pending_payments ?? '—'} loading={isLoading} />
              </div>

              {/* Empty state (loaded but no data in range) */}
              {!isLoading && !hasData && (
                <div className="py-16 text-center text-sm text-gray-400">
                  No hay actividad en el rango seleccionado. Prueba ampliar las fechas.
                </div>
              )}

              {/* Charts */}
              {(isLoading || hasData) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <LeadsTrendChart data={data?.leads_over_time} loading={isLoading} />
                  <RevenueChart data={data?.revenue_over_time} loading={isLoading} />
                  <StatusBreakdown data={data?.leads_by_status} loading={isLoading} />
                  <ConversionFunnel data={data?.conversion_funnel} loading={isLoading} />
                </div>
              )}
            </>
          )}

          {/* Tab: Gestión de leads — trazabilidad temporal (CB-122 · CR-006) */}
          {tab === 'gestion' && (
            <LeadManagementMetrics data={data?.lead_management} loading={isLoading} />
          )}
        </>
      )}
    </div>
  )
}
