import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const dialogRef = useModalA11y(onClose)
  const [form, setForm] = useState(initial ?? EMPTY)
  const [errors, setErrors] = useState({})

  // Se mantiene la resincronización con `initial`: la Agenda puede cambiar la
  // reunión que se está editando sin cerrar el modal.
  useEffect(() => {
    setForm(initial ?? EMPTY)
    setErrors({})
  }, [initial])

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
    setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev))
  }

  function validate() {
    const errs = {}
    if (!form.title.trim()) errs.title = t('agenda.form.titleRequired')
    if (!form.start) errs.start = t('agenda.form.startRequired')
    if (!form.end) errs.end = t('agenda.form.endRequired')
    if (!form.lead) errs.lead = t('agenda.form.selectLead')
    // La fecha de fin no puede ser anterior (ni igual) a la de inicio.
    if (form.start && form.end && new Date(form.end) <= new Date(form.start)) {
      errs.end = t('agenda.form.endAfterStart')
    }
    return errs
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    onSave({
      title: form.title,
      description: form.description,
      start_time: new Date(form.start).toISOString(),
      end_time: new Date(form.end).toISOString(),
      lead: form.lead,
      notify_lead: form.notify_lead,
    })
  }

  const title = editingId ? t('agenda.form.editTitle') : t('agenda.form.newTitle')

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
        noValidate
        className="w-full max-w-md max-h-full overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
      >
        <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t('agenda.form.titleLabel')} <span className="text-red-500">*</span></span>
          <input
            value={form.title}
            onChange={set('title')}
            placeholder={t('agenda.form.titlePlaceholder')}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.title ? 'border-red-400' : 'border-gray-300'}`}
          />
          {errors.title && <span className="mt-1 block text-xs text-red-500">{errors.title}</span>}
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t('agenda.form.descriptionLabel')}</span>
          <textarea
            value={form.description}
            onChange={set('description')}
            rows={3}
            placeholder={t('agenda.form.descriptionPlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">{t('agenda.form.startLabel')} <span className="text-red-500">*</span></span>
            <input
              type="datetime-local"
              value={form.start}
              onChange={set('start')}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.start ? 'border-red-400' : 'border-gray-300'}`}
            />
            {errors.start && <span className="mt-1 block text-xs text-red-500">{errors.start}</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">{t('agenda.form.endLabel')} <span className="text-red-500">*</span></span>
            <input
              type="datetime-local"
              value={form.end}
              onChange={set('end')}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.end ? 'border-red-400' : 'border-gray-300'}`}
            />
            {errors.end && <span className="mt-1 block text-xs text-red-500">{errors.end}</span>}
          </label>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{t('agenda.form.leadLabel')} <span className="text-red-500">*</span></span>
          <select
            value={form.lead}
            onChange={set('lead')}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.lead ? 'border-red-400' : 'border-gray-300'}`}
          >
            <option value="">{t('agenda.form.leadPlaceholder')}</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {errors.lead && <span className="mt-1 block text-xs text-red-500">{errors.lead}</span>}
        </label>

        <label className="mb-5 flex items-center gap-2">
          <input type="checkbox" checked={form.notify_lead} onChange={set('notify_lead')} />
          <span className="text-sm text-gray-700">{t('agenda.form.invite')}</span>
        </label>

        <div className="flex items-center justify-between">
          {editingId ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              {t('agenda.form.delete')}
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
              {t('agenda.form.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#213A8E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? t('agenda.form.saving') : t('agenda.form.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
