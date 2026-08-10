import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import './agenda.css'
import { getLeads } from '../api/leads.api'
import { useAuthStore } from '../store/auth.store'
import { useMeetings, useMeetingMutations } from '../hooks/use-meetings'
import MeetingFormModal from '../components/MeetingFormModal'
import { normalizeMeetings, toCalendarEvents, flattenLeads, toDatetimeLocal } from '../lib/meetings'

// Colores por responsable para la agenda global del admin: cada vendedor con su
// color, así se distinguen las reuniones de un vistazo.
const OWNER_PALETTE = ['#213A8E', '#7c3aed', '#0d9488', '#e11d48', '#d97706', '#0891b2', '#db2777', '#4f46e5']
function ownerColor(id) {
  if (!id) return '#213A8E'
  const key = String(id)
  let h = 0
  for (let i = 0; i < key.length; i++) h = key.charCodeAt(i) + ((h << 5) - h)
  return OWNER_PALETTE[Math.abs(h) % OWNER_PALETTE.length]
}

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
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMINISTRATOR'
  const { data, isLoading, isError, error } = useMeetings()
  const { data: leadsData } = useQuery({ queryKey: ['leads', 'for-meetings'], queryFn: () => getLeads() })
  const { create, update, remove } = useMeetingMutations()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formInitial, setFormInitial] = useState(EMPTY_FORM)

  const leads = useMemo(() => flattenLeads(leadsData), [leadsData])
  const leadNameById = useMemo(
    () => Object.fromEntries(leads.map((l) => [l.id, l.name])),
    [leads],
  )
  const events = useMemo(
    () => toCalendarEvents(normalizeMeetings(data), leadNameById, { showOwner: isAdmin }),
    [data, leadNameById, isAdmin],
  )

  // Leyenda de la agenda global: cada responsable con su color, para saber de
  // quién es cada reunión sin depender de que el título entre en la celda del mes.
  const owners = useMemo(() => {
    if (!isAdmin) return []
    const map = new Map()
    for (const m of normalizeMeetings(data)) {
      if (m.assigned_to && !map.has(m.assigned_to)) {
        map.set(m.assigned_to, m.assigned_to_name || 'Sin responsable')
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name, color: ownerColor(id) }))
  }, [data, isAdmin])

  function openCreate(start) {
    const s = start ?? new Date()
    const e = new Date(s.getTime() + 30 * 60000)
    setEditingId(null)
    setFormInitial({ ...EMPTY_FORM, start: toDatetimeLocal(s), end: toDatetimeLocal(e) })
    setModalOpen(true)
  }

  function openEdit(meeting) {
    setEditingId(meeting.id)
    setFormInitial({
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
    setFormInitial(EMPTY_FORM)
  }

  // payload ya viene armado desde el MeetingFormModal.
  function handleSaveMeeting(payload) {
    const opts = { onSuccess: closeModal }
    if (editingId) update.mutate({ id: editingId, data: payload }, opts)
    else create.mutate(payload, opts)
  }

  function handleDelete() {
    if (editingId) remove.mutate(editingId, { onSuccess: closeModal })
  }

  const saving = create.isPending || update.isPending

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? 'Agenda global' : 'Agenda'}</h1>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? 'Todas las reuniones del equipo comercial, con su responsable.'
              : 'Reuniones agendadas con leads (sincronizadas a Google Calendar).'}
          </p>
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

      {/* Leyenda por responsable (solo agenda global del admin) */}
      {isAdmin && owners.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-xs font-medium text-gray-500">Responsable:</span>
          {owners.map((o) => (
            <span key={o.id} className="flex items-center gap-1.5 text-xs text-gray-700">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: o.color }} />
              {o.name}
            </span>
          ))}
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
          // La vista "Lista" muestra el título completo (con el responsable en la
          // agenda global), que en las celdas del mes puede quedar cortado.
          views={['month', 'agenda']}
          defaultView="month"
          selectable
          popup
          onSelectSlot={(slot) => openCreate(slot.start)}
          onSelectEvent={(ev) => openEdit(ev.resource)}
          eventPropGetter={(ev) => {
            // En la agenda global cada responsable tiene su color.
            const color = isAdmin ? ownerColor(ev.resource?.assigned_to) : '#213A8E'
            return { style: { backgroundColor: color, borderColor: color, fontSize: 12 } }
          }}
        />
      </div>

      <MeetingFormModal
        open={modalOpen}
        editingId={editingId}
        initial={formInitial}
        leads={leads}
        saving={saving}
        deleting={remove.isPending}
        onSave={handleSaveMeeting}
        onDelete={handleDelete}
        onClose={closeModal}
      />

      {isLoading && <p className="mt-3 text-sm text-gray-400">Cargando reuniones…</p>}
    </div>
  )
}
