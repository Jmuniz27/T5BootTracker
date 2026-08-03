import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateSelfAssignmentSetting } from '../../api/leads.api'

function formatUpdatedAt(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Control global de auto-asignación (CR-004). Solo se renderiza para el
 * Administrador — el backend igual rechaza el PATCH de cualquier otro rol.
 */
export default function SelfAssignmentToggle({ setting, isLoading, onResult }) {
  const queryClient = useQueryClient()
  const enabled = setting?.self_assign_enabled ?? false

  const mutation = useMutation({
    mutationFn: updateSelfAssignmentSetting,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['self-assignment-setting'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      onResult(
        updated.self_assign_enabled
          ? 'Auto-asignación habilitada. Los vendedores ya pueden asignarse leads.'
          : 'Auto-asignación deshabilitada. Solo el Administrador asigna leads.',
      )
    },
    onError: (error) => {
      onResult(
        error.response?.data?.error ?? 'No se pudo cambiar el control de auto-asignación.',
        'error',
      )
    },
  })

  const updatedAt = formatUpdatedAt(setting?.updated_at)
  const busy = isLoading || mutation.isPending

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">Auto-asignación de leads</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {enabled
            ? 'Los vendedores pueden asignarse leads disponibles por su cuenta.'
            : 'Solo el Administrador puede asignar leads. El botón “Asignarme” está deshabilitado.'}
        </p>
        {setting?.updated_by_name && updatedAt && (
          <p className="text-xs text-gray-500 mt-1">
            Último cambio: {setting.updated_by_name} · {updatedAt}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Auto-asignación de leads"
        disabled={busy}
        onClick={() => mutation.mutate(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-[#213A8E]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
