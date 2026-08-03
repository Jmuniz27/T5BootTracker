/**
 * Placeholder de carga (CB-114).
 *
 * Sustituye a los `animate-pulse` sueltos que se repetian en cada pagina y
 * agrega un barrido de brillo, que se lee como "cargando" mejor que un pulso.
 * Marcado como aria-hidden: quien anuncia la carga es el contenedor con
 * aria-busy, no cada barra gris.
 */
export default function Skeleton({ className = '', rounded = 'rounded-lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`relative block overflow-hidden bg-gray-200/80 ${rounded} ${className}`}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </span>
  )
}
