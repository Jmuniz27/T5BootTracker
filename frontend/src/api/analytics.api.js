import client from './client'

// GET /api/analytics/kpis/ — KPIs del dashboard de analítica (solo Admin).
// Params opcionales: fecha_desde, fecha_hasta (YYYY-MM-DD), segment, campaign.
export const getAnalyticsKpis = (params = {}) =>
  client.get('/analytics/kpis/', { params }).then((r) => r.data)

// GET /api/analytics/lead-management/ — métricas de gestión por vendedor (CR-006, solo Admin).
// Mismos params que los KPIs.
export const getLeadManagementMetrics = (params = {}) =>
  client.get('/analytics/lead-management/', { params }).then((r) => r.data)

// GET /api/analytics/export/ — descarga el reporte (CB-58, solo Admin).
// Devuelve el blob y el nombre de archivo que sugiere el backend.
export const exportAnalyticsReport = (format, params = {}) =>
  client
    .get('/analytics/export/', { params: { ...params, format }, responseType: 'blob' })
    .then((r) => ({
      blob: r.data,
      filename: parseFilename(r.headers?.['content-disposition']) ?? `analitica.${format}`,
    }))

function parseFilename(contentDisposition) {
  const match = /filename="?([^"]+)"?/.exec(contentDisposition ?? '')
  return match?.[1]
}
