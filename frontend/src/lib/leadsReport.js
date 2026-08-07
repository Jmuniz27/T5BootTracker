/**
 * Definición del reporte de leads (CB-58 / #23).
 *
 * Las columnas salen de lo que la clienta pidió en la demo del 05 ago 2026. Sus
 * dos usos declarados mandan sobre el diseño:
 *
 *   1. Sacar nombre, teléfono y correo de los interesados para escribirles.
 *   2. Saber cuándo fue la última vez que se contactó a cada quien.
 *
 * De ahí que las tres fechas —asignación, primera y última interacción— sean
 * columnas propias y no un "hace N días": ella las compara entre sí.
 *
 * Vive acá y no en la página para que las etiquetas de estado y fuente tengan
 * una sola fuente de verdad: el dashboard las importa desde este módulo.
 */

export const SOURCE_LABELS = {
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LANDING_PAGE: 'Landing Page',
  MANUAL: 'Manual',
}

export const STATUS_LABELS = {
  NEW: 'Nuevo',
  QUALIFIED: 'Calificado',
  INTERESTED: 'Interesado',
  NOT_INTERESTED: 'No interesado',
  CONVERTED: 'Convertido',
}

/**
 * Fecha en formato corto local, o celda vacía.
 *
 * Un lead sin interacciones llega con `null` en las tres fechas. Pasarlo por
 * `new Date(null)` daría el 1 de enero de 1970 y por `new Date(undefined)`,
 * "Invalid Date" — dos formas distintas de mentir en el reporte.
 */
export function formatReportDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Colapsa espacios en blanco: un comentario multilínea rompe la fila del PDF. */
export function flattenNote(value) {
  if (!value) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

export const LEAD_REPORT_COLUMNS = [
  { key: 'name', header: 'Nombre' },
  { key: 'phone', header: 'Teléfono' },
  { key: 'email', header: 'Correo', format: (v) => v || '' },
  { key: 'source', header: 'Fuente', format: (v) => SOURCE_LABELS[v] ?? v ?? '' },
  { key: 'program_interest', header: 'Programa de interés', format: (v) => v || '' },
  { key: 'status', header: 'Estado', format: (v) => STATUS_LABELS[v] ?? v ?? '' },
  // La fecha de asignación no dice nada sin saber a quién: van juntas.
  { key: 'owner_name', header: 'Vendedor', format: (v) => v || 'Sin asignar' },
  { key: 'assigned_at', header: 'Fecha de asignación', format: formatReportDate },
  { key: 'first_interaction_at', header: 'Primera interacción', format: formatReportDate },
  { key: 'last_interaction_at', header: 'Última interacción', format: formatReportDate },
  { key: 'last_note', header: 'Último comentario', format: flattenNote },
]
