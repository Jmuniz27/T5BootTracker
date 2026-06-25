export default function StatCard({
  label,
  value,
  loading,
  containerClass = 'bg-white border-gray-200',
  valueClass = 'text-gray-900',
  labelClass = 'text-gray-500',
}) {
  if (loading) {
    return (
      <div className={`rounded-2xl border p-5 flex-1 min-w-0 animate-pulse ${containerClass}`}>
        <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-9 bg-gray-200 rounded w-16" />
      </div>
    )
  }
  return (
    <div className={`rounded-2xl border p-5 flex-1 min-w-0 ${containerClass}`}>
      <p className={`text-sm mb-1 ${labelClass}`}>{label}</p>
      <p className={`text-4xl font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}
