import { useAnalyticsKpis } from '../../hooks/use-analytics-kpis'
import {
  toConversionCard,
  toResponseTimeCard,
  toVelocityCard,
  toPaymentCard,
} from '../../lib/analytics'

const currency = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** "—" para dato ausente; 0 es un valor real y se muestra como 0. */
const fmt = (value, suffix = '') =>
  value === null || value === undefined ? '—' : `${value}${suffix}`

function Trend({ growth }) {
  if (growth === null || growth === undefined) return null
  const up = growth >= 0
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(growth)}%
    </span>
  )
}

function KpiCard({ label, value, footer, trend, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse">
        <div className="h-3 w-28 rounded bg-gray-200 mb-3" />
        <div className="h-9 w-20 rounded bg-gray-200 mb-2" />
        <div className="h-3 w-24 rounded bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-gray-500">{label}</p>
        {trend}
      </div>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {footer && <p className="text-xs text-gray-400 mt-1">{footer}</p>}
    </div>
  )
}

/**
 * KPI cards del dashboard de analítica (S4-4a), sobre GET /api/analytics/kpis/.
 *
 * Comparte el hook y por tanto la caché con AnalyticsCharts: mismos `filters`
 * → misma queryKey → una sola petición para toda la pantalla.
 */
export default function AnalyticsKpiCards({ filters = {} }) {
  const { data, isLoading, isError } = useAnalyticsKpis(filters)

  if (isError) {
    return (
      <p className="text-center text-red-500 py-8 text-sm">
        No se pudieron cargar los indicadores. Intenta de nuevo.
      </p>
    )
  }

  const conversion = toConversionCard(data)
  const response = toResponseTimeCard(data)
  const velocity = toVelocityCard(data)
  const payment = toPaymentCard(data)

  const segmentFilterActive = Boolean(filters.segment || filters.campaign)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      <KpiCard
        isLoading={isLoading}
        label="Tasa de conversión"
        value={fmt(conversion.value, '%')}
        footer={`${conversion.converted} de ${conversion.total} leads`}
      />
      <KpiCard
        isLoading={isLoading}
        label="Tiempo de respuesta"
        value={fmt(response.value, ' h')}
        footer={
          response.value === null
            ? 'Sin interacciones registradas'
            : `Mediana ${fmt(response.median, ' h')} · ${response.withoutResponse} sin respuesta`
        }
      />
      <KpiCard
        isLoading={isLoading}
        label="Velocidad de leads"
        value={velocity.value}
        trend={<Trend growth={velocity.growth} />}
        footer={`Período anterior: ${velocity.previous}`}
      />
      <KpiCard
        isLoading={isLoading}
        label="Cobro de pagos"
        value={fmt(payment.value, '%')}
        footer={
          segmentFilterActive
            ? 'No responde a segmento/campaña'
            : `${currency.format(payment.collected)} de ${currency.format(payment.expected)}`
        }
      />
    </div>
  )
}
