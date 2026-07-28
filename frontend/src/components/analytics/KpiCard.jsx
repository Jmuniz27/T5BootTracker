/**
 * KPI card with value + period-over-period trend (CB-57).
 * Extends the visual language of the existing StatCard.
 */
export default function KpiCard({ label, value, deltaPct, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex-1 min-w-0 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-9 bg-gray-200 rounded w-20 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-16" />
      </div>
    )
  }

  const hasDelta = deltaPct != null && !Number.isNaN(deltaPct)
  const up = hasDelta && deltaPct >= 0

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex-1 min-w-0">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-4xl font-bold text-gray-900">{value}</p>
      {hasDelta && (
        <p
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
            up ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
            />
          </svg>
          {Math.abs(deltaPct).toFixed(1)}% vs. periodo anterior
        </p>
      )}
    </div>
  )
}
