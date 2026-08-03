// Normaliza la lista de reuniones (array o respuesta paginada {results}).
export function normalizeMeetings(data) {
  if (Array.isArray(data)) return data
  return data?.results ?? []
}

// Mapea reuniones a eventos de react-big-calendar.
export function toCalendarEvents(meetings, leadNameById = {}) {
  return meetings.map((m) => ({
    id: m.id,
    title: m.title || leadNameById[m.lead] || 'Reunión',
    start: new Date(m.start_time),
    end: new Date(m.end_time),
    resource: m,
  }))
}

// Aplana la respuesta de getLeads a [{id, name}].
export function flattenLeads(data) {
  if (Array.isArray(data)) return data.map((l) => ({ id: l.id, name: l.name }))
  const my = data?.my_leads ?? []
  const avail = data?.available_leads ?? []
  return [...my, ...avail].map((l) => ({ id: l.id, name: l.name }))
}

// Date → valor para <input type="datetime-local"> ('YYYY-MM-DDTHH:mm', hora local).
export function toDatetimeLocal(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
