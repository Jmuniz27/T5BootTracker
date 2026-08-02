import { useLeadManagementMetrics } from '../../hooks/use-lead-management-metrics'

/** "—" para dato ausente; 0 es un valor real y se muestra como 0. */
const fmtHours = (value) =>
  value === null || value === undefined ? '—' : `${value} h`

function TableStateRow({ children }) {
  return (
    <tr>
      <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
        {children}
      </td>
    </tr>
  )
}

function SummaryCard({ label, value, footer, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse">
        <div className="h-3 w-40 rounded bg-gray-200 mb-3" />
        <div className="h-9 w-20 rounded bg-gray-200 mb-2" />
        <div className="h-3 w-24 rounded bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {footer && <p className="text-xs text-gray-400 mt-1">{footer}</p>}
    </div>
  )
}

/**
 * Métricas de gestión de leads por vendedor (CR-006), sobre
 * GET /api/analytics/lead-management/.
 *
 * Retención = tiempo que el vendedor mantiene el lead (hasta liberarlo, o
 * hasta ahora si sigue asignado). Primer contacto = desde la asignación hasta
 * la primera interacción registrada.
 */
export default function LeadManagementMetrics({ filters = {} }) {
  const { data, isLoading, isError, error } = useLeadManagementMetrics(filters)

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        No pudimos cargar las métricas de gestión
        {error?.response?.status === 403
          ? ' (requiere permisos de administrador).'
          : '. Intenta de nuevo.'}
      </div>
    )
  }

  const rows = data?.by_salesperson ?? []

  return (
    <section className="mt-8">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Gestión de leads por vendedor</h2>
        <p className="text-sm text-gray-500">
          Tiempo de retención y de primer contacto sobre los leads asignados.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <SummaryCard
          isLoading={isLoading}
          label="Retención promedio"
          value={fmtHours(data?.avg_retention_hours)}
          footer={`${data?.leads_considered ?? 0} leads asignados`}
        />
        <SummaryCard
          isLoading={isLoading}
          label="Tiempo al primer contacto"
          value={fmtHours(data?.avg_time_to_first_contact_hours)}
          footer="Desde la asignación hasta la primera interacción"
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th scope="col" className="text-left font-medium px-5 py-3">Vendedor</th>
                <th scope="col" className="text-right font-medium px-5 py-3">Leads activos</th>
                <th scope="col" className="text-right font-medium px-5 py-3">Retención prom.</th>
                <th scope="col" className="text-right font-medium px-5 py-3">Primer contacto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && <TableStateRow>Cargando métricas…</TableStateRow>}
              {!isLoading && rows.length === 0 && (
                <TableStateRow>Sin leads asignados en este período</TableStateRow>
              )}
              {!isLoading &&
                rows.map((row) => (
                  <tr key={row.salesperson_id}>
                    <td className="px-5 py-3 text-gray-900">{row.salesperson}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{row.active_leads}</td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {fmtHours(row.avg_retention_hours)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {fmtHours(row.avg_time_to_first_contact_hours)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
