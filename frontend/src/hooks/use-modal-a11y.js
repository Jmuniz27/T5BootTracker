import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Comportamiento de accesibilidad compartido por todos los dialogos modales
 * (CB-75). Centraliza lo que antes cada modal implementaba a medias o no
 * implementaba:
 *
 *   - Escape cierra el dialogo.
 *   - El foco entra al dialogo al montarse y queda confinado dentro mientras
 *     esta abierto (patron APG "Modal Dialog").
 *   - Al cerrarse, el foco vuelve al elemento que lo abrio (WCAG 2.4.3).
 *   - El scroll del body se bloquea, para que la pagina de atras no se
 *     desplace bajo el overlay.
 *
 * Devuelve la ref que hay que colocar en el contenedor con role="dialog".
 * Ese contenedor debe llevar tabIndex={-1} para poder recibir el foco inicial
 * cuando todavia no hay ningun elemento enfocable dentro (p. ej. mientras carga).
 */
export function useModalA11y(onClose) {
  const containerRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const getFocusable = () => {
      const node = containerRef.current
      if (!node) return []
      return Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR))
    }

    // Foco inicial: primer elemento enfocable, o el propio dialogo.
    const initial = getFocusable()[0] ?? containerRef.current
    initial?.focus?.()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !containerRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return containerRef
}
