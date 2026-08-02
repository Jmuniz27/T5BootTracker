import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { getLeads, assignLead, releaseLead, adminReassignLead, getInteractions, createLead, createInteraction, updateInteraction, convertLead, getPrograms, updateLeadStatus, getSelfAssignmentSetting } from '../api/leads.api'
import { getUsers } from '../api/users.api'
import { useAuthStore } from '../store/auth.store'
import CustomSelect from '../components/CustomSelect'
import SelfAssignmentToggle from '../components/leads/SelfAssignmentToggle'

const PAGE_SIZE = 10

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOURCE_LABELS = {
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LANDING_PAGE: 'Landing Page',
  MANUAL: 'Manual',
}

const SOURCE_ICON = {
  INSTAGRAM: '📷',
  WHATSAPP: '💬',
  LANDING_PAGE: '🌐',
  MANUAL: '✏️',
}

const AVATAR_COLORS = [
  'bg-[#213A8E]',
  'bg-violet-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-600',
  'bg-pink-500',
  'bg-indigo-500',
]

const STATUS_LABELS = {
  NEW: 'Nuevo',
  QUALIFIED: 'Calificado',
  INTERESTED: 'Interesado',
  NOT_INTERESTED: 'No interesado',
  CONVERTED: 'Convertido',
}

const STATUS_COLORS = {
  NEW: 'bg-gray-100 text-gray-500',
  QUALIFIED: 'bg-blue-100 text-blue-700',
  INTERESTED: 'bg-yellow-100 text-yellow-700',
  NOT_INTERESTED: 'bg-red-100 text-red-600',
  CONVERTED: 'bg-green-100 text-green-700',
}

const INTERACTION_TYPE_LABELS = {
  CALL: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  VISIT: 'Visita',
  NOTE: 'Nota',
}

const OUTCOME_LABELS = {
  CALL_AGAIN: 'Llamar de nuevo',
  SEND_INFO: 'Enviar información',
  SCHEDULE_VISIT: 'Agendar visita',
  AWAIT_REPLY: 'Esperar respuesta',
  SPEAK_COORDINATOR: 'Hablar coordinador',
}

const OUTCOME_COLORS = {
  CALL_AGAIN: 'bg-blue-50 text-blue-600',
  SEND_INFO: 'bg-blue-50 text-blue-600',
  SCHEDULE_VISIT: 'bg-blue-50 text-blue-600',
  AWAIT_REPLY: 'bg-blue-50 text-blue-600',
  SPEAK_COORDINATOR: 'bg-blue-50 text-blue-600',
}

// Badge usa status como fuente de verdad; lastOutcome solo como fallback visual si status no tiene label
function LeadStatusBadge({ status, lastOutcome }) {
  if (status === 'CONVERTED') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Convertido
      </span>
    )
  }
  const label = STATUS_LABELS[status] ?? OUTCOME_LABELS[lastOutcome] ?? status
  const color = STATUS_COLORS[status] ?? OUTCOME_COLORS[lastOutcome] ?? 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

// ─── Interaction Type Icon ────────────────────────────────────────────────────

function InteractionTypeIcon({ type }) {
  if (type === 'CALL') return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  )
  if (type === 'WHATSAPP') return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
  if (type === 'EMAIL') return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

// ─── Interactive Star Rating ──────────────────────────────────────────────────

