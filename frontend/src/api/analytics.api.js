import client from './client'

// GET /api/analytics/kpis/ — KPIs del dashboard de analítica (solo Admin).
// Params opcionales: fecha_desde, fecha_hasta (YYYY-MM-DD), segment, campaign.
export const getAnalyticsKpis = (params = {}) =>
  client.get('/analytics/kpis/', { params }).then((r) => r.data)
