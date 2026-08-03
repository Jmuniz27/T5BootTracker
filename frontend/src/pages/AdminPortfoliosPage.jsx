import { useState } from 'react'
import FinancePortfolios from '../components/admin/FinancePortfolios'
import SalespeopleActivity from '../components/admin/SalespeopleActivity'

/**
 * Lo que ve el administrador al entrar a pagos.
 *
 * Dos preguntas distintas sobre el mismo equipo, y por eso dos pestañas: quién
 * está cobrando (Finanzas, con su cartera de bootcampers) y quién está
 * vendiendo (leads, conversiones). El administrador no tiene cartera propia:
 * mira las ajenas, y sólo mira.
 */

const TABS = [
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'vendedores', label: 'Vendedores' },
]

export default function AdminPortfoliosPage() {
  const [activa, setActiva] = useState('finanzas')

  return (
    <div className="p-6 sm:p-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Equipo</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Cobro por Finanzas y actividad comercial por vendedor. Sólo consulta.
        </p>
      </header>

      <div role="tablist" aria-label="Vistas del equipo" className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={activa === id}
            aria-controls={`panel-${id}`}
            onClick={() => setActiva(id)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
              activa === id
                ? 'border-[#1D3176] text-[#1D3176]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${activa}`} aria-labelledby={`tab-${activa}`}>
        {activa === 'finanzas' ? <FinancePortfolios /> : <SalespeopleActivity />}
      </div>
    </div>
  )
}
