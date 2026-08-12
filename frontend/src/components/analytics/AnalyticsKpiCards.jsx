import { useTranslation } from 'react-i18next'
import { useAnalyticsKpis } from '../../hooks/use-analytics-kpis'
import {
  toConversionCard,
  toResponseTimeCard,
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

function KpiCard({ label, value, footer, isLoading }) {
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
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {footer && <p className="text-xs text-gray-500 mt-1">{footer}</p>}
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
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAnalyticsKpis(filters)

  if (isError) {
    return (
      <p className="text-center text-red-500 py-8 text-sm">
        {t('analytics.kpi.loadError')}
      </p>
    )
  }

  const conversion = toConversionCard(data)
  const response = toResponseTimeCard(data)
  const payment = toPaymentCard(data)

  const segmentFilterActive = Boolean(filters.segment)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
      <KpiCard
        isLoading={isLoading}
        label={t('analytics.kpi.conversionRate')}
        value={fmt(conversion.value, '%')}
        footer={t('analytics.kpi.conversionFooter', { converted: conversion.converted, total: conversion.total })}
      />
      <KpiCard
        isLoading={isLoading}
        label={t('analytics.kpi.responseTime')}
        value={fmt(response.value, ' h')}
        footer={
          response.value === null
            ? t('analytics.kpi.noInteractions')
            : t('analytics.kpi.withoutResponse', { count: response.withoutResponse })
        }
      />
      <KpiCard
        isLoading={isLoading}
        label={t('analytics.kpi.payments')}
        value={fmt(payment.value, '%')}
        footer={
          segmentFilterActive
            ? t('analytics.kpi.noSourceResponse')
            : t('analytics.kpi.paymentFooter', { collected: currency.format(payment.collected), expected: currency.format(payment.expected) })
        }
      />
    </div>
  )
}
