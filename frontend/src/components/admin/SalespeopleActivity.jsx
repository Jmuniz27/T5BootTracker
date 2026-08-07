import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSalespeopleActivity } from '../../api/salespeople.api'

/**
 * Pestaña de vendedores: qué está haciendo cada uno con sus leads.
 *
 * Mide volumen y resultado, no plata. El cobro es de Finanzas y ya se ve
 * agrupado por responsable en la otra pestaña; repetirlo acá, agrupado por
 * quién trajo al bootcamper, serían los mismos montos contados de otra forma.
 *
 * Cada tarjeta abre el rendimiento de ese vendedor: totales, reparto de sus
 * leads por estado y evolución mensual.
 */

/** Decorativo: el correo ya está en texto al lado, así que se oculta a lectores. */
function MailIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  )
}

function SalespersonCard({ person, onSelect }) {
  const assigned    = person.assigned_leads ?? 0
  const converted   = person.converted_leads ?? 0
  const uncontacted = person.uncontacted_leads ?? 0
  const rate        = person.conversion_rate ?? 0

  return (
    <button
      onClick={onSelect}
      className="bg-white border border-gray-200 rounded-2xl p-5 text-left w-full group hover:shadow-md hover:border-[#1D3176]/30 transition-all"
    >
      {/* La pastilla va arriba a la derecha, a la altura del nombre: es una
          alerta y se lee de un vistazo al escanear la grilla de tarjetas.
          `shrink-0` para que no la aplaste un nombre largo. */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#1D3176] transition-colors">
            {person.salesperson}
          </p>
          <p className="text-xs text-gray-400 flex items-center gap-1 min-w-0">
            <MailIcon />
            <span className="truncate">{person.email}</span>
          </p>
        </div>
        {uncontacted > 0 && (
          <span className="shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
            {uncontacted} sin contactar
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-gray-900 leading-tight">
        {assigned}
        <span className="text-sm font-medium text-gray-400 ml-1.5">
          lead{assigned === 1 ? '' : 's'} asignado{assigned === 1 ? '' : 's'}
        </span>
      </p>

      {/* La barra se dibuja siempre, aunque esté vacía: si se oculta, las
          tarjetas quedan de alturas distintas y la grilla se ve rota. Sin leads
          la tasa es "—" y no "0%" — nadie convierte de cero, y un 0% rojo
          culparía al vendedor por no haber recibido nada. */}
      <div className="mt-3">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400">Convertidos</span>
          <span className="text-xs font-semibold text-gray-700">
            {assigned > 0 ? `${rate}%` : '—'}
          </span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: assigned > 0 ? `${Math.min(rate, 100)}%` : '0%' }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {assigned > 0 ? `${converted} de ${assigned}` : 'Sin leads asignados'}
        </p>
      </div>
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

export default function SalespeopleActivity() {
  const navigate = useNavigate()
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
            <SalespersonCard
              key={person.salesperson_id}
              person={person}
              onSelect={() => navigate(`/analytics/vendedor/${person.salesperson_id}`)}
            />
          ))}
        </div>
      )}
    </>
  )
}
