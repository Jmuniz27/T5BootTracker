/**
 * Espejo de `Cohort.Status` en backend/apps/programs/models.py.
 *
 * Los tres estados son manuales: el administrador los mueve a mano y nada se
 * deriva de las fechas. Al pasar a FINISHED el backend sella el mes de fin.
 */
export const COHORT_STATUS_OPTIONS = [
  { value: 'UPCOMING', label: 'Próximamente' },
  { value: 'IN_PROGRESS', label: 'En curso' },
  { value: 'FINISHED', label: 'Finalizada' },
]

export const COHORT_STATUS_LABELS = Object.fromEntries(
  COHORT_STATUS_OPTIONS.map(({ value, label }) => [value, label]),
)

/** Filtro de la lista: "Todos" no manda el parámetro. */
export const COHORT_FILTER_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...COHORT_STATUS_OPTIONS,
]

export const COHORT_STATUS_BADGE = {
  UPCOMING: 'bg-sky-100 text-sky-700',
  IN_PROGRESS: 'bg-emerald-100 text-emerald-700',
  FINISHED: 'bg-gray-100 text-gray-600',
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * "2026-09-01" → "septiembre 2026".
 *
 * Se parte la cadena en vez de usar `new Date(value)`: esa forma interpreta la
 * fecha en UTC y en husos negativos —como el de Ecuador— devuelve el mes
 * anterior.
 */
export function formatMonth(value) {
  if (!value) return '—'

  const [year, month] = value.split('-')
  const name = MONTHS[Number(month) - 1]
  return name ? `${name} ${year}` : value
}

/** Valor por defecto del input type="month": el mes en curso. */
export function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** El input entrega "2026-09"; el backend espera una fecha completa. */
export const monthInputToDate = (value) => (value ? `${value}-01` : '')
