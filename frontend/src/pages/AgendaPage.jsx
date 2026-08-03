import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { getLeads } from '../api/leads.api'
import { useMeetings, useMeetingMutations } from '../hooks/use-meetings'
import { normalizeMeetings, toCalendarEvents, flattenLeads, toDatetimeLocal } from '../lib/meetings'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { es },
})

const messages = {
  next: 'Sig.',
  previous: 'Ant.',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Lista',
  date: 'Fecha',
  time: 'Hora',
  event: 'Reunión',
  noEventsInRange: 'Sin reuniones en este rango.',
  showMore: (t) => `+${t} más`,
}

const EMPTY_FORM = { title: '', description: '', start: '', end: '', lead: '', notify_lead: true }

export default function AgendaPage() {
  const { data, isLoading, isError, error } = useMeetings()
  const { data: leadsData } = useQuery({ queryKey: ['leads', 'for-meetings'], queryFn: () => getLeads() })
  const { create, update, remove } = useMeetingMutations()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const leads = useMemo(() => flattenLeads(leadsData), [leadsData])
  const leadNameById = useMemo(
    () => Object.fromEntries(leads.map((l) => [l.id, l.name])),
    [leads],
  )
  const events = useMemo(
    () => toCalendarEvents(normalizeMeetings(data), leadNameById),
    [data, leadNameById],
  )

  function openCreate(start) {
    const s = start ?? new Date()
    const e = new Date(s.getTime() + 30 * 60000)
    setEditingId(null)
    setForm({ ...EMPTY_FORM, start: toDatetimeLocal(s), end: toDatetimeLocal(e) })
    setModalOpen(true)
  }

  function openEdit(meeting) {
    setEditingId(meeting.id)
    setForm({
      title: meeting.title ?? '',
      description: meeting.description ?? '',
      start: toDatetimeLocal(meeting.start_time),
      end: toDatetimeLocal(meeting.end_time),
      lead: meeting.lead ?? '',
      notify_lead: false,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSave(e) {
    e.preventDefault()
    const payload = {
      title: form.title,
      description: form.description,
      start_time: new Date(form.start).toISOString(),
      end_time: new Date(form.end).toISOString(),
      lead: form.lead,
      notify_lead: form.notify_lead, // ignorado por el backend hasta que JL agregue el flag
    }
    const opts = { onSuccess: closeModal }
    if (editingId) update.mutate({ id: editingId, data: payload }, opts)
    else create.mutate(payload, opts)
  }

  function handleDelete() {
    if (editingId) remove.mutate(editingId, { onSuccess: closeModal })
  }

  const saving = create.isPending || update.isPending
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500">Reuniones agendadas con leads (sincronizadas a Google Calendar).</p>
        </div>
        <button
          onClick={() => openCreate()}
          className="rounded-lg bg-[#213A8E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Nueva reunión
        </button>
      </div>

      {isError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No se pudieron cargar las reuniones
          {error?.response?.status === 404
            ? ' — la API de reuniones aún no está disponible en este entorno (falta desplegar/redeploy).'
            : '. Intenta de nuevo.'}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3" style={{ height: 640 }}>
        <Calendar
          localizer={localizer}
          culture="es"
          events={events}
          messages={messages}
          startAccessor="start"
          endAccessor="end"
          views={['month', 'week', 'day', 'agenda']}
          selectable
          popup
          onSelectSlot={(slot) => openCreate(slot.start)}
          onSelectEvent={(ev) => openEdit(ev.resource)}
          eventPropGetter={() => ({
            style: { backgroundColor: '#213A8E', borderColor: '#213A8E', fontSize: 12 },
          })}
        />
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSave}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              {editingId ? 'Editar reunión' : 'Nueva reunión'}
            </h2>

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
              <input
                required
                value={form.title}
                onChange={set('title')}
                placeholder="Reunión con Ana Torres"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={3}
                placeholder="Detalles, notas, próxima acción…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Inicio</span>
                <input
                  required
                  type="datetime-local"
                  value={form.start}
                  onChange={set('start')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Fin</span>
                <input
                  required
                  type="datetime-local"
                  value={form.end}
                  onChange={set('end')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Lead</span>
              <select
                required
                value={form.lead}
                onChange={set('lead')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecciona un lead…</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>

            <label className="mb-5 flex items-center gap-2">
              <input type="checkbox" checked={form.notify_lead} onChange={set('notify_lead')} />
              <span className="text-sm text-gray-700">Invitar al lead por correo</span>
            </label>

            <div className="flex items-center justify-between">
              {editingId ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={remove.isPending}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Eliminar
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#213A8E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {isLoading && <p className="mt-3 text-sm text-gray-400">Cargando reuniones…</p>}
    </div>
  )
}
