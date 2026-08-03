import { useQuery } from '@tanstack/react-query'
import { getAnalyticsKpis } from '../api/analytics.api'

// Hook de datos para el dashboard de analítica (CB-55 API).
// `filters` = { fecha_desde, fecha_hasta, segment }.
export function useAnalyticsKpis(filters = {}) {
  return useQuery({
    queryKey: ['analytics-kpis', filters],
    queryFn: () => getAnalyticsKpis(filters),
  })
}
