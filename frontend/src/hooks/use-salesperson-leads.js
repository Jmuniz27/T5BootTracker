import { useQuery } from '@tanstack/react-query'
import { getSalespersonLeads } from '../api/analytics.api'

// Detalle lead por lead de un vendedor (drill-down de CR-006).
// `filters` = { fecha_desde, fecha_hasta, segment }.
// Sin `salespersonId` la query queda deshabilitada: el endpoint exige vendedor.
export function useSalespersonLeads(salespersonId, filters = {}) {
  return useQuery({
    queryKey: ['salesperson-leads', salespersonId, filters],
    queryFn: () => getSalespersonLeads({ ...filters, salesperson: salespersonId }),
    enabled: Boolean(salespersonId),
  })
}
