import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUsers, toggleUserActive } from '../api/users.api'
import { getSelfAssignmentSetting } from '../api/leads.api'
import { useAuthStore } from '../store/auth.store'
import Toast from '../components/Toast'
import CustomSelect from '../components/CustomSelect'
import StatCard from '../components/StatCard'
import UsersTable from '../components/users/UsersTable'
import CreateUserModal from '../components/users/CreateUserModal'
import EditUserModal from '../components/users/EditUserModal'
import ConfirmToggleModal from '../components/users/ConfirmToggleModal'
import ChangeCohortModal from '../components/users/ChangeCohortModal'
import SelfAssignmentToggle from '../components/leads/SelfAssignmentToggle'
import { ROLE_OPTIONS } from '../components/users/roles'
import { errorMessage } from '../components/users/apiErrors'

// El staff administrativo (roles que se gestionan activamente) vive separado
// de los bootcampers: estos últimos suelen llegar por conversión de leads y
// hoy inundaban la misma tabla, tapando al resto.
const STAFF_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => r.value !== 'BOOTCAMPER')

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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const ROLE_FILTER_OPTIONS = [
    { value: 'ALL', label: t('users.allRoles') },
    ...STAFF_ROLE_OPTIONS.map((r) => ({ value: r.value, label: t(`users.roles.${r.value}`) })),
  ]
  const STATUS_FILTER_OPTIONS = [
    { value: 'ALL', label: t('users.allStatuses') },
    { value: 'ACTIVE', label: t('users.active') },
    { value: 'INACTIVE', label: t('users.inactive') },
  ]

  const [activeTab, setActiveTab] = useState('staff') // 'staff' | 'bootcampers'
  // #328: la clienta agrupa a los bootcampers por programa y cohorte.
  const [programFilter, setProgramFilter] = useState('')
  const [cohortFilter, setCohortFilter] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [toggleTarget, setToggleTarget] = useState(null)
  const [cohortTarget, setCohortTarget] = useState(null) // { bootcamper, enrollment }
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => setToast({ message, type })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers(),
  })

  // Control global de auto-asignación (CR-004) — vive acá y no en el
  // dashboard de leads porque es un ajuste de usuarios/roles, no del flujo
  // de trabajo diario del vendedor.
  const { data: selfAssignSetting, isLoading: loadingSelfAssign } = useQuery({
    queryKey: ['self-assignment-setting'],
    queryFn: getSelfAssignmentSetting,
  })

  const users = useMemo(() => data?.results ?? data ?? [], [data])

  const staffUsers       = useMemo(() => users.filter((u) => u.role !== 'BOOTCAMPER'), [users])
  const bootcamperUsers  = useMemo(() => users.filter((u) => u.role === 'BOOTCAMPER'), [users])
  const tabUsers = activeTab === 'staff' ? staffUsers : bootcamperUsers

  // Las opciones salen de lo que hay en pantalla: ofrecer un programa sin nadie
  // inscrito sólo lleva a una tabla vacía.
  const programOptions = useMemo(() => {
    const porId = new Map()
    bootcamperUsers.forEach((u) => {
      (u.enrollments ?? []).forEach((e) => porId.set(e.program_id, e.program_name))
    })
    return [...porId.entries()].map(([value, label]) => ({ value, label }))
  }, [bootcamperUsers])

  // La cohorte depende del programa, igual que en la pantalla de Pagos: fuera de
  // su programa el número de cohorte no identifica nada.
  const cohortOptions = useMemo(() => {
    if (!programFilter) return []
    const porId = new Map()
    bootcamperUsers.forEach((u) => {
      (u.enrollments ?? [])
        .filter((e) => e.program_id === programFilter && e.cohort_id)
        .forEach((e) => porId.set(e.cohort_id, t('users.cohortNumber', { number: e.cohort_number })))
    })
    return [...porId.entries()].map(([value, label]) => ({ value, label }))
  }, [bootcamperUsers, programFilter, t])

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matchesEnrollment = (user) => {
      if (!programFilter) return true
      return (user.enrollments ?? []).some(
        (e) => e.program_id === programFilter && (!cohortFilter || e.cohort_id === cohortFilter),
      )
    }
    return tabUsers.filter(
      (u) =>
        matchesSearch(u, term) &&
        (activeTab === 'bootcampers' || roleFilter === 'ALL' || u.role === roleFilter) &&
        matchesStatus(u, statusFilter) &&
        // Los filtros de inscripción sólo aplican a bootcampers: en la pestaña
        // de administrativos no significan nada.
        (activeTab !== 'bootcampers' || matchesEnrollment(u)),
    )
  }, [tabUsers, activeTab, search, roleFilter, statusFilter, programFilter, cohortFilter])

  const activeCount = tabUsers.filter((u) => u.is_active).length
  const adminCount  = staffUsers.filter((u) => u.role === 'ADMINISTRATOR').length

  const toggleMutation = useMutation({
    mutationFn: (user) => toggleUserActive(user.id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setToggleTarget(null)
      showToast(
        updated.is_active
          ? t('users.reactivated', { name: updated.full_name })
          : t('users.deactivated', { name: updated.full_name }),
      )
    },
    onError: (error) => {
      setToggleTarget(null)
      showToast(errorMessage(error, t('users.toggleError')), 'error')
    },
  })

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('users.title')}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('users.newUser')}
        </button>
      </div>

      <SelfAssignmentToggle
        setting={selfAssignSetting}
        isLoading={loadingSelfAssign}
        onResult={showToast}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6 lg:mb-8">
        <StatCard label={t('users.totalUsers')} value={tabUsers.length} loading={isLoading} />
        <StatCard label={t('users.activeCount')} value={activeCount} loading={isLoading} />
        {activeTab === 'staff' ? (
          <StatCard label={t('users.admins')} value={adminCount} loading={isLoading} />
        ) : (
          <StatCard label={t('users.inactiveCount')} value={tabUsers.length - activeCount} loading={isLoading} />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">{t('users.tableTitle')}</h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            data-testid="tab-staff"
            onClick={() => { setActiveTab('staff'); setRoleFilter('ALL') }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'staff'
                ? 'bg-[#213A8E] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('users.tabStaff', { count: staffUsers.length })}
          </button>
          <button
            data-testid="tab-bootcampers"
            onClick={() => { setActiveTab('bootcampers'); setRoleFilter('ALL') }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'bootcampers'
                ? 'bg-[#213A8E] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('users.tabBootcampers', { count: bootcamperUsers.length })}
          </button>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5">
          <div className="flex-1 min-w-[200px] relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t('users.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          {activeTab === 'staff' && (
            <CustomSelect value={roleFilter} onChange={setRoleFilter} options={ROLE_FILTER_OPTIONS} />
          )}
          {activeTab === 'bootcampers' && programOptions.length > 0 && (
            <CustomSelect
              value={programFilter}
              onChange={(value) => { setProgramFilter(value); setCohortFilter('') }}
              options={[{ value: '', label: t('users.allPrograms') }, ...programOptions]}
              placeholder={t('users.allPrograms')}
              ariaLabel={t('users.filterByProgram')}
            />
          )}
          {activeTab === 'bootcampers' && programFilter && cohortOptions.length > 0 && (
            <CustomSelect
              value={cohortFilter}
              onChange={setCohortFilter}
              options={[{ value: '', label: t('users.allCohorts') }, ...cohortOptions]}
              placeholder={t('users.allCohorts')}
              ariaLabel={t('users.filterByCohort')}
            />
          )}
          <CustomSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
        </div>

        {isError && (
          <p className="text-center text-red-500 py-8 text-sm">
            {t('users.loadError')}
          </p>
        )}

        <UsersTable
          users={filteredUsers}
          isLoading={isLoading}
          isError={isError}
          currentUserId={currentUserId}
          onEdit={setEditTarget}
          onToggle={setToggleTarget}
          onChangeCohort={(bootcamper, enrollment) => setCohortTarget({ bootcamper, enrollment })}
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

      {cohortTarget && (
        <ChangeCohortModal
          bootcamper={cohortTarget.bootcamper}
          enrollment={cohortTarget.enrollment}
          onClose={() => setCohortTarget(null)}
          onSuccess={(msg) => showToast(msg)}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
