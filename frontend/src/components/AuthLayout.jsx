import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

export default function AuthLayout({ children, backTo, backLabel = 'Volver' }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1a2f6e 0%, #0d1b4b 60%, #091336 100%)' }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(59,99,214,0.35) 0%, transparent 65%)',
        }}
      />

      {/* Logo top-left */}
      <div className="absolute top-8 left-10 z-10 flex items-center gap-3">
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
