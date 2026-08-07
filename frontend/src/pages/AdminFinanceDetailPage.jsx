import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFinanceBootcampers } from '../api/finance.api'
import { releaseBootcamper } from '../api/payments.api'
import StatCard from '../components/StatCard'
import CustomSelect from '../components/CustomSelect'
import Toast from '../components/Toast'

/**
 * Los bootcampers de una persona de Finanzas, vistos por el administrador.
 *
 * No se aprueba ni rechaza pagos acá, ni se edita al bootcamper: eso es de quien
 * cobra. Lo único que el administrador sí hace es repartir la cartera, así que
 * puede desasignar — el complemento de asignar desde el pool.
 */

function fmtMoney(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function BootcamperCard({ bc, financeName, isConfirming, isPending, onAskRelease, onCancelRelease, onRelease }) {
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
          {/* El cobro se sigue por edición, no sólo por programa. */}
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {bc.program_name}
            {bc.cohort_number != null && (
              <span className="text-gray-400"> · Cohorte {bc.cohort_number}</span>
            )}
          </p>
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

      {/* Confirmación en dos pasos: devolver al pool le saca la cartera a alguien
          que ya venía cobrando, y un clic accidental no debería alcanzar. */}
      {isConfirming ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            Vuelve al pool y deja de estar a cargo de {financeName ?? 'esta persona'}.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onRelease(bc)}
              disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-[#213A8E] text-white text-xs font-semibold hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
            >
              {isPending ? 'Desasignando…' : 'Sí, desasignar'}
            </button>
            <button
              onClick={onCancelRelease}
              disabled={isPending}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-white transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onAskRelease(bc)}
          className="mt-4 w-full py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors"
        >
          Desasignar
        </button>
      )}
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

export default function AdminFinanceDetailPage() {
  const { financeId } = useParams()
  const navigate = useNavigate()
  // Slicer por estado de COHORTE, con el estilo de píldoras del resto de la app.
  const [tab, setTab] = useState('en_curso')
  const [programId, setProgramId] = useState('')
  // Bootcamper con la confirmación de desasignar abierta.
  const [confirmingId, setConfirmingId] = useState(null)
  const [toast, setToast] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finance-bootcampers', financeId],
    queryFn: () => getFinanceBootcampers(financeId),
    enabled: Boolean(financeId),
  })

  const releaseMutation = useMutation({
    mutationFn: (bootcamperId) => releaseBootcamper(bootcamperId),
    onSuccess: (_data, bootcamperId) => {
      setConfirmingId(null)
      // La cartera de esta persona y el pool cambian a la vez: el bootcamper
      // sale de una y entra al otro.
      queryClient.invalidateQueries({ queryKey: ['finance-bootcampers', financeId] })
      queryClient.invalidateQueries({ queryKey: ['bootcamper-pool'] })
      // El resumen por persona de Finanzas también cambia de conteo.
      queryClient.invalidateQueries({ queryKey: ['finance-portfolio'] })
      const nombre = (data?.bootcampers ?? []).find((bc) => bc.bootcamper_id === bootcamperId)?.bootcamper_name
      setToast({
        type: 'success',
        message: nombre
          ? `${nombre} volvió al pool sin responsable.`
          : 'Bootcamper devuelto al pool.',
      })
    },
    onError: (err) => {
      setToast({
        type: 'error',
        message: err?.response?.data?.error ?? 'No pudimos desasignar al bootcamper.',
      })
    },
  })

  const bootcampers = data?.bootcampers ?? []
  // El filtro por programa aplica antes de dividir, para que los conteos del
  // slicer sean los del programa elegido y no del total.
  const programas = [...new Map(
    bootcampers.map((bc) => [bc.program_id, bc.program_name]),
  ).entries()]
  const filtrados = programId
    ? bootcampers.filter((bc) => bc.program_id === programId)
    : bootcampers

  // Sin cohorte se cuenta como en curso: se le sigue cobrando igual, y dejarlo
  // fuera de las dos listas lo haría invisible.
  const enCurso     = filtrados.filter((bc) => bc.cohort_status !== 'FINISHED')
  const finalizadas = filtrados.filter((bc) => bc.cohort_status === 'FINISHED')
  const visibles    = tab === 'finalizadas' ? finalizadas : enCurso

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
            ? 'Ese usuario no existe o no es de Finanzas.'
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
        ← Finanzas
      </button>

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">
          {data?.finance_name ?? 'Cargando…'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Bootcampers que monitorea. Puedes desasignar para devolverlos al pool.
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

      {!isLoading && bootcampers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Mismo slicer de píldoras que "Administrativos / Bootcampers". */}
          <div role="tablist" aria-label="Estado de la cohorte" className="inline-flex bg-gray-100 rounded-xl p-1">
            {[
              { id: 'en_curso', label: `En curso (${enCurso.length})` },
              { id: 'finalizadas', label: `Finalizadas (${finalizadas.length})` },
            ].map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === id
                    ? 'bg-[#213A8E] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {programas.length > 1 && (
            <div className="min-w-[220px]">
              <CustomSelect
                value={programId}
                onChange={setProgramId}
                options={[
                  { value: '', label: 'Todos los programas' },
                  ...programas.map(([id, name]) => ({ value: id, label: name })),
                ]}
                placeholder="Todos los programas"
                ariaLabel="Filtrar por programa"
              />
            </div>
          )}
        </div>
      )}

      {!isLoading && bootcampers.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">
            Todavía no tomó ningún bootcamper del pool.
          </p>
        </div>
      )}

      {!isLoading && bootcampers.length > 0 && visibles.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">
            {tab === 'finalizadas'
              ? 'No tiene bootcampers en cohortes finalizadas.'
              : 'Toda su cartera está en cohortes finalizadas.'}
          </p>
        </div>
      )}

      {!isLoading && visibles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map((bc) => (
            <BootcamperCard
              key={`${bc.bootcamper_id}-${bc.program_id}`}
              bc={bc}
              financeName={data?.finance_name}
              isConfirming={confirmingId === bc.bootcamper_id}
              isPending={
                releaseMutation.isPending && releaseMutation.variables === bc.bootcamper_id
              }
              onAskRelease={(target) => setConfirmingId(target.bootcamper_id)}
              onCancelRelease={() => setConfirmingId(null)}
              onRelease={(target) => releaseMutation.mutate(target.bootcamper_id)}
            />
          ))}
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
