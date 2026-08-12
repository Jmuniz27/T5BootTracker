import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assignBootcamper, bulkAssignBootcampers, getBootcamperPool } from '../../api/payments.api'
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

function PoolRow({ item, financePeople, onAssign, isAssigning, isSelected, onToggleSelect }) {
  const { t } = useTranslation()
  const [ownerId, setOwnerId] = useState('')

  return (
    <li className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="mb-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item)}
          aria-label={t('portfolios.pool.selectAria', { name: item.bootcamper_name })}
          className="mt-0.5 rounded border-gray-300 text-[#1D3176] focus:ring-[#1D3176]"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{item.bootcamper_name}</p>
          <p className="text-xs text-gray-400 truncate">{item.email}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t('portfolios.pool.rowInfo', { program: item.program_name, paid: fmtMoney(item.total_paid), cost: fmtMoney(item.total_cost) })}
          </p>
        </div>
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
            placeholder={t('portfolios.pool.assignTo')}
            ariaLabel={t('portfolios.pool.ownerAria', { name: item.bootcamper_name })}
          />
        </div>
        <button
          onClick={() => onAssign(item, ownerId)}
          disabled={!ownerId || isAssigning}
          className="px-4 py-2.5 bg-[#1D3176] text-white text-sm font-medium rounded-xl hover:bg-[#182861] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t('portfolios.pool.assign')}
        </button>
      </div>
    </li>
  )
}

export default function UnassignedPoolModal({ financePeople = [], onClose, onDone, onError }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // El endpoint devuelve { my_bootcampers, available_bootcampers, pagination }.
  // El administrador no tiene cartera propia, así que sólo interesa el pool.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['bootcamper-pool', 'available'],
    queryFn: () => getBootcamperPool(),
  })
  const pool = data?.available_bootcampers ?? []

  // La selección va por bootcamper y no por fila: hay una fila por programa,
  // pero el responsable de cobro es de la persona, no de su inscripción.
  const [selected, setSelected] = useState(() => new Set())
  const [bulkOwnerId, setBulkOwnerId] = useState('')

  const toggleSelect = (item) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(item.bootcamper_id)) next.delete(item.bootcamper_id)
      else next.add(item.bootcamper_id)
      return next
    })
  }

  const mutation = useMutation({
    mutationFn: ({ item, ownerId }) => assignBootcamper(item.bootcamper_id, ownerId),
    onSuccess: (_data, { item }) => {
      // Cambian las dos cosas: la cartera de quien recibe y el recuento del pool.
      queryClient.invalidateQueries({ queryKey: ['bootcamper-pool'] })
      queryClient.invalidateQueries({ queryKey: ['finance-portfolio'] })
      onDone(t('portfolios.pool.assignSuccess', { name: item.bootcamper_name }))
    },
    onError: (error) => {
      const data = error?.response?.data
      onError(data?.error ?? t('portfolios.pool.assignError'))
    },
  })

  const bulkMutation = useMutation({
    mutationFn: ({ ids, ownerId }) => bulkAssignBootcampers(ids, ownerId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bootcamper-pool'] })
      queryClient.invalidateQueries({ queryKey: ['finance-portfolio'] })
      setSelected(new Set())
      setBulkOwnerId('')

      const asignados = result?.assigned?.length ?? 0
      const fallidos = result?.failed?.length ?? 0
      // Se reporta lo que de verdad pasó: dar por asignada una tanda que falló
      // a medias deja bootcampers sin responsable creyendo que están cubiertos.
      if (fallidos > 0) {
        onError(t('portfolios.pool.bulkPartial', {
          assigned: t('portfolios.pool.bulkAssignedCount', { count: asignados }),
          failed: t('portfolios.pool.bulkFailedCount', { count: fallidos }),
          error: result.failed[0].error,
        }))
      } else {
        onDone(t('portfolios.pool.bulkSuccess', { count: asignados }))
      }
    },
    onError: (error) => {
      onError(error?.response?.data?.error ?? t('portfolios.pool.bulkError'))
    },
  })

  // Un bootcamper con dos programas aparece en dos filas: para el conteo y
  // para la casilla de selección completa cuenta una sola vez.
  const idsEnPool = [...new Set(pool.map((item) => item.bootcamper_id))]
  const todosSeleccionados = idsEnPool.length > 0 && idsEnPool.every((id) => selected.has(id))

  const toggleTodos = () => {
    setSelected(todosSeleccionados ? new Set() : new Set(idsEnPool))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      {/* El redondeo y el scroll estaban en el mismo elemento: la barra se metía
          dentro de la caja y cuadraba el borde, y el contenido llegaba al ras.
          Ahora el marco recorta con overflow-hidden y sólo el cuerpo desplaza. */}
      <div
        className="bg-white rounded-2xl w-full max-w-[560px] max-h-[85vh] shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('portfolios.pool.dialogAria')}
      >
        {/* Encabezado fijo: cuando también entraba en el área desplazable, el
            título se iba al bajar y se perdía de qué era la lista. */}
        <div className="shrink-0 px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-lg font-semibold text-gray-900">{t('portfolios.pool.title')}</h2>
            <button onClick={onClose} aria-label={t('portfolios.pool.close')} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {t('portfolios.pool.subtitle')}
          </p>

          {pool.length > 0 && financePeople.length > 0 && (
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={todosSeleccionados}
                onChange={toggleTodos}
                className="rounded border-gray-300 text-[#1D3176] focus:ring-[#1D3176]"
              />
              {t('portfolios.pool.selectAll', { count: idsEnPool.length })}
            </label>
          )}
        </div>

        {/* pb generoso: sin él la última tarjeta queda cortada contra el borde. */}
        <div className="overflow-y-auto px-5 sm:px-6 pt-5 pb-6 sm:pb-8">

        {isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {t('portfolios.pool.loadError')}
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
              {t('portfolios.pool.emptyDone')}
            </p>
          </div>
        )}

        {!isLoading && financePeople.length === 0 && pool.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {t('portfolios.pool.noFinance')}
          </div>
        )}

        {!isLoading && pool.length > 0 && financePeople.length > 0 && (
          <ul className="space-y-3">
            {pool.map((item) => (
              <PoolRow
                key={`${item.bootcamper_id}-${item.program_id}`}
                item={item}
                financePeople={financePeople}
                isAssigning={mutation.isPending || bulkMutation.isPending}
                isSelected={selected.has(item.bootcamper_id)}
                onToggleSelect={toggleSelect}
                onAssign={(target, ownerId) => mutation.mutate({ item: target, ownerId })}
              />
            ))}
          </ul>
        )}
        </div>

        {selected.size > 0 && (
          <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-5 sm:px-6 py-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {t('portfolios.pool.selectedCount', { count: selected.size })}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex-1">
                <CustomSelect
                  value={bulkOwnerId}
                  onChange={setBulkOwnerId}
                  options={financePeople.map((p) => ({ value: p.finance_id, label: p.finance_name }))}
                  placeholder={t('portfolios.pool.assignAllTo')}
                  ariaLabel={t('portfolios.pool.selectionOwnerAria')}
                />
              </div>
              <button
                onClick={() => bulkMutation.mutate({ ids: [...selected], ownerId: bulkOwnerId })}
                disabled={!bulkOwnerId || bulkMutation.isPending}
                className="px-4 py-2.5 bg-[#1D3176] text-white text-sm font-medium rounded-xl hover:bg-[#182861] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {bulkMutation.isPending ? t('portfolios.pool.assigning') : t('portfolios.pool.assignSelected')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
