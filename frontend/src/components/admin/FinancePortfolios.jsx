import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getFinancePortfolio } from '../../api/finance.api'

/**
 * Pestaña de Finanzas: una tarjeta por persona, más el recuento de los
 * bootcampers que siguen en el pool.
 *
 * El administrador no tiene bootcampers propios, así que la pantalla de
 * Finanzas no le aplica — mira las carteras ajenas, y sólo mira.
 */

function fmtMoney(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function FinanceCard({ person, onClick }) {
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
            {person.finance_name}
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

export default function FinancePortfolios() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-portfolio'],
    queryFn: getFinancePortfolio,
  })

  const portfolios = data?.portfolios ?? []
  const unassigned = data?.unassigned_bootcampers ?? 0

  return (
    <>
      {isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          No pudimos cargar las carteras. Intenta de nuevo.
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Lo que nadie está cobrando es justo lo que el administrador necesita ver. */}
      {!isLoading && !isError && unassigned > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4 flex items-center gap-3">
          <span className="text-2xl font-bold text-amber-700">{unassigned}</span>
          <p className="text-sm text-amber-800">
            bootcamper{unassigned === 1 ? '' : 's'} sin responsable de cobro, esperando en el pool.
          </p>
        </div>
      )}

      {!isLoading && !isError && portfolios.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">No hay personas de Finanzas activas.</p>
        </div>
      )}

      {!isLoading && portfolios.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios.map((person) => (
            <FinanceCard
              key={person.finance_id}
              person={person}
              onClick={() => navigate(`/payments/finanzas/${person.finance_id}`)}
            />
          ))}
        </div>
      )}
    </>
  )
}
