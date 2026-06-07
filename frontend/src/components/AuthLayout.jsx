import { Link } from 'react-router-dom';

function BootTrackerLogo() {
  return (
    <div className="flex justify-center mb-5">
      <div className="inline-flex items-center gap-3 border-2 border-secondary rounded-xl px-4 py-2.5">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="font-extrabold text-primary text-sm tracking-widest uppercase">
            Boot-Tracker
          </div>
          <div className="text-[10px] text-gray-400 tracking-widest uppercase">
            Coding Bootcamps |{' '}
            <span className="text-red-500 font-bold">espol</span>
          </div>
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
              className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4 transition-colors"
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
