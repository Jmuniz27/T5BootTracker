import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { getSalespeopleActivity } from '../../api/salespeople.api'
import CustomSelect from '../CustomSelect'
import { rangeStartDate } from '../../lib/dateRange'
import Skeleton from '../ui/Skeleton'

/**
 * Comparativa entre vendedores (#327).
 *
 * La clienta pidió poder contrastar en vez de mirar de a uno:
 *
 *   "¿es por cada uno? ¿No hay comparativa?"
 *   "cuántos leads en total ha manejado y cuántos convertidos ha tenido;
 *    generalmente los importantes son los leads y los convertidos"
 *
 * Por eso las dos series del gráfico son ésas, y la tasa acompaña en la tabla:
 * comparar sólo tasas premiaría a quien maneja tres leads y convierte uno.
 *
 * Se alimenta del mismo endpoint que la grilla de actividad, así que los números
 * son los mismos que ya se ven en la otra pestaña.
 */

const BAR_COLORS = {
  assigned: '#94A3B8',
  converted: '#213A8E',
}

/**
 * Períodos del comparativo (#337).
 *
 * El backend acota por **fecha de asignación** del lead: lo que le corresponde a
 * un vendedor de un lead empieza cuando se lo asignan. "El último año" fue el
 * ejemplo que dio la clienta, así que va primero entre los acotados.
 */
const RANGE_OPTIONS = [
  { value: '',    label: 'Todo el histórico' },
  { value: '365', label: 'Último año' },
  { value: '180', label: 'Últimos 6 meses' },
  { value: '90',  label: 'Últimos 3 meses' },
]

/** Nombre corto para el eje: los completos se pisan entre sí. */
function shortName(fullName) {
  if (!fullName) return '—'
  const [first, second] = fullName.split(' ')
  return second ? `${first} ${second[0]}.` : first
}

function EmptyState({ children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
      <p className="text-sm text-gray-500">{children}</p>
    </div>
  )
}

export default function SalespeopleComparison() {
  const [selected, setSelected] = useState(() => new Set())
  const [rangeDays, setRangeDays] = useState('')

  const fechaDesde = rangeStartDate(rangeDays)

  const { data: salespeople = [], isLoading, isError } = useQuery({
    // El rango entra en la queryKey: sin él, cambiar de período mostraría los
    // números del anterior desde la caché.
    queryKey: ['salespeople-activity', fechaDesde],
    queryFn: () => getSalespeopleActivity(fechaDesde ? { fecha_desde: fechaDesde } : {}),
  })

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const comparados = salespeople.filter((p) => selected.has(p.salesperson_id ?? p.id))

  const chartData = comparados.map((p) => ({
    name: shortName(p.salesperson),
    Leads: p.assigned_leads ?? 0,
    Convertidos: p.converted_leads ?? 0,
  }))

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        No pudimos cargar a los vendedores. Intenta de nuevo.
      </div>
    )
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full" rounded="rounded-2xl" />
  }

  if (salespeople.length === 0) {
    return <EmptyState>Todavía no hay vendedores con leads asignados.</EmptyState>
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-sm font-medium text-gray-700">
            Elige a quiénes comparar
          </p>
          <div className="min-w-[200px]">
            <CustomSelect
              value={rangeDays}
              onChange={setRangeDays}
              options={RANGE_OPTIONS}
              placeholder="Todo el histórico"
              ariaLabel="Período a comparar"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {salespeople.map((person) => {
            const id = person.salesperson_id ?? person.id
            const activo = selected.has(id)
            return (
              <label
                key={id}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${
                  activo
                    ? 'border-[#213A8E] bg-blue-50 text-[#213A8E] font-medium'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={() => toggle(id)}
                  className="rounded border-gray-300 text-[#213A8E] focus:ring-[#213A8E]"
                />
                {person.salesperson}
              </label>
            )
          })}
        </div>
      </div>

      {comparados.length === 0 && (
        <EmptyState>Marca dos o más vendedores para verlos lado a lado.</EmptyState>
      )}

      {comparados.length > 0 && (
        <>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900">
              Leads manejados y convertidos
            </h3>
            <p data-testid="comparison-period" className="text-xs text-gray-400 mb-4">
              {rangeDays
                ? `${RANGE_OPTIONS.find((o) => o.value === rangeDays)?.label} · por fecha de asignación`
                : 'Todo el histórico'}
            </p>
            {/* Alto fijo y ancho responsivo: recharts necesita un alto concreto
                para dibujar, pero el ancho sí se adapta al contenedor. */}
            <div className="h-72" data-testid="comparison-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Leads" fill={BAR_COLORS.assigned} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Convertidos" fill={BAR_COLORS.converted} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {['Vendedor', 'Leads', 'Convertidos', 'Tasa'].map((h) => (
                    <th key={h} className="py-2 px-2 text-xs uppercase tracking-wide text-gray-500 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {comparados.map((person) => (
                  <tr key={person.salesperson_id ?? person.id}>
                    <td className="py-2.5 px-2 font-medium text-gray-900">{person.salesperson}</td>
                    <td className="py-2.5 px-2 text-gray-700">{person.assigned_leads ?? 0}</td>
                    <td className="py-2.5 px-2 text-gray-700">{person.converted_leads ?? 0}</td>
                    {/* La tasa acompaña, no encabeza: sola premiaría a quien
                        maneja tres leads y convierte uno. */}
                    <td className="py-2.5 px-2 text-gray-500">{person.conversion_rate ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
