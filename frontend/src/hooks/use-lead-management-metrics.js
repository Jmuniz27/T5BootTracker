import { useQuery } from '@tanstack/react-query'
import { getLeadManagementMetrics } from '../api/analytics.api'

// Métricas de gestión de leads por vendedor (CR-006).
// `filters` = { fecha_desde, fecha_hasta, segment, campaign }.
export function useLeadManagementMetrics(filters = {}) {
  return useQuery({
    queryKey: ['lead-management-metrics', filters],
    queryFn: () => getLeadManagementMetrics(filters),
  })
}
