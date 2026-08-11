import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

export default function AuthLayout({ children, backTo, backLabel = 'Volver' }) {
  return (
    <div
      // Columna y no fila: bajo `lg` el logo entra al flujo como hermano de la
      // tarjeta. `py-10` es lo que evita que el centrado atrape el desborde —
      // un formulario alto (los 5 campos del onboarding) crece hacia abajo y el
      // documento scrollea, en vez de quedar recortado contra el borde.
      //
      // `auth-canvas` es el gancho del que cuelga el degradado, que vive en
      // index.css sobre el elemento raíz: aquí, en un div anidado, no llegaría
      // al lienzo y el rebote del scroll descubriría blanco.
      className="auth-canvas relative min-h-screen overflow-hidden flex flex-col items-center justify-center gap-8 px-5 py-10 sm:px-8"
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(59,99,214,0.35) 0%, transparent 65%)',
        }}
      />

      {/* Logo: en el flujo hasta `lg`, flotando arriba a la izquierda desde ahí.
          Absoluto en pantallas chicas se superponía al formulario, porque nada
          reservaba su espacio. El corte es `lg` y no `sm` porque a 640px la
          tarjeta (x=96..544) todavía cruza la caja del logo (x=40..162). */}
      <div className="relative z-10 flex items-center gap-3 lg:absolute lg:top-8 lg:left-10">
        <img src={logo} alt="Coding Bootcamps ESPOL" className="w-10 h-10 object-contain" />
        <div className="text-white text-xs font-semibold leading-tight opacity-80">
          CODING<br />BOOTCAMPS<br /><span className="text-[10px] tracking-widest">espol</span>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {backTo && (
          <Link
            to={backTo}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-8 transition-colors w-fit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {backLabel}
          </Link>
        )}

        {children}
      </div>
    </div>
  );
}
