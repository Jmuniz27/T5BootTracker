import { useEffect, useState } from 'react'
import { useModalA11y } from '../hooks/use-modal-a11y'

const EMPTY = { title: '', description: '', start: '', end: '', lead: '', notify_lead: true }

/**
 * Modal reutilizable para crear/editar una reunión (meetings API).
 * Lo usan tanto la Agenda como "Registrar interacción".
 *
 * La compuerta `open` vive en este componente y el diálogo en otro aparte:
 * `useModalA11y` bloquea el scroll del body y atrapa el foco desde que se
 * monta, y los hooks no admiten un retorno temprano, así que el diálogo sólo
 * puede existir mientras está abierto.
 */
export default function MeetingFormModal({ open, ...props }) {
  if (!open) return null
  return <MeetingFormDialog {...props} />
}

function MeetingFormDialog({
  editingId = null,
  initial,
  leads = [],
  saving = false,
  deleting = false,
  onSave,
  onDelete,
  onClose,
}) {
  const dialogRef = useModalA11y(onClose)
  const [form, setForm] = useState(initial ?? EMPTY)

  // Se mantiene la resincronización con `initial`: la Agenda puede cambiar la
  // reunión que se está editando sin cerrar el modal.
  useEffect(() => {
    setForm(initial ?? EMPTY)
  }, [initial])

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      title: form.title,
      description: form.description,
      start_time: new Date(form.start).toISOString(),
      end_time: new Date(form.end).toISOString(),
      lead: form.lead,
      notify_lead: form.notify_lead,
    })
  }

  const title = editingId ? 'Editar reunión' : 'Nueva reunión'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md max-h-full overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
      >
        <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>

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
              onClick={onDelete}
              disabled={deleting}
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
              onClick={onClose}
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
  )
}
