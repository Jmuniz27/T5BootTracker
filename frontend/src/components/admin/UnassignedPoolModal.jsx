import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assignBootcamper, getBootcamperPool } from '../../api/payments.api'
import CustomSelect from '../CustomSelect'
import Skeleton from '../ui/Skeleton'

/**
 * Reparto del pool por el administrador.
 *
 * El aviso de "N bootcampers sin responsable" era informativo y no llevaba a
 * ninguna parte: el administrador veía el problema y no podía resolverlo, porque
 * asignar era exclusivo de Finanzas.
 *
 * Finanzas se asigna a sí misma desde su propia pantalla; acá el administrador
 * reparte, así que hay que elegir a quién en cada caso.
 */

function fmtMoney(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PoolRow({ item, financePeople, onAssign, isAssigning }) {
  const [ownerId, setOwnerId] = useState('')

  return (
    <li className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-gray-900 truncate">{item.bootcamper_name}</p>
        <p className="text-xs text-gray-400 truncate">{item.email}</p>
        <p className="text-xs text-gray-500 mt-1">
          {item.program_name} · {fmtMoney(item.total_paid)} de {fmtMoney(item.total_cost)}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex-1">
          <CustomSelect
            value={ownerId}
            onChange={setOwnerId}
            options={financePeople.map((p) => ({
              value: p.finance_id,
              label: p.finance_name,
            }))}
            placeholder="Asignar a…"
            ariaLabel={`Responsable de cobro de ${item.bootcamper_name}`}
          />
        </div>
        <button
          onClick={() => onAssign(item, ownerId)}
          disabled={!ownerId || isAssigning}
          className="px-4 py-2.5 bg-[#1D3176] text-white text-sm font-medium rounded-xl hover:bg-[#182861] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Asignar
        </button>
      </div>
    </li>
  )
}

export default function UnassignedPoolModal({ financePeople = [], onClose, onDone, onError }) {
  const queryClient = useQueryClient()

  // El endpoint devuelve { my_bootcampers, available_bootcampers, pagination }.
  // El administrador no tiene cartera propia, así que sólo interesa el pool.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bootcamper-pool', 'available'],
    queryFn: () => getBootcamperPool(),
  })
  const pool = data?.available_bootcampers ?? []

  const mutation = useMutation({
    mutationFn: ({ item, ownerId }) => assignBootcamper(item.bootcamper_id, ownerId),
    onSuccess: (_data, { item }) => {
      // Cambian las dos cosas: la cartera de quien recibe y el recuento del pool.
      queryClient.invalidateQueries({ queryKey: ['bootcamper-pool'] })
      queryClient.invalidateQueries({ queryKey: ['finance-portfolio'] })
      onDone(`${item.bootcamper_name} asignado correctamente.`)
    },
    onError: (error) => {
      const data = error?.response?.data
      onError(data?.error ?? 'No pudimos asignar. Intenta de nuevo.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-[560px] max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Bootcampers sin responsable de cobro"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Bootcampers sin responsable</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Elige a quién de Finanzas le corresponde el cobro de cada uno.
        </p>

        {isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No pudimos cargar el pool. Intenta de nuevo.
          </div>
        )}

        {isLoading && (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" rounded="rounded-xl" />)}
          </div>
        )}

        {!isLoading && !isError && pool.length === 0 && (
          <div className="rounded-xl border border-gray-200 py-10 text-center">
            <p className="text-sm text-gray-500">
              No queda nadie esperando: todos tienen responsable de cobro.
            </p>
          </div>
        )}

        {!isLoading && financePeople.length === 0 && pool.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No hay personas de Finanzas activas a quienes asignar. Crea una en Usuarios.
          </div>
        )}

        {!isLoading && pool.length > 0 && financePeople.length > 0 && (
          <ul className="space-y-3">
            {pool.map((item) => (
              <PoolRow
                key={`${item.bootcamper_id}-${item.program_id}`}
                item={item}
                financePeople={financePeople}
                isAssigning={mutation.isPending}
                onAssign={(target, ownerId) => mutation.mutate({ item: target, ownerId })}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
