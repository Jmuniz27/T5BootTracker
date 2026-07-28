import KpiCard from './KpiCard'

/**
 * Lead management metrics — temporal traceability (CB-122 · CR-006).
 *
 * Surfaces HST-024 metrics derived from the assignment lifecycle:
 *   - avg lead retention time (assigned_at → released_at / now)
 *   - avg time to first contact (assigned_at → first interaction)
 *   - per-salesperson breakdown
 *
 * Consumes `data.lead_management` from the same analytics dashboard payload,
 * following the CB-57 mock-first contract. When the backend (CB-55 extension)
 * exposes the fields, no component change is needed.
 */

// Human-friendly duration: hours below a day, days above.
function fmtDuration(hours) {
  if (hours == null || Number.isNaN(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 24) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} d`
}

function Breakdown({ loading, rows }) {
  if (loading) {
    return (
      <div className="p-5 space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 bg-gray-100 rounded w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-400">
        No hay datos de gestión en el rango seleccionado.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="px-5 py-2.5 font-medium">Vendedor</th>
            <th className="px-5 py-2.5 font-medium text-right">Leads activos</th>
            <th className="px-5 py-2.5 font-medium text-right">Retención prom.</th>
            <th className="px-5 py-2.5 font-medium text-right">Tiempo a 1er contacto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.salesperson} className="border-b border-gray-50 last:border-0">
              <td className="px-5 py-3 text-gray-900">{row.salesperson}</td>
              <td className="px-5 py-3 text-right text-gray-700">{row.active_leads ?? '—'}</td>
              <td className="px-5 py-3 text-right text-gray-700">{fmtDuration(row.avg_retention_hours)}</td>
              <td className="px-5 py-3 text-right text-gray-700">{fmtDuration(row.avg_time_to_first_contact_hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LeadManagementMetrics({ data, loading }) {
  const bySalesperson = data?.by_salesperson ?? []

  return (
    <section className="mt-6">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Gestión de leads</h2>
        <p className="text-sm text-gray-400">Trazabilidad temporal por vendedor · CR-006</p>
      </div>

      {/* Top-level averages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <KpiCard
          label="Retención promedio de lead"
          value={loading ? '' : fmtDuration(data?.avg_retention_hours)}
          loading={loading}
        />
        <KpiCard
          label="Tiempo promedio a primer contacto"
          value={loading ? '' : fmtDuration(data?.avg_time_to_first_contact_hours)}
          loading={loading}
        />
      </div>

      {/* Per-salesperson breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Detalle por vendedor</h3>
        </div>

        <Breakdown loading={loading} rows={bySalesperson} />
      </div>
    </section>
  )
}
