import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSalespeoplePortfolio } from '../api/salespeople.api'

/**
 * Lo que ve el administrador al entrar a pagos: una tarjeta por vendedor.
 *
 * El administrador no tiene bootcampers propios, así que la pantalla del
 * vendedor no le aplica — mira las carteras ajenas, y sólo mira.
 */

function fmtMoney(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function SalespersonCard({ person, onClick }) {
  const count = person.bootcamper_count ?? 0
  const critical = person.critical_count ?? 0
  const expected = parseFloat(person.expected_amount) || 0
  const paid = parseFloat(person.total_paid) || 0
  const paidPct = expected > 0 ? Math.min((paid / expected) * 100, 100) : 0

  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md hover:border-[#1D3176]/30 transition-all w-full group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-[#1D3176] transition-colors truncate">
            {person.salesperson}
          </p>
          <p className="text-xs text-gray-400 truncate">{person.email}</p>
        </div>
        {critical > 0 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600 flex-shrink-0">
            {critical} crítico{critical === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-gray-900 leading-tight">
        {count}
        <span className="text-sm font-medium text-gray-400 ml-1.5">
          bootcamper{count === 1 ? '' : 's'}
        </span>
      </p>

      {count > 0 && (
        <div className="mt-3">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Cobrado</span>
            <span className="text-xs font-semibold text-gray-700">{paidPct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1D3176] transition-all"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {fmtMoney(person.total_paid)} de {fmtMoney(person.expected_amount)}
          </p>
        </div>
      )}
    </button>
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

export default function AdminSalespeoplePage() {
  const navigate = useNavigate()
  const { data: salespeople = [], isLoading, isError } = useQuery({
    queryKey: ['salespeople-portfolio'],
    queryFn: getSalespeoplePortfolio,
  })

  return (
    <div className="p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Vendedores</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Abre un vendedor para ver los bootcampers que tiene asignados. Sólo consulta.
        </p>
      </header>

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
            <SalespersonCard
              key={person.salesperson_id}
              person={person}
              onClick={() => navigate(`/payments/vendedor/${person.salesperson_id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
