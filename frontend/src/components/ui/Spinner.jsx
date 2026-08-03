/**
 * Indicador de progreso para botones en estado pendiente (CB-114).
 * aria-hidden porque el texto del boton ya cambia a "Guardando...", que es lo
 * que anuncia el lector de pantalla.
 */
export default function Spinner({ className = 'w-4 h-4' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block border-2 border-current border-t-transparent rounded-full animate-spin ${className}`}
    />
  )
}
