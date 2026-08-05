import { useSalespersonLeads } from '../../hooks/use-salesperson-leads'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  OUTCOME_LABELS,
  labelFor,
} from '../../lib/lead-labels'

const COLUMN_COUNT = 9

/** "—" para dato ausente; 0 es un valor real y se muestra como 0. */
const fmtHours = (value) => (value === null || value === undefined ? '—' : `${value} h`)

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StateRow({ children }) {
  return (
    <tr>
      <td colSpan={COLUMN_COUNT} className="px-5 py-8 text-center text-gray-500">
        {children}
      </td>
    </tr>
  )
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {labelFor(STATUS_LABELS, status)}
    </span>
  )
}

/**
 * Detalle lead por lead del vendedor seleccionado, sobre
 * GET /api/analytics/lead-management/leads/.
 *
 * Es el drill-down de la tabla resumen: allí se ve el promedio del vendedor,
 * aquí en qué lead concreto se fue ese tiempo. Retención y primer contacto
 * salen del backend con la misma regla que el agregado, así que las cifras
 * cuadran con las tarjetas de arriba.
 */
export default function SalespersonLeadsTable({ salespersonId, salespersonName, filters = {} }) {
  const { data, isLoading, isError, error } = useSalespersonLeads(salespersonId, filters)

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        No pudimos cargar los leads de este vendedor
        {error?.response?.status === 403
          ? ' (requiere permisos de administrador).'
          : '. Intenta de nuevo.'}
      </div>
    )
  }

  const leads = data?.leads ?? []

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 text-sm text-gray-500">
        {isLoading
          ? 'Cargando leads…'
          : `${data?.leads_count ?? 0} leads asignados a ${salespersonName}`}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th scope="col" className="text-left font-medium px-5 py-3">Lead</th>
              <th scope="col" className="text-left font-medium px-5 py-3">Fuente</th>
              <th scope="col" className="text-left font-medium px-5 py-3">Estado</th>
              <th scope="col" className="text-left font-medium px-5 py-3">Programa</th>
              <th scope="col" className="text-right font-medium px-5 py-3">Ingreso</th>
              <th scope="col" className="text-right font-medium px-5 py-3">Asignado</th>
              <th scope="col" className="text-right font-medium px-5 py-3">Retención</th>
              <th scope="col" className="text-right font-medium px-5 py-3">Primer contacto</th>
              <th scope="col" className="text-right font-medium px-5 py-3">Interacciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <StateRow>Cargando leads…</StateRow>}
            {!isLoading && leads.length === 0 && (
              <StateRow>Este vendedor no tiene leads asignados en el período</StateRow>
            )}
            {!isLoading &&
              leads.map((lead) => (
                <tr key={lead.lead_id} className={lead.is_released ? 'bg-gray-50/60' : undefined}>
                  <td className="px-5 py-3 text-gray-900">
                    {lead.name}
                    {lead.is_released && (
                      <span className="ml-2 text-xs text-gray-400">liberado</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {labelFor(SOURCE_LABELS, lead.source) ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-700">{lead.program_interest || '—'}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{fmtDate(lead.created_at)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{fmtDate(lead.assigned_at)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {fmtHours(lead.retention_hours)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {fmtHours(lead.hours_to_first_contact)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {lead.interaction_count}
                    {lead.last_outcome && (
                      <span className="block text-xs text-gray-400">
                        {labelFor(OUTCOME_LABELS, lead.last_outcome)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
