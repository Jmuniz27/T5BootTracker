import { useCallback, useEffect, useRef, useState } from 'react'

export const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2 h (HST-003)
export const IDLE_WARNING_MS = 2 * 60 * 1000 // avisar 2 min antes

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']

/**
 * Expira la sesión tras 2 horas de inactividad (HST-003).
 *
 * Cualquier actividad del usuario reinicia el temporizador. Dos minutos antes
 * del corte expone `showWarning` para avisar; si no hay actividad, ejecuta
 * `onTimeout`.
 */
export function useIdleTimeout({
  onTimeout,
  timeoutMs = IDLE_TIMEOUT_MS,
  warningMs = IDLE_WARNING_MS,
  enabled = true,
}) {
  const [showWarning, setShowWarning] = useState(false)
  const timeoutRef = useRef(null)
  const warningRef = useRef(null)
  // En un ref para no reprogramar los timers en cada render del padre.
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

  const clearTimers = useCallback(() => {
    clearTimeout(timeoutRef.current)
    clearTimeout(warningRef.current)
  }, [])

  const resetTimer = useCallback(() => {
    clearTimers()
    setShowWarning(false)
    if (!enabled) return

    warningRef.current = setTimeout(
      () => setShowWarning(true),
      Math.max(timeoutMs - warningMs, 0),
    )
    timeoutRef.current = setTimeout(() => {
      setShowWarning(false)
      onTimeoutRef.current?.()
    }, timeoutMs)
  }, [clearTimers, enabled, timeoutMs, warningMs])

  useEffect(() => {
    if (!enabled) {
      clearTimers()
      return undefined
    }

    resetTimer()
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true }),
    )

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
    }
  }, [clearTimers, enabled, resetTimer])

  return { showWarning, resetTimer }
}
