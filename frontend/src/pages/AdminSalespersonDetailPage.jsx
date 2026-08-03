import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSalespersonBootcampers } from '../api/salespeople.api'
import StatCard from '../components/StatCard'

/**
 * Los bootcampers de un vendedor, vistos por el administrador.
 *
 * Pantalla de sólo lectura por diseño: no hay aprobar, rechazar, reasignar ni
 * editar, y las tarjetas no navegan a ninguna pantalla que permita actuar. El
 * administrador consulta la cartera ajena, no la gestiona.
 */

function fmtMoney(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function BootcamperCard({ bc }) {
  const expected = parseFloat(bc.expected_amount) || 0
  const paid = parseFloat(bc.total_paid) || 0
  const paidPct = expected > 0 ? Math.min((paid / expected) * 100, 100) : 0
  const isCritical = (bc.critical_count ?? 0) > 0

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{bc.bootcamper_name}</p>
          <p className="text-xs text-gray-400 truncate">{bc.email}</p>
        </div>
        {isCritical && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600 flex-shrink-0">
            Crítico
          </span>
        )}
      </div>

      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400">Pagado</span>
          <span className="text-xs font-semibold text-gray-700">{paidPct.toFixed(0)}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isCritical ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${paidPct}%` }}
          />
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-lg font-bold text-gray-900 leading-tight">{fmtMoney(bc.total_paid)}</p>
          <p className="text-xs text-gray-400">de {fmtMoney(bc.expected_amount)}</p>
        </div>
        {bc.pending_payments > 0 && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            {bc.pending_payments} pendiente{bc.pending_payments === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
      <div className="h-3.5 bg-gray-200 rounded w-32 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-40 mb-4" />
      <div className="h-1.5 bg-gray-100 rounded-full mb-3" />
      <div className="h-5 bg-gray-200 rounded w-24" />
    </div>
  )
}

export default function AdminSalespersonDetailPage() {
  const { salespersonId } = useParams()
  const navigate = useNavigate()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['salesperson-bootcampers', salespersonId],
    queryFn: () => getSalespersonBootcampers(salespersonId),
    enabled: Boolean(salespersonId),
  })

  const bootcampers = data?.bootcampers ?? []
  const totals = bootcampers.reduce(
    (acc, bc) => ({
      paid: acc.paid + (parseFloat(bc.total_paid) || 0),
      expected: acc.expected + (parseFloat(bc.expected_amount) || 0),
      critical: acc.critical + (bc.critical_count ?? 0),
      pending: acc.pending + (bc.pending_payments ?? 0),
    }),
    { paid: 0, expected: 0, critical: 0, pending: 0 },
  )

  if (isError) {
    return (
      <div className="p-6 sm:p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error?.response?.status === 404
            ? 'Ese usuario no existe o no es un vendedor.'
            : 'No pudimos cargar la cartera. Intenta de nuevo.'}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8">
      <button
        onClick={() => navigate('/payments')}
        className="text-sm text-gray-500 hover:text-[#1D3176] transition-colors mb-4"
      >
        ← Vendedores
      </button>

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">
          {data?.salesperson ?? 'Cargando…'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Bootcampers asignados. Esta vista es sólo de consulta.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Bootcampers" value={bootcampers.length} loading={isLoading} />
        <StatCard label="Cobrado" value={fmtMoney(totals.paid)} loading={isLoading} />
        <StatCard label="Esperado" value={fmtMoney(totals.expected)} loading={isLoading} />
        <StatCard
          label="En crítico"
          value={totals.critical}
          loading={isLoading}
          valueClass={totals.critical > 0 ? 'text-red-600' : 'text-gray-900'}
        />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isLoading && bootcampers.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">
            Este vendedor todavía no tiene bootcampers asignados.
          </p>
        </div>
      )}

      {!isLoading && bootcampers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bootcampers.map((bc) => (
            <BootcamperCard key={bc.bootcamper_id} bc={bc} />
          ))}
        </div>
      )}
    </div>
  )
}
