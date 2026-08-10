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
    // El icono va posicionado absoluto (no en un div que envuelva al label): así
    // el label sigue siendo hijo directo de la tarjeta, que es lo que buscan los
    // tests al hacer getByText(label).closest('div').
    <div className={`relative rounded-2xl border p-5 flex-1 min-w-0 transition-shadow duration-200 hover:shadow-md ${containerClass}`}>
      {icon && (
        <span className={`absolute top-4 right-4 w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}>
          {icon}
        </span>
      )}
      <p className={`text-sm font-medium mb-2 ${icon ? 'pr-11' : ''} ${labelClass}`}>{label}</p>
      <p className={`text-3xl sm:text-4xl font-bold leading-none ${valueClass}`}>{value}</p>
    </div>
  )
}
