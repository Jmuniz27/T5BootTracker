import Skeleton from './ui/Skeleton'

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
      <div
        aria-busy="true"
        aria-label={`Cargando ${label}`}
        className={`rounded-2xl border p-5 flex-1 min-w-0 ${containerClass}`}
      >
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-9 w-16" />
      </div>
    )
  }
  return (
    <div className={`rounded-2xl border p-5 flex-1 min-w-0 transition-shadow duration-200 hover:shadow-md ${containerClass}`}>
      <p className={`text-sm mb-1 ${labelClass}`}>{label}</p>
      <p className={`text-4xl font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}
