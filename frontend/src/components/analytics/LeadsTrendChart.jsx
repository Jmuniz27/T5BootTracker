import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from './ChartCard'

const fmtDay = (d) => (d ? d.slice(5) : '')

export default function LeadsTrendChart({ data = [], loading }) {
  return (
    <ChartCard
      title="Leads en el tiempo"
      subtitle="Nuevos leads vs. convertidos"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#213A8E" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#213A8E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
          <Tooltip labelFormatter={fmtDay} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="new_leads" name="Nuevos" stroke="#213A8E" fill="url(#gNew)" strokeWidth={2} />
          <Area type="monotone" dataKey="converted" name="Convertidos" stroke="#10b981" fill="url(#gConv)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
