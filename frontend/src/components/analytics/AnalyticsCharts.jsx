import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useAnalyticsKpis } from '../../hooks/use-analytics-kpis'
import {
  toConversionBySegment,
  toResponseTimeSeries,
  toVelocitySeries,
  toPaymentByProgram,
} from '../../lib/analytics'

const COLORS = {
  conversion: '#2563eb', // azul
  response: '#7c3aed', // violeta
  velocity: '#059669', // esmeralda
  expected: '#94a3b8', // gris
  collected: '#2563eb', // azul
}

const currency = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const shortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })
}

function ChartCard({ title, subtitle, isEmpty, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-gray-400">
          Sin datos para este período
        </div>
      ) : (
        <div className="h-[260px]">{children}</div>
      )}
    </div>
  )
}

const axisProps = {
  stroke: '#94a3b8',
  tick: { fontSize: 11, fill: '#64748b' },
  tickLine: false,
  axisLine: false,
}

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    fontSize: 12,
  },
}

export default function AnalyticsCharts({ filters = {} }) {
  const { data, isLoading, isError, error } = useAnalyticsKpis(filters)

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        Cargando analíticas…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        No pudimos cargar las analíticas
        {error?.response?.status === 403
          ? ' (requiere permisos de administrador).'
          : '. Intenta de nuevo.'}
      </div>
    )
  }

  const conversion = toConversionBySegment(data)
  const responseTime = toResponseTimeSeries(data)
  const velocity = toVelocitySeries(data)
  const payments = toPaymentByProgram(data)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Conversión por segmento */}
      <ChartCard
        title="Tasa de conversión por segmento"
        subtitle="% de leads convertidos según su origen"
        isEmpty={conversion.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={conversion} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="segment" {...axisProps} />
            <YAxis unit="%" {...axisProps} />
            <Tooltip
              {...tooltipStyle}
              formatter={(value) => [`${value}%`, 'Conversión']}
            />
            <Bar dataKey="rate" name="Conversión" fill={COLORS.conversion} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Tiempo de respuesta */}
      <ChartCard
        title="Tiempo de respuesta promedio"
        subtitle="Horas hasta la primera interacción (por semana)"
        isEmpty={responseTime.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={responseTime} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="period" tickFormatter={shortDate} {...axisProps} />
            <YAxis unit="h" {...axisProps} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={shortDate}
              formatter={(value) => [`${value} h`, 'Promedio']}
            />
            <Line
              type="monotone"
              dataKey="avgHours"
              name="Horas promedio"
              stroke={COLORS.response}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Velocidad de leads */}
      <ChartCard
        title="Velocidad de leads"
        subtitle="Leads nuevos por período"
        isEmpty={velocity.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={velocity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="velocityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.velocity} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.velocity} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="period" tickFormatter={shortDate} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={shortDate}
              formatter={(value) => [value, 'Leads']}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Leads nuevos"
              stroke={COLORS.velocity}
              strokeWidth={2}
              fill="url(#velocityFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Cobro por programa */}
      <ChartCard
        title="Cobro por programa"
        subtitle="Esperado vs. cobrado"
        isEmpty={payments.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={payments} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="program" {...axisProps} />
            <YAxis tickFormatter={(v) => currency.format(v)} width={72} {...axisProps} />
            <Tooltip {...tooltipStyle} formatter={(value) => currency.format(value)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="expected" name="Esperado" fill={COLORS.expected} radius={[4, 4, 0, 0]} />
            <Bar dataKey="collected" name="Cobrado" fill={COLORS.collected} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
