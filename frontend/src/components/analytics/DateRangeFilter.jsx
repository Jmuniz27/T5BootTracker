/**
 * Date-range + segment + program filter bar for the Analytics dashboard (CB-57).
 * Controlled component: parent owns state and passes it into the query key.
 */
const SEGMENTS = [
  { value: 'all', label: 'Todo' },
  { value: 'leads', label: 'Leads' },
  { value: 'payments', label: 'Pagos' },
  { value: 'conversions', label: 'Conversiones' },
]

const inputClass =
  'px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white'

export default function DateRangeFilter({
  dateFrom,
  dateTo,
  segment,
  programId,
  programs = [],
  onChange,
  invalidRange,
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div className="flex flex-col">
        <label className="text-xs text-gray-400 mb-1">Desde</label>
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className={inputClass}
          aria-label="Fecha desde"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-gray-400 mb-1">Hasta</label>
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className={inputClass}
          aria-label="Fecha hasta"
        />
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-400 mb-1">Segmento</label>
        <select
          value={segment}
          onChange={(e) => onChange({ segment: e.target.value })}
          className={`${inputClass} appearance-none pr-8`}
          aria-label="Segmento"
        >
          {SEGMENTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-400 mb-1">Programa</label>
        <select
          value={programId}
          onChange={(e) => onChange({ programId: e.target.value })}
          className={`${inputClass} appearance-none pr-8`}
          aria-label="Programa"
        >
          <option value="">Todos</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {invalidRange && (
        <p className="text-xs text-red-500 pb-3">La fecha “desde” no puede ser mayor que “hasta”.</p>
      )}
    </div>
  )
}
