/**
 * Aviso previo a la expiración de sesión por inactividad (HST-003).
 * Cualquier interacción reinicia el temporizador; el botón es un atajo explícito.
 */
export default function SessionTimeoutWarning({ onStayConnected }) {
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-amber-900">Tu sesión está por expirar</p>
      <p className="mt-1 text-sm text-amber-800">
        Por seguridad cerraremos la sesión en unos minutos si no hay actividad.
      </p>
      <button
        type="button"
        onClick={onStayConnected}
        className="mt-3 rounded-xl bg-[#213A8E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1a2e71]"
      >
        Seguir conectado
      </button>
    </div>
  )
}
