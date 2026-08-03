import { useLocation } from 'react-router-dom'

/**
 * Fade-in de la vista en cada cambio de ruta (CB-114).
 *
 * La `key` con el pathname fuerza a React a montar un nodo nuevo por ruta, con
 * lo que la animacion se vuelve a reproducir. Es un fade de entrada solamente:
 * animar tambien la salida obligaria a retener la vista anterior en el arbol y
 * a coordinar el desmontaje, y a 150-200ms la mejora no se percibe.
 *
 * `pointer-events` no se toca en ningun momento, asi que la vista es
 * interactuable desde el primer frame.
 */
export default function PageTransition({ children }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="animate-fade-in-up">
      {children}
    </div>
  )
}
