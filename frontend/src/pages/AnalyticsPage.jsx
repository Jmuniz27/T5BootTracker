import { useState } from 'react'
import AnalyticsFilters, { EMPTY_ANALYTICS_FILTERS } from '../components/analytics/AnalyticsFilters'
import AnalyticsKpiCards from '../components/analytics/AnalyticsKpiCards'
import AnalyticsCharts from '../components/analytics/AnalyticsCharts'
import LeadManagementMetrics from '../components/analytics/LeadManagementMetrics'
import AnalyticsExportButtons from '../components/analytics/AnalyticsExportButtons'

/**
 * Dashboard de analítica (HST-024). Solo Administrador — la ruta va envuelta
 * en <AdminRoute> en App.jsx.
 *
 * La página es dueña del estado `filters` y se lo pasa igual a los tres hijos.
 * KPI cards y gráficos comparten `useAnalyticsKpis(filters)`, así que la misma
 * queryKey deduplica la petición: toda la pantalla hace un solo GET.
 */
export default function AnalyticsPage() {
  const [filters, setFilters] = useState(EMPTY_ANALYTICS_FILTERS)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analítica</h1>
          <p className="text-sm text-gray-500 mt-1">
            Indicadores de conversión, tiempo de respuesta, velocidad de leads y cobro de pagos.
          </p>
        </div>
        <AnalyticsExportButtons filters={filters} />
      </header>

      <AnalyticsFilters filters={filters} onChange={setFilters} />
      <AnalyticsKpiCards filters={filters} />
      <AnalyticsCharts filters={filters} />
      <LeadManagementMetrics filters={filters} />
    </div>
  )
}
