import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
} from 'recharts'
import ChartCard from './ChartCard'

const STATUS_LABELS = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  INTERESTED: 'Interesado',
  NOT_INTERESTED: 'No interesado',
  CONVERTED: 'Convertido',
}

const COLORS = {
  NEW: '#94a3b8',
  CONTACTED: '#213A8E',
  INTERESTED: '#f59e0b',
  NOT_INTERESTED: '#ef4444',
  CONVERTED: '#10b981',
}

export default function StatusBreakdown({ data = [], loading }) {
  const rows = data
    .map((d) => ({
      ...d,
      label: STATUS_LABELS[d.status] ?? d.status,
      color: COLORS[d.status] ?? '#cbd5e1',
    }))
    .sort((a, b) => b.count - a.count)

  return (
    <ChartCard
      title="Leads por estado"
      subtitle="Distribución del embudo actual"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12, fill: '#475569' }}
            width={96}
          />
          <Tooltip formatter={(v) => [v, 'Leads']} cursor={{ fill: '#f8fafc' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}>
            {rows.map((r) => (
              <Cell key={r.status} fill={r.color} />
            ))}
            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#475569' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
