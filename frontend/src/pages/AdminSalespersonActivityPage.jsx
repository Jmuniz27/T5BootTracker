import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getSalespersonActivity } from '../api/salespeople.api'
import StatCard from '../components/StatCard'

/**
 * Rendimiento de un vendedor, visto por el administrador.
 *
 * Mide gestión comercial y no plata: el cobro es de Finanzas y se consulta en
 * su propia cartera. Sólo lectura — reasignar leads tiene su propio flujo en el
 * dashboard.
 */

const COLORS = {
  assigned: '#1D3176',
  converted: '#10b981',
  status: '#6366f1',
}

const axisProps = {
  tick: { fontSize: 11, fill: '#94a3b8' },
  stroke: '#e2e8f0',
}

/** "2026-08-01" → "ago 2026", para que el eje no se amontone. */
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function shortMonth(value) {
  if (!value) return ''
  // Se parte la cadena en vez de usar new Date(): esa forma la interpreta en
  // UTC y en husos negativos devuelve el mes anterior.
  const [year, month] = value.split('-')
  return `${MONTHS_SHORT[Number(month) - 1] ?? month} ${year.slice(2)}`
}

function fmtHours(value) {
  // null es ausencia de dato, no cero: un 0 se leería como "al instante".
  return value === null || value === undefined ? '—' : `${value} h`
}

function ChartCard({ title, hint, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-400 mt-0.5 mb-3">{hint}</p>}
      <div className="h-64">{children}</div>
    </div>
  )
}

export default function AdminSalespersonActivityPage() {
  const { salespersonId } = useParams()
  const navigate = useNavigate()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['salesperson-activity', salespersonId],
    queryFn: () => getSalespersonActivity(salespersonId),
    enabled: Boolean(salespersonId),
  })

  if (isError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error?.response?.status === 404
            ? 'Ese usuario no existe o no es un vendedor.'
            : 'No pudimos cargar el rendimiento. Intenta de nuevo.'}
        </div>
      </div>
    )
  }

  const byStatus = (data?.by_status ?? []).map((row) => ({
    label: row.status_label,
    count: row.count,
  }))
  const byMonth = (data?.by_month ?? []).map((row) => ({
    label: shortMonth(row.month),
    assigned: row.assigned,
    converted: row.converted,
  }))

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <button
        onClick={() => navigate('/analytics')}
        className="text-sm text-gray-500 hover:text-[#1D3176] transition-colors mb-4"
      >
        ← Analítica
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{data?.salesperson ?? 'Cargando…'}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rendimiento comercial. El cobro se consulta en la cartera de Finanzas.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatCard label="Leads asignados" value={data?.assigned_leads ?? 0} loading={isLoading} />
        <StatCard label="Convertidos" value={data?.converted_leads ?? 0} loading={isLoading} />
        <StatCard label="Tasa de conversión" value={`${data?.conversion_rate ?? 0}%`} loading={isLoading} />
        <StatCard
          label="Sin contactar"
          value={data?.uncontacted_leads ?? 0}
          loading={isLoading}
          valueClass={(data?.uncontacted_leads ?? 0) > 0 ? 'text-amber-600' : 'text-gray-900'}
        />
        <StatCard label="Interacciones" value={data?.interactions ?? 0} loading={isLoading} />
        <StatCard
          label="Primer contacto"
          value={fmtHours(data?.avg_time_to_first_contact_hours)}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads por estado" hint="Incluye los estados sin leads, en cero.">
          {!isLoading && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="count" name="Leads" fill={COLORS.status} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Evolución mensual" hint="Agrupado por el mes en que tomó el lead.">
          {!isLoading && byMonth.length === 0 && (
            <p className="text-sm text-gray-400">Todavía no hay leads asignados con fecha.</p>
          )}
          {!isLoading && byMonth.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byMonth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="assigned" name="Asignados" stroke={COLORS.assigned} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="converted" name="Convertidos" stroke={COLORS.converted} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Retención promedio de sus leads: {fmtHours(data?.avg_retention_hours)}.
      </p>
    </div>
  )
}
