import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ROLE_BADGE_CLASSES } from './roles'

const COLUMN_KEYS = ['colUser', 'colRole', 'colCedula', 'colStatus', 'colActions']

/**
 * Programa y cohorte del bootcamper (#328).
 *
 * Se listan todas sus inscripciones en vez de elegir una: quien cursa dos
 * programas los cursa de verdad, y quedarse con el primero escondería el otro.
 *
 * "Cambiar" por fila (CB-347): antes no había forma de asignar la cohorte de
 * una inscripción sin cohorte, ni de corregirla si se asignó mal — sólo se
 * fijaba una vez, al convertir el lead.
 */
function EnrollmentLines({ enrollments, onChangeCohort }) {
  const { t } = useTranslation()
  if (!enrollments?.length) {
    return <p className="text-xs text-gray-400 mt-1">{t('users.table.noEnrollment')}</p>
  }

  return (
    <div className="mt-1 space-y-0.5">
      {enrollments.map((e) => (
        <p key={e.enrollment_id} className="text-xs text-gray-500 truncate">
          {e.program_name}
          {e.cohort_number != null
            ? <span className="text-gray-400"> · {t('users.cohortNumber', { number: e.cohort_number })}</span>
            : <span className="text-gray-400"> · {t('users.table.noCohort')}</span>}
          {' '}
          <button
            type="button"
            onClick={() => onChangeCohort(e)}
            className="text-[#213A8E] hover:underline font-medium"
          >
            {t('users.table.change')}
          </button>
        </p>
      ))}
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {COLUMN_KEYS.map((c) => (
        <td key={c} className="py-3.5 px-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

function RoleBadge({ role }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
        ROLE_BADGE_CLASSES[role] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {t(`users.roles.${role}`, role)}
    </span>
  )
}

function StatusBadge({ isActive }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
        isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
      {isActive ? t('users.table.active') : t('users.table.inactive')}
    </span>
  )
}

/**
 * Menú de acciones por fila, igual al de LeadsDashboard (ActionsDropdown):
 * un botón con chevron que abre un menú flotante, con lógica para abrirse
 * hacia arriba si no hay espacio debajo. Antes eran dos botones sueltos
 * ("Editar" / "Desactivar") — se agrupan acá para que la columna Acciones
 * sea consistente con el resto de la app.
 */
function UserActionsDropdown({ user, isSelf, onEdit, onToggle }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        (!menuRef.current || !menuRef.current.contains(e.target))
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const upward = window.innerHeight - rect.bottom < 140
      setOpenUpward(upward)
      setPos({
        top: upward ? rect.top - 4 : rect.bottom + 4,
        left: rect.right - 160,
      })
    }
    setOpen((v) => !v)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        aria-label={t('users.table.menuAria', { name: user.full_name })}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#213A8E] text-white hover:bg-[#1a2f72] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('users.table.menuAria', { name: user.full_name })}
          className={`fixed w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 ${openUpward ? '-translate-y-full' : ''}`}
          style={{ top: pos.top, left: pos.left }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { onEdit(user); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('users.table.edit')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onToggle(user); setOpen(false) }}
            disabled={isSelf}
            title={isSelf ? t('users.table.cantToggleSelf') : undefined}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:hover:bg-transparent disabled:opacity-40 disabled:cursor-not-allowed ${
              user.is_active ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {user.is_active ? t('users.table.deactivate') : t('users.table.activate')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function UsersTable({ users, isLoading, isError, currentUserId, onEdit, onToggle, onChangeCohort }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100">
            {COLUMN_KEYS.map((key) => (
              <th
                key={key}
                className="text-left py-3 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide"
              >
                {t(`users.table.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

          {!isLoading && !isError && users.length === 0 && (
            <tr>
              <td colSpan={COLUMN_KEYS.length} className="text-center text-gray-500 py-10">
                {t('users.table.empty')}
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
                          {isSelf && <span className="ml-2 text-xs text-gray-500 font-normal">{t('users.table.you')}</span>}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <RoleBadge role={user.role} />
                    {user.role === 'BOOTCAMPER' && (
                      <EnrollmentLines
                        enrollments={user.enrollments}
                        onChangeCohort={(enrollment) => onChangeCohort(user, enrollment)}
                      />
                    )}
                    {user.role === 'COORDINATOR' && (
                      <p className="text-xs text-gray-500 mt-1">
                        {/* Con varios programas se listan por nombre; el general
                            y el que no tiene alcance caen a la etiqueta. */}
                        {user.coordinator_program_names?.length
                          ? user.coordinator_program_names.join(', ')
                          : (user.coordinator_scope ? t(`users.scope.${user.coordinator_scope}`, t('users.table.noScope')) : t('users.table.noScope'))}
                      </p>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-gray-600">{user.cedula || '—'}</td>
                  <td className="py-3.5 px-3">
                    <StatusBadge isActive={user.is_active} />
                  </td>
                  <td className="py-3.5 px-3">
                    <UserActionsDropdown
                      user={user}
                      isSelf={isSelf}
                      onEdit={onEdit}
                      onToggle={onToggle}
                    />
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
