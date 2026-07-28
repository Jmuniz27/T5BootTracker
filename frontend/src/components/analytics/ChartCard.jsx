/** Shared container for dashboard charts (CB-57). */
export default function ChartCard({ title, subtitle, loading, empty, children }) {
  let body
  if (loading) {
    body = <div className="h-64 animate-pulse bg-gray-100 rounded-xl" />
  } else if (empty) {
    body = (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400">
        Sin datos en este rango.
      </div>
    )
  } else {
    body = <div className="h-64">{children}</div>
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {body}
    </div>
  )
}
