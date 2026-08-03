import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

function BootTrackerLogo() {
  return (
    <div className="flex justify-center mb-5">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
          <img src={logo} alt="Boot-Tracker logo" className="w-11 h-11 object-contain" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="bg-primary rounded px-3 py-2">
            <span className="font-extrabold text-white text-sm tracking-widest uppercase">
              Boot-Tracker
            </span>
          </div>
          <span className="text-[11px] text-primary font-medium text-center">
            Coding Bootcamps ESPOL
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ children, backTo, backLabel = 'Back' }) {
  return (
    <div className="min-h-screen bg-auth-bg flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg ring-1 ring-secondary/20">
        <div className="px-10 pt-10 pb-12">
          <BootTrackerLogo />

          {backTo && (
            <Link
              to={backTo}
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
            >
              ← {backLabel}
            </Link>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
