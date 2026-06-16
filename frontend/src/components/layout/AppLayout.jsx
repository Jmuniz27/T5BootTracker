import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../../store/auth.store'

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="sticky top-0 h-screen">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-8 gap-3 shrink-0">
          <div className="text-right">
            <p className="text-sm font-normal text-gray-900 leading-tight">
              {user?.full_name || user?.email || 'User'}
            </p>
            <span className="text-xs bg-[#213A8E] text-white px-2 py-0.5 rounded-full capitalize">
              {user?.role?.toLowerCase().replace('_', ' ') ?? 'Salesperson'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
            {user?.full_name?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase() ?? '?'}
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
