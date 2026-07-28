import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
} from 'recharts'
import ChartCard from './ChartCard'

const BAR_COLORS = ['#213A8E', '#3b56b0', '#f59e0b', '#10b981']

export default function ConversionFunnel({ data = [], loading }) {
  const top = data.length ? data[0].count || 1 : 1
  const rows = data.map((d) => ({ ...d, pct: Math.round((d.count / top) * 100) }))

  return (
    <ChartCard
      title="Embudo de conversión"
      subtitle="De lead a bootcamper"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
          <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fill: '#475569' }} width={80} />
          <Tooltip formatter={(v, _n, p) => [`${v} (${p.payload.pct}%)`, 'Cantidad']} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {rows.map((r, i) => (
              <Cell key={r.stage} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#475569' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
