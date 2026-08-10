// Normaliza la lista de reuniones (array o respuesta paginada {results}).
export function normalizeMeetings(data) {
  if (Array.isArray(data)) return data
  return data?.results ?? []
}

// Mapea reuniones a eventos de react-big-calendar. Con `showOwner` (agenda
// global del admin) el título incluye de quién es la reunión.
export function toCalendarEvents(meetings, leadNameById = {}, { showOwner = false } = {}) {
  return meetings.map((m) => {
    const base = m.title || leadNameById[m.lead] || 'Reunión'
    return {
      id: m.id,
      title: showOwner && m.assigned_to_name ? `${base} · ${m.assigned_to_name}` : base,
      start: new Date(m.start_time),
      end: new Date(m.end_time),
      resource: m,
    }
  })
}

// Aplana la respuesta de getLeads a [{id, name}]. Contempla tanto las claves del
// vendedor (my_leads/available_leads) como las del admin (all/assigned/unassigned).
export function flattenLeads(data) {
  if (Array.isArray(data)) return data.map((l) => ({ id: l.id, name: l.name }))
  const keys = ['my_leads', 'available_leads', 'all_leads', 'assigned_leads', 'unassigned_leads']
  const seen = new Set()
  const out = []
  for (const k of keys) {
    for (const l of data?.[k] ?? []) {
      if (seen.has(l.id)) continue
      seen.add(l.id)
      out.push({ id: l.id, name: l.name })
    }
  }
  return out
}

// Date → valor para <input type="datetime-local"> ('YYYY-MM-DDTHH:mm', hora local).
export function toDatetimeLocal(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
