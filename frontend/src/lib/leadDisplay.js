/**
 * Presentación de datos del lead: etiquetas y textos derivados.
 *
 * Viven fuera de la página porque `LeadsDashboard.jsx` exporta componentes, y
 * mezclar ahí exports que no son componentes rompe el fast refresh de Vite: al
 * guardar, en vez de recargar sólo el componente, se reinicia el módulo entero
 * y se pierde el estado de la pantalla.
 */

/**
 * Quién tiene el lead y desde cuándo.
 *
 * La clienta lo pidió como su medida de leads abandonados: quiere ver de un
 * vistazo cuánto lleva alguien sentado sobre el mismo lead. Por eso van juntos
 * el vendedor, la fecha y los días — la fecha sola obliga a hacer la cuenta.
 *
 * `days_assigned` lo calcula el backend, que además lo congela en la fecha de
 * liberación si el lead ya se soltó (CR-006).
 */
export function assignmentLabel(lead) {
  if (!lead?.owner) return 'Sin asignar'

  const nombre = lead.owner_name ?? 'Vendedor'
  const fecha = lead.assigned_at ? new Date(lead.assigned_at) : null

  if (!fecha || Number.isNaN(fecha.getTime())) return nombre

  const desde = fecha.toLocaleDateString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const dias = lead.days_assigned
  if (dias == null) return `${nombre} · desde el ${desde}`

  return `${nombre} · desde el ${desde} (${dias} ${dias === 1 ? 'día' : 'días'})`
}

/**
 * Causales de cierre de un lead.
 *
 * Espejo de `Lead.DiscardReason` en el backend, que es quien valida de verdad:
 * acá sólo se arma el formulario.
 */
export const DISCARD_REASONS = [
  { value: 'NO_BUDGET',   label: 'Sin presupuesto' },
  { value: 'SCHEDULE',    label: 'Los horarios no le sirven' },
  { value: 'NO_RESPONSE', label: 'No responde / los correos rebotan' },
  { value: 'FREE_ONLY',   label: 'Sólo busca contenido gratis' },
  { value: 'OTHER',       label: 'Otro' },
]
