import ModalShell from './ModalShell'

export default function ConfirmToggleModal({ user, isPending, onConfirm, onClose }) {
  const deactivating = user.is_active

  let confirmLabel = deactivating ? 'Desactivar' : 'Reactivar'
  if (isPending) confirmLabel = 'Aplicando…'

  return (
    <ModalShell
      title={deactivating ? 'Desactivar usuario' : 'Reactivar usuario'}
      onClose={onClose}
      width="max-w-[440px]"
    >
      <p className="text-sm text-gray-600">
        {deactivating ? (
          <>
            <span className="font-semibold text-gray-900">{user.full_name}</span> no podrá volver a
            iniciar sesión hasta que lo reactives. Su historial se conserva.
          </>
        ) : (
          <>
            <span className="font-semibold text-gray-900">{user.full_name}</span> podrá volver a
            iniciar sesión con sus credenciales actuales.
          </>
        )}
      </p>

      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className={`px-4 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 ${
            deactivating ? 'bg-red-600 hover:bg-red-700' : 'bg-[#213A8E] hover:bg-[#1a2f72]'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}
