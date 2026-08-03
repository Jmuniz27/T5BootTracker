import { COORDINATOR_SCOPE_LABELS, ROLE_BADGE_CLASSES, ROLE_LABELS } from './roles'

const COLUMNS = ['Usuario', 'Rol', 'Cédula', 'Estado', 'Acciones']

function SkeletonRow() {
  return (
    <tr>
      {COLUMNS.map((c) => (
        <td key={c} className="py-3.5 px-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
        ROLE_BADGE_CLASSES[role] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function StatusBadge({ isActive }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
        isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
      {isActive ? 'Activo' : 'Inactivo'}
    </span>
  )
}

export default function UsersTable({ users, isLoading, isError, currentUserId, onEdit, onToggle }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100">
            {COLUMNS.map((h) => (
              <th
                key={h}
                className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

          {!isLoading && !isError && users.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="text-center text-gray-500 py-10">
                No se encontraron usuarios.
              </td>
            </tr>
          )}

          {!isLoading &&
            !isError &&
            users.map((user) => {
              const isSelf = user.id === currentUserId
              return (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(user.full_name ?? user.email)}`}
                        alt=""
                        className="w-8 h-8 rounded-full bg-gray-100 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {user.full_name}
                          {isSelf && <span className="ml-2 text-xs text-gray-500 font-normal">(tú)</span>}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <RoleBadge role={user.role} />
                    {user.role === 'COORDINATOR' && (
                      <p className="text-xs text-gray-500 mt-1">
                        {/* Con varios programas se listan por nombre; el general
                            y el que no tiene alcance caen a la etiqueta. */}
                        {user.coordinator_program_names?.length
                          ? user.coordinator_program_names.join(', ')
                          : COORDINATOR_SCOPE_LABELS[user.coordinator_scope] ?? 'Sin alcance'}
                      </p>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-gray-600">{user.cedula || '—'}</td>
                  <td className="py-3.5 px-3">
                    <StatusBadge isActive={user.is_active} />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(user)}
                        className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onToggle(user)}
                        disabled={isSelf}
                        title={isSelf ? 'No puedes cambiar tu propio estado' : undefined}
                        className={`px-3 py-1.5 border text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          user.is_active
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {user.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
