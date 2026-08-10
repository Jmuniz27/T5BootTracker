import Skeleton from './ui/Skeleton'

export default function StatCard({
  label,
  value,
  loading,
  icon,
  iconClass = 'bg-gray-100 text-gray-500',
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
      <div className="flex items-center justify-between mb-2">
        <p className={`text-sm font-medium ${labelClass}`}>{label}</p>
        {icon && (
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`text-3xl sm:text-4xl font-bold leading-none ${valueClass}`}>{value}</p>
    </div>
  )
}
