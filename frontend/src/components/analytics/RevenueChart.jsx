import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from './ChartCard'

const fmtDay = (d) => (d ? d.slice(5) : '')
const fmtMoney = (v) => `$${Number(v).toLocaleString('en-US')}`

export default function RevenueChart({ data = [], loading }) {
  return (
    <ChartCard
      title="Ingresos en el tiempo"
      subtitle="Recaudado vs. esperado"
      loading={loading}
      empty={!loading && data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: '#94a3b8' }} width={64} />
          <Tooltip labelFormatter={fmtDay} formatter={(v) => fmtMoney(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="expected" name="Esperado" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
          <Bar dataKey="collected" name="Recaudado" fill="#213A8E" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
