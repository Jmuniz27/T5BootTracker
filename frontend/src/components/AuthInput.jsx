import { forwardRef } from 'react';

const AuthInput = forwardRef(function AuthInput(
  { icon, endAdornment, error, className = '', ...props },
  ref
) {
  return (
    <div>
      <div className="relative">
        {icon && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          // `text-base` (16px) y no `text-sm`: Safari en iOS hace zoom solo al
          // enfocar un campo de menos de 16px y no vuelve atrás, así que el
          // usuario terminaba de activar su cuenta con la página ampliada. No
          // hay forma de desactivarlo por CSS, y fijar `maximum-scale=1` en el
          // viewport lo ignoran los iOS modernos (y rompe accesibilidad).
          className={`w-full rounded-full px-5 py-3.5 text-base text-white placeholder-white/30 outline-none transition ${icon ? 'pl-12' : ''} ${endAdornment ? 'pr-12' : ''} ${className}`}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(91,155,213,0.6)'; props.onFocus?.(e); }}
          onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; props.onBlur?.(e); }}
          {...props}
        />
        {endAdornment}
      </div>
      {error && <p className="text-red-400 text-xs mt-1.5 pl-4">{error}</p>}
    </div>
  );
});

export default AuthInput;

export const EmailIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

export const LockIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);
