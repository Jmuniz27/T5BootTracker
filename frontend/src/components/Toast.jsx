import { useEffect, useRef } from 'react'

const AUTO_DISMISS_MS = 4000

export default function Toast({ message, type = 'success', onClose }) {
  const isError = type === 'error'
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // CB-75: el temporizador depende solo del montaje. Antes dependia de `onClose`,
  // asi que cualquier padre que pasara una arrow inline reiniciaba los 4s en cada
  // render y el toast podia no cerrarse nunca.
  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current?.(), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      // Los errores interrumpen (assertive); los exitos se anuncian al terminar
      // lo que el lector de pantalla este leyendo (polite).
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      // Sin ancho acotado, un mensaje largo se dibuja como una barra de ~700px
      // anclada a la derecha: en un teléfono queda casi toda fuera de pantalla
      // por la izquierda. `sm:w-auto` devuelve la geometría de escritorio.
      className="fixed top-4 right-4 z-[70] w-[min(calc(100vw-2rem),24rem)] sm:top-5 sm:right-5 sm:w-auto sm:max-w-md flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg animate-slide-in-right"
    >
      <span className={`flex shrink-0 items-center justify-center w-6 h-6 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`}>
        {isError ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium break-words">{message}</span>
      <button
        onClick={onClose}
        aria-label="Cerrar notificación"
        className="shrink-0 text-gray-300 hover:text-white ml-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
