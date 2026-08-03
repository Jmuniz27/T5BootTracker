import { useState } from 'react'
import AnalyticsFilters, { EMPTY_ANALYTICS_FILTERS } from '../components/analytics/AnalyticsFilters'
import AnalyticsKpiCards from '../components/analytics/AnalyticsKpiCards'
import AnalyticsCharts from '../components/analytics/AnalyticsCharts'
import LeadManagementMetrics from '../components/analytics/LeadManagementMetrics'
import SalespeopleActivity from '../components/admin/SalespeopleActivity'

/**
 * Dashboard de analítica (HST-024). Solo Administrador — la ruta va envuelta
 * en <AdminRoute> en App.jsx.
 *
 * Dos pestañas porque son dos lecturas del mismo negocio: la vista general
 * agrega el embudo completo, y la de vendedor lo abre por persona. La actividad
 * por vendedor vivía en la pantalla de pagos, pero medir gestión comercial es
 * analítica; pagos quedó para el cobro, que es de Finanzas.
 *
 * Los filtros sólo aplican a la vista general: la actividad de un vendedor se
 * mide sobre toda su cartera, y recortarla por fecha daría una tasa de
 * conversión que no es la de nadie.
 *
 * En la vista general, KPI cards y gráficos comparten `useAnalyticsKpis(filters)`,
 * así que la misma queryKey deduplica la petición: un solo GET.
 */

const TABS = [
  { id: 'general', label: 'Vista General' },
  { id: 'vendedor', label: 'Vendedor' },
]

export default function AnalyticsPage() {
  const [filters, setFilters] = useState(EMPTY_ANALYTICS_FILTERS)
  const [activa, setActiva] = useState('general')

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Analítica</h1>
        <p className="text-sm text-gray-500 mt-1">
          Indicadores de conversión, tiempo de respuesta, velocidad de leads y cobro de pagos.
        </p>
      </header>

      <div role="tablist" aria-label="Vistas de analítica" className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={activa === id}
            aria-controls={`panel-${id}`}
            onClick={() => setActiva(id)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
              activa === id
                ? 'border-[#1D3176] text-[#1D3176]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${activa}`} aria-labelledby={`tab-${activa}`}>
        {activa === 'general' ? (
          <>
            <AnalyticsFilters filters={filters} onChange={setFilters} />
            <AnalyticsKpiCards filters={filters} />
            <AnalyticsCharts filters={filters} />
            <LeadManagementMetrics filters={filters} />
          </>
        ) : (
          <SalespeopleActivity />
        )}
      </div>
    </div>
  )
}
