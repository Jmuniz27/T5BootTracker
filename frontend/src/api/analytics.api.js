import client from './client'

// GET /api/analytics/kpis/ — KPIs del dashboard de analítica (solo Admin).
// Params opcionales: fecha_desde, fecha_hasta (YYYY-MM-DD), segment.
export const getAnalyticsKpis = (params = {}) =>
  client.get('/analytics/kpis/', { params }).then((r) => r.data)

// GET /api/analytics/lead-management/ — métricas de gestión por vendedor (CR-006, solo Admin).
// Mismos params que los KPIs.
export const getLeadManagementMetrics = (params = {}) =>
  client.get('/analytics/lead-management/', { params }).then((r) => r.data)

// GET /api/analytics/lead-management/leads/ — leads de un vendedor (solo Admin).
// Mismos params que arriba + `salesperson` (UUID, obligatorio).
export const getSalespersonLeads = (params = {}) =>
  client.get('/analytics/lead-management/leads/', { params }).then((r) => r.data)
