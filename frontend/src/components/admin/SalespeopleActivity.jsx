import { useQuery } from '@tanstack/react-query'
import { getSalespeopleActivity } from '../../api/salespeople.api'

/**
 * Pestaña de vendedores: qué está haciendo cada uno con sus leads.
 *
 * Mide volumen y resultado, no plata. El cobro es de Finanzas y ya se ve
 * agrupado por responsable en la otra pestaña; repetirlo acá, agrupado por
 * quién trajo al bootcamper, serían los mismos montos contados de otra forma.
 *
 * Sin navegación a detalle: no hay una pantalla de vendedor que abrir, y los
 * leads de cada uno se filtran desde el dashboard.
 */

function SalespersonCard({ person }) {
  const assigned    = person.assigned_leads ?? 0
  const converted   = person.converted_leads ?? 0
  const uncontacted = person.uncontacted_leads ?? 0
  const rate        = person.conversion_rate ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="mb-3 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{person.salesperson}</p>
        <p className="text-xs text-gray-400 truncate">{person.email}</p>
      </div>

      <p className="text-2xl font-bold text-gray-900 leading-tight">
        {assigned}
        <span className="text-sm font-medium text-gray-400 ml-1.5">
          lead{assigned === 1 ? '' : 's'} asignado{assigned === 1 ? '' : 's'}
        </span>
      </p>

      {assigned > 0 && (
        <div className="mt-3">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Convertidos</span>
            <span className="text-xs font-semibold text-gray-700">{rate}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {converted} de {assigned}
          </p>
        </div>
      )}

      {uncontacted > 0 && (
        <p className="mt-3 inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
          {uncontacted} sin contactar
        </p>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
      <div className="h-3.5 bg-gray-200 rounded w-32 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-40 mb-4" />
      <div className="h-7 bg-gray-200 rounded w-28 mb-3" />
      <div className="h-1.5 bg-gray-100 rounded-full" />
    </div>
  )
}

export default function SalespeopleActivity() {
  const { data: salespeople = [], isLoading, isError } = useQuery({
    queryKey: ['salespeople-activity'],
    queryFn: getSalespeopleActivity,
  })

  return (
    <>
      {isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          No pudimos cargar los vendedores. Intenta de nuevo.
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isLoading && !isError && salespeople.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">No hay vendedores activos.</p>
        </div>
      )}

      {!isLoading && salespeople.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {salespeople.map((person) => (
            <SalespersonCard key={person.salesperson_id} person={person} />
          ))}
        </div>
      )}
    </>
  )
}
