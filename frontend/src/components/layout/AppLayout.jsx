import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import SessionTimeoutWarning from '../SessionTimeoutWarning'
import PageTransition from '../ui/PageTransition'
import { useIdleTimeout } from '../../hooks/use-idle-timeout'
import { forceLogout } from '../../api/client'
import { useAuthStore } from '../../store/auth.store'

const AVATAR_COLORS = [
  'bg-[#213A8E]',
  'bg-violet-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-600',
  'bg-pink-500',
  'bg-indigo-500',
]

export default function AppLayout() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const name = user?.full_name || user?.email || '?'
  const avatarColor = AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // HST-003: se monta una sola vez para toda el área autenticada.
  const { showWarning, resetTimer } = useIdleTimeout({ onTimeout: forceLogout })

  return (
    <div className="flex h-screen bg-gray-50">
      {showWarning && <SessionTimeoutWarning onStayConnected={resetTimer} />}
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/40 z-30 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: drawer on mobile, static on lg+.
          CB-75: cerrado en mobile se ocultaba solo con translate, asi que sus
          enlaces seguian en el orden de tabulacion y el teclado entraba a un
          menu invisible. `invisible` los saca del arbol de foco y `lg:visible`
          lo restituye en desktop, donde el sidebar siempre esta a la vista. */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-[transform,visibility] duration-200 ease-in-out lg:static lg:translate-x-0 lg:z-auto lg:visible ${
          sidebarOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213A8E]"
            aria-label={t('common.openMenu')}
            aria-expanded={sidebarOpen}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-normal text-gray-900 leading-tight">
                {user?.full_name || user?.email || 'User'}
              </p>
              <span className="text-xs bg-blue-100 text-[#213A8E] font-semibold px-2 py-0.5 rounded-full capitalize">
                {user?.role?.toLowerCase().replace('_', ' ') ?? 'Salesperson'}
              </span>
            </div>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatarColor}`}>
              {name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  )
}
