import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUsers, toggleUserActive } from '../api/users.api'
import { useAuthStore } from '../store/auth.store'
import Toast from '../components/Toast'
import CustomSelect from '../components/CustomSelect'
import StatCard from '../components/StatCard'
import UsersTable from '../components/users/UsersTable'
import CreateUserModal from '../components/users/CreateUserModal'
import EditUserModal from '../components/users/EditUserModal'
import ConfirmToggleModal from '../components/users/ConfirmToggleModal'
import { ROLE_OPTIONS } from '../components/users/roles'
import { errorMessage } from '../components/users/apiErrors'

const ROLE_FILTER_OPTIONS = [{ value: 'ALL', label: 'Todos los roles' }, ...ROLE_OPTIONS]

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'INACTIVE', label: 'Inactivos' },
]

function matchesSearch(user, term) {
  if (!term) return true
  const haystack = `${user.full_name ?? ''} ${user.email ?? ''} ${user.cedula ?? ''}`.toLowerCase()
  return haystack.includes(term)
}

function matchesStatus(user, statusFilter) {
  if (statusFilter === 'ACTIVE') return user.is_active
  if (statusFilter === 'INACTIVE') return !user.is_active
  return true
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [toggleTarget, setToggleTarget] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => setToast({ message, type })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers(),
  })

  const users = useMemo(() => data?.results ?? data ?? [], [data])

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter(
      (u) =>
        matchesSearch(u, term) &&
        (roleFilter === 'ALL' || u.role === roleFilter) &&
        matchesStatus(u, statusFilter),
    )
  }, [users, search, roleFilter, statusFilter])

  const activeCount = users.filter((u) => u.is_active).length
  const adminCount = users.filter((u) => u.role === 'ADMINISTRATOR').length

  const toggleMutation = useMutation({
    mutationFn: (user) => toggleUserActive(user.id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setToggleTarget(null)
      showToast(
        updated.is_active
          ? `${updated.full_name} fue reactivado.`
          : `${updated.full_name} fue desactivado.`,
      )
    },
    onError: (error) => {
      setToggleTarget(null)
      showToast(errorMessage(error, 'No se pudo cambiar el estado del usuario.'), 'error')
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de usuarios</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6 lg:mb-8">
        <StatCard label="Total usuarios" value={users.length} loading={isLoading} />
        <StatCard label="Activos" value={activeCount} loading={isLoading} />
        <StatCard label="Administradores" value={adminCount} loading={isLoading} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Usuarios</h2>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5">
          <div className="flex-1 min-w-[200px] relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre, email o cédula"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <CustomSelect value={roleFilter} onChange={setRoleFilter} options={ROLE_FILTER_OPTIONS} />
          <CustomSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
        </div>

        {isError && (
          <p className="text-center text-red-500 py-8 text-sm">
            No se pudieron cargar los usuarios. Verifica tu conexión y vuelve a intentar.
          </p>
        )}

        <UsersTable
          users={filteredUsers}
          isLoading={isLoading}
          isError={isError}
          currentUserId={currentUserId}
          onEdit={setEditTarget}
          onToggle={setToggleTarget}
        />
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => showToast(msg)}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(msg) => showToast(msg)}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {toggleTarget && (
        <ConfirmToggleModal
          user={toggleTarget}
          isPending={toggleMutation.isPending}
          onConfirm={() => toggleMutation.mutate(toggleTarget)}
          onClose={() => setToggleTarget(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
