import CustomSelect from '../CustomSelect'

// Espejo de Lead.source en backend/apps/leads/models.py
const SEGMENT_OPTIONS = [
  { value: '', label: 'Todas las fuentes' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'LANDING_PAGE', label: 'Landing Page' },
  { value: 'MANUAL', label: 'Manual' },
]

const EMPTY = { fecha_desde: '', fecha_hasta: '', segment: '' }

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200'

/**
 * Filtros del dashboard de analítica (S4-4a). Controlado: el padre es dueño del
 * objeto `filters` y se lo pasa tal cual al hook, que lo usa como queryKey.
 */
export default function AnalyticsFilters({ filters, onChange }) {
  const set = (field) => (value) => onChange({ ...filters, [field]: value })

  const invalidRange =
    filters.fecha_desde && filters.fecha_hasta && filters.fecha_desde > filters.fecha_hasta

  const hasAny = Object.values(filters).some(Boolean)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="analytics-desde" className="block text-sm font-medium text-gray-700 mb-1">
            Desde
          </label>
          <input
            id="analytics-desde"
            type="date"
            value={filters.fecha_desde}
            max={filters.fecha_hasta || undefined}
            onChange={(e) => set('fecha_desde')(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="analytics-hasta" className="block text-sm font-medium text-gray-700 mb-1">
            Hasta
          </label>
          <input
            id="analytics-hasta"
            type="date"
            value={filters.fecha_hasta}
            min={filters.fecha_desde || undefined}
            onChange={(e) => set('fecha_hasta')(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">Fuente</span>
          <CustomSelect
            value={filters.segment}
            onChange={set('segment')}
            options={SEGMENT_OPTIONS}
            placeholder="Todas las fuentes"
          />
        </div>
      </div>

      {invalidRange && (
        <p role="alert" className="text-xs text-red-500 mt-3">
          La fecha “Desde” no puede ser posterior a “Hasta”.
        </p>
      )}

      {hasAny && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY })}
          className="mt-3 text-sm text-[#213A8E] font-medium hover:underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

export { EMPTY as EMPTY_ANALYTICS_FILTERS, SEGMENT_OPTIONS }
