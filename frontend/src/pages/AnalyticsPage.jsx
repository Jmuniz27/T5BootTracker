import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import AnalyticsFilters, { EMPTY_ANALYTICS_FILTERS } from '../components/analytics/AnalyticsFilters'
import AnalyticsKpiCards from '../components/analytics/AnalyticsKpiCards'
import AnalyticsCharts from '../components/analytics/AnalyticsCharts'
import SalespeopleActivity from '../components/admin/SalespeopleActivity'
import SalespeopleComparison from '../components/analytics/SalespeopleComparison'

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
 *
 * La pestaña activa vive en la URL (`?tab=`) y no en estado local: al entrar al
 * detalle de un vendedor y volver, hay que aterrizar en la pestaña de la que se
 * salió. De paso, la vista queda enlazable y sobrevive a un refresco.
 */

const TABS = [
  { id: 'general', labelKey: 'analytics.tabGeneral' },
  { id: 'vendedor', labelKey: 'analytics.tabSalesperson' },
  // #327: la de vendedor muestra a uno a la vez, así que comparar obligaba a
  // cambiar de selección y acordarse de los números anteriores.
  { id: 'comparativa', labelKey: 'analytics.tabComparison' },
]

const DEFAULT_TAB = 'general'

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState(EMPTY_ANALYTICS_FILTERS)
  const [searchParams, setSearchParams] = useSearchParams()

  // Un ?tab= inventado o ausente cae en la pestaña por defecto en vez de dejar
  // la pantalla en blanco.
  const requested = searchParams.get('tab')
  const activa = TABS.some((tab) => tab.id === requested) ? requested : DEFAULT_TAB

  // replace: cambiar de pestaña no debería llenar el historial del navegador.
  const setActiva = (id) => setSearchParams(id === DEFAULT_TAB ? {} : { tab: id }, { replace: true })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('analytics.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('analytics.subtitle')}
        </p>
      </header>

      <div role="tablist" aria-label={t('analytics.tabsAria')} className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(({ id, labelKey }) => (
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
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${activa}`} aria-labelledby={`tab-${activa}`}>
        {activa === 'general' && (
          <>
            <AnalyticsFilters filters={filters} onChange={setFilters} />
            <AnalyticsKpiCards filters={filters} />
            <AnalyticsCharts filters={filters} />
          </>
        )}
        {activa === 'vendedor' && <SalespeopleActivity />}
        {activa === 'comparativa' && <SalespeopleComparison />}
      </div>
    </div>
  )
}