function InteractiveStarRating({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star === value ? 0 : star)}
          className="focus:outline-none"
        >
          <svg
            className={`w-7 h-7 transition-colors ${star <= value ? 'text-blue-500' : 'text-gray-300'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({ value }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= value ? 'text-blue-500' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────


function StatCard({ label, value, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex-1 min-w-0 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-9 bg-gray-200 rounded w-16" />
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex-1 min-w-0">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-4xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const isError = type === 'error'

  return (
    <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg">
      <span
        className={`flex items-center justify-center w-6 h-6 rounded-full text-white ${
          isError ? 'bg-red-500' : 'bg-green-500'
        }`}
      >
        {isError ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white ml-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Skeleton Rows ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-32" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-40" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-24" /></td>
      <td className="py-3.5 px-3"><div className="h-3.5 bg-gray-200 rounded w-20" /></td>
      <td className="py-3.5 px-3"><div className="h-5 bg-gray-200 rounded-full w-20" /></td>
      <td className="py-3.5 px-3"><div className="h-5 bg-gray-200 rounded-full w-24" /></td>
      <td className="py-3.5 px-3"><div className="h-8 bg-gray-200 rounded-lg w-8" /></td>
    </tr>
  )
}

// ─── View History Modal ───────────────────────────────────────────────────────

function ViewHistoryModal({ lead, onClose }) {
  const [editTarget, setEditTarget] = useState(null)
  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ['interactions', lead.id],
    queryFn: () => getInteractions(lead.id),
  })

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: '2-digit' })
  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: true })

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[500px] max-h-[85vh] flex flex-col shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-6">Historial de interacciones</h2>

        <div className="overflow-y-auto space-y-3 flex-1 pr-1">
          {isLoading && [1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-start gap-3 p-3 border border-gray-100 rounded-xl">
              <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-gray-200 rounded w-32 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-48" />
              </div>
            </div>
          ))}

          {!isLoading && interactions.length === 0 && (
            <p className="text-center text-gray-400 py-10 text-sm">Aún no hay interacciones.</p>
          )}

          {!isLoading && interactions.map((interaction) => (
            <div key={interaction.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#213A8E] shrink-0">
                <InteractionTypeIcon type={interaction.interaction_type} />
              </div>
              <div className="flex-1 min-w-0">
                {/* Tipo + estrellas + duración */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {INTERACTION_TYPE_LABELS[interaction.interaction_type]}
                  </span>
                  {interaction.interest_level != null && interaction.interest_level > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-500 font-semibold">
                      <svg className="w-3.5 h-3.5 fill-amber-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.784.57-1.838-.197-1.54-1.118l1.286-3.957a1 1 0 00-.364-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69L9.049 2.927z"/></svg>
                      {interaction.interest_level}
                    </span>
                  )}
                  {interaction.duration_minutes != null && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {interaction.duration_minutes} min
                      </span>
                    </>
                  )}
                </div>
                {/* Badges: outcome (gris) + próxima acción (azul) */}
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                    {OUTCOME_LABELS[interaction.outcome]}
                  </span>
                  {interaction.next_action && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">
                      {interaction.next_action}
                    </span>
                  )}
                </div>
                {/* Notas */}
                {interaction.notes && (
                  <p className="text-xs text-gray-500 line-clamp-2">{interaction.notes}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                <button
                  onClick={() => setEditTarget(interaction)}
                  className="p-1.5 rounded-lg bg-[#1e3164] text-white hover:bg-[#162550] transition-colors"
                  title="Editar interacción"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2.414a2 2 0 01.586-1.414z" />
                  </svg>
                </button>
                <p className="text-xs text-gray-400">{formatDate(interaction.created_at)}</p>
                <p className="text-xs text-gray-400">{formatTime(interaction.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
      {editTarget && (
        <EditInteractionModal
          lead={lead}
          interaction={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  )
}

function validateInteractionForm(form) {
  const errs = {}
  if (!form.interaction_type) errs.interaction_type = 'Selecciona un tipo.'
  if (!form.outcome) errs.outcome = 'Selecciona un resultado.'
  return errs
}

function buildInteractionPayload(form) {
  const payload = { interaction_type: form.interaction_type, outcome: form.outcome }
  if (form.notes) payload.notes = form.notes
  if (form.interest_level) payload.interest_level = form.interest_level
  if (form.duration_minutes) payload.duration_minutes = parseInt(form.duration_minutes, 10)
  return payload
}

function makeInteractionSubmitHandler(form, mutation, setErrors) {
  return (e) => {
    e.preventDefault()
    const errs = validateInteractionForm(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    mutation.mutate(buildInteractionPayload(form))
  }
}

// ─── Edit Interaction Modal ───────────────────────────────────────────────────

function EditInteractionModal({ lead, interaction, onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    interaction_type: interaction.interaction_type ?? '',
    outcome: interaction.outcome ?? '',
    notes: interaction.notes ?? '',
    interest_level: interaction.interest_level ?? 0,
    duration_minutes: interaction.duration_minutes ?? '',
  })
  const [errors, setErrors] = useState({})

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const mutation = useMutation({
    mutationFn: (data) => updateInteraction(lead.id, interaction.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactions', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      onClose()
    },
  })

  const handleSubmit = makeInteractionSubmitHandler(form, mutation, setErrors)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 w-[520px] max-h-[90vh] overflow-y-auto shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-6">Editar interacción</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo <span className="text-red-500">*</span></label>
              <CustomSelect
                value={form.interaction_type}
                onChange={(val) => setForm((prev) => ({ ...prev, interaction_type: val }))}
                placeholder="Seleccionar"
                options={[
                  { value: 'CALL', label: 'Llamada' },
                  { value: 'WHATSAPP', label: 'WhatsApp' },
                  { value: 'EMAIL', label: 'Email' },
                  { value: 'VISIT', label: 'Visita' },
                  { value: 'NOTE', label: 'Nota' },
                ]}
              />
              {errors.interaction_type && <p className="text-xs text-red-500 mt-1">{errors.interaction_type}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resultado <span className="text-red-500">*</span></label>
              <CustomSelect
                value={form.outcome}
                onChange={(val) => setForm((prev) => ({ ...prev, outcome: val }))}
                placeholder="Seleccionar"
                options={[
                  { value: 'CALL_AGAIN', label: 'Llamar de nuevo' },
                  { value: 'SEND_INFO', label: 'Enviar información' },
                  { value: 'SCHEDULE_VISIT', label: 'Agendar visita' },
                  { value: 'AWAIT_REPLY', label: 'Esperar respuesta' },
                  { value: 'SPEAK_COORDINATOR', label: 'Hablar coordinador' },
                ]}
              />
              {errors.outcome && <p className="text-xs text-red-500 mt-1">{errors.outcome}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nivel de interés <span className="text-xs text-gray-400 font-normal">(opcional)</span></label>
              <InteractiveStarRating
                value={form.interest_level}
                onChange={(v) => setForm((prev) => ({ ...prev, interest_level: v }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duración <span className="text-xs text-gray-400 font-normal">(opcional)</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={form.duration_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value.replace(/\D/g, '') }))}
                  placeholder="ej. 5"
                  className="w-24 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 text-center"
                />
                <span className="text-sm text-gray-500">min</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas <span className="text-xs text-gray-400 font-normal">(opcional)</span></label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="¿Cómo fue la interacción?"
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-red-500 text-center">
              {mutation.error?.response?.data?.error ?? 'No se pudo guardar. Intenta de nuevo.'}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-3 rounded-xl bg-[#1e3164] text-white font-semibold hover:bg-[#162550] transition-colors disabled:opacity-60">
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Log Interaction Modal ────────────────────────────────────────────────────

const LOG_EMPTY = { interaction_type: '', outcome: '', notes: '', interest_level: 0, duration_minutes: '', discount_offered: null }

const DISCOUNT_OPTIONS = [10, 20, 30, 40, 50]

const NEXT_ACTION_OPTIONS = [
  'Llamar de nuevo',
  'Enviar información',
  'Agendar visita',
  'Esperar respuesta',
  'Hablar con coordinador',
]

function LogInteractionModal({ lead, onClose, onSuccess }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(LOG_EMPTY)
  const [errors, setErrors] = useState({})

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const mutation = useMutation({
    mutationFn: (data) => createInteraction(lead.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactions', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      onSuccess?.()
      onClose()
    },
  })

  const handleSubmit = makeInteractionSubmitHandler(form, mutation, setErrors)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[520px] max-h-[90vh] overflow-y-auto shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-6">Registrar interacción</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo + Resultado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de interacción <span className="text-red-500">*</span>
              </label>
              <CustomSelect
                testId="interaction-type"
                value={form.interaction_type}
                onChange={(val) => setForm((prev) => ({ ...prev, interaction_type: val }))}
                placeholder="Seleccionar"
                options={[
                  { value: 'CALL', label: 'Llamada' },
                  { value: 'WHATSAPP', label: 'WhatsApp' },
                  { value: 'EMAIL', label: 'Email' },
                  { value: 'VISIT', label: 'Visita' },
                  { value: 'NOTE', label: 'Nota' },
                ]}
              />
              {errors.interaction_type && <p className="text-xs text-red-500 mt-1">{errors.interaction_type}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resultado <span className="text-red-500">*</span>
              </label>
              <CustomSelect
                testId="interaction-outcome"
                value={form.outcome}
                onChange={(val) => setForm((prev) => ({ ...prev, outcome: val }))}
                placeholder="Seleccionar"
                options={[
                  { value: 'CALL_AGAIN', label: 'Llamar de nuevo' },
                  { value: 'SEND_INFO', label: 'Enviar información' },
                  { value: 'SCHEDULE_VISIT', label: 'Agendar visita' },
                  { value: 'AWAIT_REPLY', label: 'Esperar respuesta' },
                  { value: 'SPEAK_COORDINATOR', label: 'Hablar coordinador' },
                ]}
              />
              {errors.outcome && <p className="text-xs text-red-500 mt-1">{errors.outcome}</p>}
            </div>
          </div>

          {/* Nivel de interés + Duración */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nivel de interés <span className="text-xs text-gray-400 font-normal">(opcional)</span>
              </label>
              <InteractiveStarRating
                value={form.interest_level}
                onChange={(v) => setForm((prev) => ({ ...prev, interest_level: v }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duración <span className="text-xs text-gray-400 font-normal">(opcional)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={form.duration_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value.replace(/\D/g, '') }))}
                  placeholder="ej. 5"
                  className="w-24 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 text-center"
                />
                <span className="text-sm text-gray-500">min</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas <span className="text-xs text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              data-testid="interaction-notes"
              value={form.notes}
              onChange={set('notes')}
              placeholder="¿Cómo fue la interacción?"
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-red-500 text-center">
              {mutation.error?.response?.data?.error ?? 'No se pudo guardar la interacción.'}
            </p>
          )}

          <button
            type="submit"
            data-testid="interaction-submit"
            disabled={mutation.isPending}
            className="w-full py-3 rounded-xl bg-[#213A8E] text-white font-semibold hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar interacción'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── View Lead Modal ──────────────────────────────────────────────────────────

function ViewLeadModal({ lead, onClose }) {
  const { data: interactions = [] } = useQuery({
    queryKey: ['interactions', lead.id],
    queryFn: () => getInteractions(lead.id),
  })

  const lastInteraction = interactions[0]
  const rating = lastInteraction?.interest_level ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-sm shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-4 mb-5">
          <img
            src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(lead.name ?? 'lead')}`}
            alt={lead.name}
            className="w-16 h-16 rounded-full bg-gray-100 shrink-0 object-cover"
          />
          <div>
            {rating !== null ? (
              <>
                <p className="text-xs text-gray-400 mb-0.5">Última calificación:</p>
                <p className="text-3xl font-bold text-gray-900 leading-none mb-1">{rating.toFixed(1)}</p>
                <StarRating value={rating} />
                <p className="text-xs text-gray-400 mt-1">Basado en última interacción</p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-4">Sin interacciones aún</p>
            )}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">{lead.name}</h2>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-gray-700 mb-1">Contacto:</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-600">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>{lead.email || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>{lead.phone}</span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-0.5">Fuente:</p>
            <p className="text-gray-600">{SOURCE_ICON[lead.source]} {SOURCE_LABELS[lead.source] || lead.source}</p>
          </div>
          {lastInteraction?.notes && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">Última nota:</p>
              <p className="text-gray-600">{lastInteraction.notes}</p>
            </div>
          )}
          {lead.program_interest && (
            <div>
              <p className="font-semibold text-gray-700 mb-0.5">Interés en programa:</p>
              <p className="text-gray-600">{lead.program_interest}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Release Lead Modal ───────────────────────────────────────────────────────

function ReleaseLeadModal({ onKeep, onRelease, isLoading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onKeep}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[420px] shadow-xl text-center" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          ¿Seguro que quieres desasignar este lead?
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          El lead quedará disponible para otros vendedores.
          Perderás acceso al historial de interacciones.
        </p>
        <button
          onClick={onKeep}
          disabled={isLoading}
          className="w-full py-3 rounded-xl bg-[#213A8E] text-white font-semibold mb-3 hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
        >
          Conservar lead
        </button>
        <button
          onClick={onRelease}
          disabled={isLoading}
          className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {isLoading ? 'Desasignando…' : 'Desasignar lead'}
        </button>
      </div>
    </div>
  )
}

// ─── Admin Reassign Modal (CR-005) ────────────────────────────────────────────

function AdminReassignModal({ lead, onClose, onSubmit, isLoading }) {
  const [ownerId, setOwnerId] = useState('')

  let submitLabel = 'Liberar'
  if (isLoading) submitLabel = 'Guardando…'
  else if (ownerId) submitLabel = 'Reasignar'

  const { data } = useQuery({
    queryKey: ['users', 'salespersons'],
    queryFn: getUsers,
  })
  const salespeople = (data?.results ?? data ?? []).filter(
    (u) => u.role === 'SALESPERSON' && u.id !== lead.owner,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[440px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Liberar o reasignar lead</h2>
        <p className="text-sm text-gray-500 mb-5">
          Vendedor actual: <strong>{lead.owner_name ?? 'Sin asignar'}</strong>
        </p>

        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Reasignar a (opcional)
        </label>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="w-full mb-6 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">Liberar al pool (sin asignar)</option>
          {salespeople.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(ownerId || null)}
            disabled={isLoading}
            className="flex-1 py-3 rounded-xl bg-[#213A8E] text-white font-semibold hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Lead Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', phone: '', email: '', source: 'MANUAL', program_interest: '', is_company: false, autoAssign: false }

function isValidEmail(value) {
  const at = value.indexOf('@')
  if (at <= 0) return false
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (/\s/.test(local) || /[\s@]/.test(domain)) return false
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

function CreateLeadModal({ onClose, onSubmit, isLoading, canSelfAssign = true }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const { data: programs = [] } = useQuery({ queryKey: ['programs'], queryFn: getPrograms })

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'El nombre es requerido.'
    const phone = form.phone.trim()
    if (!phone) {
      errs.phone = 'El teléfono es requerido.'
    } else if (!/^(09\d{8}|0[2-7]\d{7})$/.test(phone)) {
      errs.phone = 'Ingresa un teléfono ecuatoriano válido (ej. 0991234567 o 042345678).'
    }
    if (form.email.trim() && !isValidEmail(form.email.trim())) {
      errs.email = 'Ingresa un email válido.'
    }
    return errs
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const { autoAssign, ...payload } = form
    if (!payload.email) delete payload.email
    if (!payload.program_interest) delete payload.program_interest
    onSubmit(payload, autoAssign)
  }

  const inputClass = (key) =>
    `w-full px-3 py-2.5 border rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
      errors[key] ? 'border-red-400' : 'border-gray-200'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[480px] shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center justify-between mb-6 pr-8">
          <h2 className="text-xl font-bold text-gray-900">Nuevo lead</h2>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, is_company: !prev.is_company }))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              form.is_company
                ? 'bg-indigo-200 text-indigo-700 border-indigo-300'
                : 'bg-indigo-50 text-indigo-300 border-indigo-100 hover:bg-indigo-100 hover:text-indigo-500 hover:border-indigo-200'
            }`}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
            </svg>
            Empresa
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre completo<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input type="text" data-testid="create-lead-name" value={form.name} onChange={set('name')} className={inputClass('name')} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input type="tel" data-testid="create-lead-phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} className={inputClass('phone')} />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="text" data-testid="create-lead-email" value={form.email} onChange={set('email')} className={inputClass('email')} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuente</label>
            <CustomSelect
              testId="create-lead-source"
              value={form.source}
              onChange={(val) => setForm((prev) => ({ ...prev, source: val }))}
              options={[
                { value: 'MANUAL', label: 'Manual' },
                { value: 'INSTAGRAM', label: 'Instagram' },
                { value: 'WHATSAPP', label: 'WhatsApp' },
                { value: 'LANDING_PAGE', label: 'Landing Page' },
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interés en programa</label>
            <CustomSelect
              testId="create-lead-program"
              value={form.program_interest}
              onChange={(val) => setForm((prev) => ({ ...prev, program_interest: val }))}
              placeholder="Sin especificar"
              options={programs.map((p) => ({ value: p.name, label: p.name }))}
            />
          </div>

          <div>
            <label className={`flex items-center gap-3 ${canSelfAssign ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              <input
                type="checkbox"
                data-testid="create-lead-autoassign"
                checked={form.autoAssign && canSelfAssign}
                disabled={!canSelfAssign}
                onChange={(e) => setForm((prev) => ({ ...prev, autoAssign: e.target.checked }))}
                className="w-4 h-4 accent-[#1e3164] rounded disabled:opacity-50"
              />
              <span className={`text-sm font-medium ${canSelfAssign ? 'text-gray-700' : 'text-gray-400'}`}>
                Asignarme este lead
              </span>
            </label>
            {!canSelfAssign && (
              <p className="text-xs text-gray-400 mt-1 ml-7">
                La asignación la realiza el Administrador.
              </p>
            )}
          </div>


          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="create-lead-submit"
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl bg-[#213A8E] text-white font-semibold hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
            >
              {isLoading ? 'Creando…' : 'Crear lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Update Status Modal ──────────────────────────────────────────────────────

function UpdateStatusModal({ lead, onClose, onSuccess }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState(lead.status)

  const mutation = useMutation({
    mutationFn: (newStatus) => updateLeadStatus(lead.id, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      onSuccess?.()
      onClose()
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (status !== lead.status) mutation.mutate(status)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[400px] shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-2">Cambiar estado</h2>
        <p className="text-sm text-gray-500 mb-6">{lead.name}</p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-2 mb-6">
            {Object.entries(STATUS_LABELS).filter(([value]) => value !== 'CONVERTED' && value !== 'NEW').map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  status === value
                    ? 'border-[#1e3164] bg-blue-50 text-[#1e3164]'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
                {status === value && (
                  <svg className="w-4 h-4 text-[#1e3164]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {mutation.isError && (
            <p className="text-xs text-red-500 mb-4 text-center">
              {mutation.error?.response?.data?.error ?? 'No se pudo actualizar el estado.'}
            </p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || status === lead.status}
            className="w-full py-3 rounded-xl bg-[#1e3164] text-white font-semibold hover:bg-[#162550] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Filter Dropdown ──────────────────────────────────────────────────────────

function FilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const options = [
    { value: '', label: 'Todos los estados' },
    ...Object.entries(STATUS_LABELS).map(([v, label]) => ({ value: v, label })),
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
          value ? 'border-[#213A8E] text-[#213A8E] bg-blue-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zM6 10a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zM9 16a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z" />
        </svg>
        {value ? STATUS_LABELS[value] : 'Filtrar'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                value === opt.value ? 'text-[#213A8E] font-semibold bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sort Dropdown ────────────────────────────────────────────────────────────

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const options = [
    { value: 'default', label: 'Por defecto' },
    { value: 'name_asc', label: 'Nombre A→Z' },
    { value: 'name_desc', label: 'Nombre Z→A' },
    { value: 'newest', label: 'Más reciente' },
    { value: 'oldest', label: 'Más antiguo' },
  ]

  const active = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
          value !== 'default' ? 'border-[#213A8E] text-[#213A8E] bg-blue-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
        {active?.label ?? 'Ordenar'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                value === opt.value ? 'text-[#213A8E] font-semibold bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Row Actions Dropdown ─────────────────────────────────────────────────────

// ─── Cédula Validator ─────────────────────────────────────────────────────────

function validateCedulaEcuatoriana(cedula) {
  if (!/^\d{10}$/.test(cedula)) return false
  const digits = cedula.split('').map(Number)
  const province = digits[0] * 10 + digits[1]
  if (province < 1 || province > 24) return false
  if (digits[2] >= 6) return false
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let val = digits[i] * coefficients[i]
    if (val >= 10) val -= 9
    sum += val
  }
  const checkDigit = sum % 10 === 0 ? 0 : 10 - (sum % 10)
  return checkDigit === digits[9]
}

function cedulaInputBorderClass(hasError, cedula) {
  if (hasError) return 'border-red-400'
  if (cedula.length === 10 && validateCedulaEcuatoriana(cedula)) return 'border-green-400'
  return 'border-gray-200'
}

// ─── Convert Lead Modal ───────────────────────────────────────────────────────

function ConvertLeadModal({ lead, onClose, onSuccess }) {
  const queryClient = useQueryClient()
  const [cedula, setCedula]   = useState('')
  const [programId, setProgramId] = useState('')
  const [email, setEmail]     = useState(lead.email || '')
  const [phone, setPhone]     = useState(lead.phone || '')
  const [errors, setErrors]   = useState({})
  const [result, setResult]   = useState(null) // conversion success data

  const { data: programs = [], isLoading: loadingPrograms } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  })

  const convertMutation = useMutation({
    mutationFn: ({ id, payload }) => convertLead(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setResult(data)
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Error al convertir. Intenta de nuevo.'
      setErrors((prev) => ({ ...prev, server: msg }))
    },
  })

  const validate = () => {
    const errs = {}
    if (!cedula.trim()) errs.cedula = 'La cédula es requerida.'
    else if (!validateCedulaEcuatoriana(cedula)) errs.cedula = 'Cédula ecuatoriana inválida.'
    if (!programId) errs.programId = 'Selecciona un programa.'
    return errs
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrors({})
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const payload = { cedula, program_id: programId }
    if (email) payload.email = email
    if (phone) payload.phone = phone
    convertMutation.mutate({ id: lead.id, payload })
  }

  // ── Success screen ──
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[480px] shadow-xl text-center" onClick={(e) => e.stopPropagation()}>
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Lead convertido!</h2>
          <p className="text-sm text-gray-500 mb-6">
            <span className="font-semibold text-gray-800">{lead.name}</span> ahora es Bootcamper.
          </p>

          <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2 mb-6">
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-800">{result.email}</span>
            </div>
            {result.temporary_password && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Contraseña temporal</span>
                <span className="font-mono font-bold text-[#213A8E] bg-blue-50 px-2 py-0.5 rounded">
                  {result.temporary_password}
                </span>
              </div>
            )}
            {result.is_returning && (
              <p className="text-xs text-amber-600 mt-1">⚠ Bootcamper recurrente — se reutilizó la cuenta existente.</p>
            )}
          </div>

          <button
            onClick={() => { onSuccess(); onClose() }}
            className="w-full py-3 rounded-xl bg-[#213A8E] text-white font-semibold hover:bg-[#1a2f72] transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    )
  }

  // ── Form screen ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-[500px] shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-1">Convertir lead</h2>
        <p className="text-sm text-gray-500 mb-6">
          Convirtiendo a <span className="font-semibold text-gray-800">{lead.name}</span> en Bootcamper.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cédula */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cédula <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              data-testid="convert-cedula"
              maxLength={10}
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, ''))}
              placeholder="10 dígitos"
              className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 ${cedulaInputBorderClass(errors.cedula, cedula)}`}
            />
            {errors.cedula && <p className="text-xs text-red-500 mt-1">{errors.cedula}</p>}
            {cedula.length === 10 && validateCedulaEcuatoriana(cedula) && (
              <p className="text-xs text-green-600 mt-1">✓ Cédula válida</p>
            )}
          </div>

          {/* Program */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Programa <span className="text-red-500">*</span>
            </label>
            <CustomSelect
              testId="convert-program"
              value={programId}
              onChange={(val) => setProgramId(val)}
              placeholder={loadingPrograms ? 'Cargando programas…' : 'Selecciona un programa'}
              options={programs.map((p) => ({ value: p.id, label: `${p.name} — starts ${p.start_date} · $${p.total_cost}` }))}
            />
            {errors.programId && <p className="text-xs text-red-500 mt-1">{errors.programId}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10 dígitos"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {errors.server && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{errors.server}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="convert-submit"
              disabled={convertMutation.isPending}
              className="flex-1 py-3 rounded-xl bg-[#213A8E] text-white font-semibold hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
            >
              {convertMutation.isPending ? 'Convirtiendo…' : 'Convertir a Bootcamper'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Actions Dropdown ─────────────────────────────────────────────────────────

function ActionsDropdown({ lead, isOwned, isAdmin, selfAssignEnabled, onView, onRelease, onAssign, onAdminReassign, onViewHistory, onLogInteraction, onConvert, onChangeStatus }) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        (!menuRef.current || !menuRef.current.contains(e.target))
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const upward = window.innerHeight - rect.bottom < 220
      setOpenUpward(upward)
      setPos({
        top: upward ? rect.top - 4 : rect.bottom + 4,
        left: rect.right - 160,
      })
    }
    setOpen((v) => !v)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        aria-label={`Acciones para ${lead.name}`}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#213A8E] text-white hover:bg-[#1a2f72] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={`fixed w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 ${openUpward ? '-translate-y-full' : ''}`}
          style={{ top: pos.top, left: pos.left }}
        >
          <button
            onClick={() => { onView(); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Ver lead
          </button>
          <button
            onClick={() => { onViewHistory(); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Ver historial
          </button>
          {isOwned && (
            <button
              onClick={() => { onLogInteraction(); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Registrar interacción
            </button>
          )}
          {isOwned && lead.status !== 'CONVERTED' && (
            <button
              onClick={() => { onChangeStatus(); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cambiar estado
            </button>
          )}
          {isOwned && lead.status === 'QUALIFIED' && (
            <button
              onClick={() => { onConvert(); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
            >
              Convertir lead
            </button>
          )}
          {isAdmin && lead.owner && (
            <button
              onClick={() => { onAdminReassign(); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Liberar / Reasignar
            </button>
          )}
          {!isAdmin && (isOwned ? (
            <button
              onClick={() => { onRelease(); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Desasignar lead
            </button>
          ) : (
            <div>
              <button
                onClick={() => { onAssign(); setOpen(false) }}
                disabled={!selfAssignEnabled}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                Asignarme
              </button>
              {!selfAssignEnabled && (
                <p className="px-4 pb-2 text-xs text-gray-400 leading-snug">
                  La asignación la realiza el Administrador.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Anterior
        </button>
        <button
          onClick={onNext}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortLeads(leads, sortKey) {
  const copy = [...leads]
  switch (sortKey) {
    case 'name_asc':  return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'name_desc': return copy.sort((a, b) => b.name.localeCompare(a.name))
    case 'newest':    return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    case 'oldest':    return copy.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    default:          return copy
  }
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function LeadsDashboard() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin = currentUser?.role === 'ADMINISTRATOR'
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState(false)
  const [sortKey, setSortKey]         = useState('default')
  const [page, setPage]               = useState(1)
  const [viewLead, setViewLead]           = useState(null)
  const [historyLead, setHistoryLead]     = useState(null)
  const [logLead, setLogLead]             = useState(null)
  const [statusLead, setStatusLead]       = useState(null)
  const [releaseTarget, setReleaseTarget] = useState(null)
  const [reassignTarget, setReassignTarget] = useState(null)
  const [convertTarget, setConvertTarget] = useState(null)
  const [showCreate, setShowCreate]       = useState(false)
  const [toast, setToast]                 = useState(null) // { message, type }
  const [activeTab, setActiveTab]         = useState('mine') // 'mine' | 'available'
  const [flashedLeadId, setFlashedLeadId] = useState(null)

  const showToast = (message, type = 'success') => setToast({ message, type })

  const flashLead = (id) => {
    setFlashedLeadId(id)
    setTimeout(() => setFlashedLeadId(null), 1500)
  }

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, statusFilter, companyFilter, sortKey])

  const queryParams = { page, page_size: PAGE_SIZE }
  if (search) queryParams.search = search
  if (statusFilter) queryParams.status = statusFilter

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', queryParams],
    queryFn: () => getLeads(queryParams),
    placeholderData: keepPreviousData,
  })

  // Query separada sin filtros para los stat cards
  const { data: statsData } = useQuery({
    queryKey: ['leads-stats'],
    queryFn: () => getLeads({ page: 1, page_size: 1 }),
    staleTime: 30000,
  })

  // Control global de auto-asignación (CR-004). El endpoint es de lectura para
  // cualquier autenticado, así que el vendedor también sabe si puede asignarse.
  const { data: selfAssignSetting, isLoading: loadingSelfAssign } = useQuery({
    queryKey: ['self-assignment-setting'],
    queryFn: getSelfAssignmentSetting,
  })

  // Mientras carga se asume habilitado: el backend rechaza igual con 403, así
  // que es preferible no parpadear el botón a bloquearlo de más.
  const selfAssignEnabled = selfAssignSetting?.self_assign_enabled ?? true

  const myLeads        = data?.my_leads ?? []
  const availableLeads = data?.available_leads ?? []

  const pagination     = data?.pagination ?? {}
  const statsPagination = statsData?.pagination ?? {}
  const conversions    = myLeads.filter((l) => l.status === 'CONVERTED').length
  const totalPages   = activeTab === 'mine'
    ? (pagination.my_leads_total_pages ?? 1)
    : (pagination.available_leads_total_pages ?? 1)

  const tabLeads = activeTab === 'mine'
    ? myLeads.map((l) => ({ ...l, _isOwned: l.owner === currentUser?.id }))
    : availableLeads.map((l) => ({ ...l, _isOwned: false }))

  const pageLeads = sortLeads(
    tabLeads.filter((l) => !companyFilter || l.is_company),
    sortKey,
  )

  const assignMutation = useMutation({
    mutationFn: assignLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      showToast('Lead asignado correctamente.')
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'No se pudo asignar el lead.'
      showToast(msg, 'error')
    },
  })

  const releaseMutation = useMutation({
    mutationFn: releaseLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setReleaseTarget(null)
      showToast('Lead desasignado correctamente.')
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'No se pudo desasignar el lead.'
      showToast(msg, 'error')
    },
  })

  const adminReassignMutation = useMutation({
    mutationFn: ({ id, ownerId }) => adminReassignLead(id, ownerId),
    onSuccess: (_, { ownerId }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setReassignTarget(null)
      showToast(ownerId ? 'Lead reasignado correctamente.' : 'Lead liberado correctamente.')
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'No se pudo liberar/reasignar el lead.'
      showToast(msg, 'error')
    },
  })

  const autoAssignRef = useRef(false)

  const createMutation = useMutation({
    mutationFn: createLead,
    onSuccess: async (newLead) => {
      if (autoAssignRef.current) {
        try {
          await assignLead(newLead.id)
          showToast('Lead creado y asignado a ti.')
          setActiveTab('mine')
        } catch {
          showToast('Lead creado, pero no se pudo asignar. Búscalo en Disponibles.', 'error')
          setActiveTab('available')
        }
      } else {
        showToast('Lead creado. Puedes encontrarlo en Disponibles.')
        setActiveTab('available')
      }
      await queryClient.invalidateQueries({ queryKey: ['leads'] })
      setShowCreate(false)
      setPage(1)
      setTimeout(() => flashLead(newLead.id), 100)
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'No se pudo crear el lead.'
      showToast(msg, 'error')
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Dashboard de Leads
        </h1>
        <button
          data-testid="new-lead-button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo lead
        </button>
      </div>

      {/* Control de auto-asignación — solo Administrador (CR-004) */}
      {isAdmin && (
        <SelfAssignmentToggle
          setting={selfAssignSetting}
          isLoading={loadingSelfAssign}
          onResult={showToast}
        />
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 lg:mb-8">
        <StatCard label="Total leads"    value={(statsPagination.my_leads_count ?? 0) + (statsPagination.available_leads_count ?? 0)} loading={isLoading} />
        <StatCard label="Asignados a mí" value={statsPagination.my_leads_count ?? myLeads.length} loading={isLoading} />
        <StatCard label="Conversiones"   value={conversions} loading={isLoading} />
        <StatCard label="No interesados" value={myLeads.filter((l) => l.status === 'NOT_INTERESTED').length} loading={isLoading} />
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Leads</h2>

        {/* Search + controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              data-testid="lead-search"
              placeholder="Buscar por nombre, email o teléfono"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button
            onClick={() => setCompanyFilter((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
              companyFilter
                ? 'border-indigo-500 text-indigo-700 bg-indigo-50'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
            </svg>
            Empresa
          </button>
          <SortDropdown value={sortKey} onChange={setSortKey} />
          <FilterDropdown value={statusFilter} onChange={setStatusFilter} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            data-testid="tab-mine"
            onClick={() => { setActiveTab('mine'); setPage(1) }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'mine'
                ? 'bg-[#213A8E] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Mis leads ({myLeads.length})
          </button>
          <button
            data-testid="tab-available"
            onClick={() => { setActiveTab('available'); setPage(1) }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'available'
                ? 'bg-[#213A8E] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Disponibles ({availableLeads.length})
          </button>
        </div>

        {/* Table */}
        {isError && (
          <p className="text-center text-red-500 py-8 text-sm">
            No se pudieron cargar los leads. Verifica que estés autenticado.
          </p>
        )}

        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100">
              {['Nombre', 'Email', 'Teléfono', 'Fuente', 'Estado', 'Asignado a', 'Acciones'].map((h) => (
                <th key={h} className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && !isError && pageLeads.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 py-10">
                  No se encontraron leads.
                </td>
              </tr>
            )}

            {!isLoading && !isError && pageLeads.map((lead) => (
              <tr key={lead.id} data-testid="lead-row" data-lead-phone={lead.phone} className={`transition-colors duration-700 ${flashedLeadId === lead.id ? 'bg-slate-100' : 'hover:bg-gray-50'}`}>
                <td className="py-3.5 px-3">
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(lead.name ?? 'lead')}`}
                      alt={lead.name}
                      className="w-7 h-7 rounded-full bg-gray-100 shrink-0"
                    />
                    <div className="flex flex-col gap-0.5">
                      {lead.is_company && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-400 w-fit">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                          </svg>
                          Empresa
                        </span>
                      )}
                      <span className="font-medium text-gray-900">{lead.name}</span>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-gray-500">{lead.email || '—'}</td>
                <td className="py-3.5 px-3 text-gray-500">{lead.phone}</td>
                <td className="py-3.5 px-3 text-gray-500">{SOURCE_LABELS[lead.source] || lead.source}</td>
                <td className="py-3.5 px-3">
                  <LeadStatusBadge status={lead.status} lastOutcome={lead.last_outcome} />
                </td>
                <td className="py-3.5 px-3">
                  {lead._isOwned ? (
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${AVATAR_COLORS[(lead.owner_name?.charCodeAt(0) ?? 89) % AVATAR_COLORS.length]}`}>
                        {lead.owner_name?.charAt(0) ?? 'Y'}
                      </div>
                      <span className="text-gray-700 text-sm">Tú</span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                      Sin asignar
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-3">
                  <ActionsDropdown
                    lead={lead}
                    isOwned={lead._isOwned}
                    isAdmin={isAdmin}
                    selfAssignEnabled={selfAssignEnabled}
                    onView={() => setViewLead(lead)}
                    onViewHistory={() => setHistoryLead(lead)}
                    onLogInteraction={() => setLogLead(lead)}
                    onChangeStatus={() => setStatusLead(lead)}
                    onRelease={() => setReleaseTarget(lead)}
                    onAssign={() => assignMutation.mutate(lead.id)}
                    onAdminReassign={() => setReassignTarget(lead)}
                    onConvert={() => setConvertTarget(lead)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </div>

      {/* Modals */}
      {viewLead && <ViewLeadModal lead={viewLead} onClose={() => setViewLead(null)} />}

      {historyLead && (
        <ViewHistoryModal lead={historyLead} onClose={() => setHistoryLead(null)} />
      )}

      {logLead && (
        <LogInteractionModal
          lead={logLead}
          onClose={() => setLogLead(null)}
          onSuccess={() => { flashLead(logLead.id); showToast('Interacción registrada correctamente.') }}
        />
      )}

      {convertTarget && (
        <ConvertLeadModal
          lead={convertTarget}
          onClose={() => setConvertTarget(null)}
          onSuccess={() => { flashLead(convertTarget.id); showToast(`${convertTarget.name} convertido correctamente.`) }}
        />
      )}

      {statusLead && (
        <UpdateStatusModal
          lead={statusLead}
          onClose={() => setStatusLead(null)}
          onSuccess={() => { flashLead(statusLead.id); showToast('Estado actualizado correctamente.') }}
        />
      )}

      {releaseTarget && (
        <ReleaseLeadModal
          lead={releaseTarget}
          isLoading={releaseMutation.isPending}
          onKeep={() => setReleaseTarget(null)}
          onRelease={() => releaseMutation.mutate(releaseTarget.id)}
        />
      )}

      {reassignTarget && (
        <AdminReassignModal
          lead={reassignTarget}
          isLoading={adminReassignMutation.isPending}
          onClose={() => setReassignTarget(null)}
          onSubmit={(ownerId) => adminReassignMutation.mutate({ id: reassignTarget.id, ownerId })}
        />
      )}

      {showCreate && (
        <CreateLeadModal
          onClose={() => setShowCreate(false)}
          onSubmit={(data, autoAssign) => { autoAssignRef.current = autoAssign; createMutation.mutate(data) }}
          isLoading={createMutation.isPending}
          canSelfAssign={selfAssignEnabled}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
