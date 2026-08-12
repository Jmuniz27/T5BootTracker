import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePrograms } from '../hooks/use-programs'
import { useCohorts } from '../hooks/use-cohorts'
import { updateCohort } from '../api/programs.api'
import CreateCohortModal from '../components/programs/CreateCohortModal'
import {
  COHORT_STATUS_BADGE,
  COHORT_STATUS_OPTIONS,
  formatMonth,
} from '../components/programs/cohortStatus'
import CustomSelect from '../components/CustomSelect'
import Toast from '../components/Toast'
import { errorMessage } from '../components/users/apiErrors'

function CohortCard({ cohort, onChangeStatus, isBusy }) {
  const { t } = useTranslation()
  const badge = COHORT_STATUS_BADGE[cohort.status] ?? COHORT_STATUS_BADGE.UPCOMING
  const statusOptions = COHORT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(`programs.cohortStatus.${o.value}`) }))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-gray-900">{t('programs.cohortNumber', { number: cohort.number })}</p>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${badge}`}>
          {cohort.status_label ?? t(`programs.cohortStatus.${cohort.status}`)}
        </span>
      </div>

      <dl className="space-y-1.5 mb-4">
        <div className="flex justify-between text-xs">
          <dt className="text-gray-400">{t('programs.start')}</dt>
          <dd className="text-gray-700 font-medium">{formatMonth(cohort.start_month)}</dd>
        </div>
        <div className="flex justify-between text-xs">
          <dt className="text-gray-400">{cohort.status === 'FINISHED' ? t('programs.endFinished') : t('programs.endExpected')}</dt>
          <dd className="text-gray-700 font-medium">{formatMonth(cohort.end_month)}</dd>
        </div>
      </dl>

      <div>
        <p className="text-xs text-gray-400 mb-1">{t('programs.changeStatus')}</p>
        <CustomSelect
          value={cohort.status}
          onChange={(status) => onChangeStatus(cohort, status)}
          options={statusOptions}
          placeholder={t('programs.status')}
          disabled={isBusy}
          ariaLabel={t('programs.cohortStatusAria', { number: cohort.number })}
        />
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-28 mb-4" />
      <div className="h-3 bg-gray-100 rounded w-full mb-2" />
      <div className="h-3 bg-gray-100 rounded w-2/3 mb-4" />
      <div className="h-9 bg-gray-100 rounded-xl" />
    </div>
  )
}

export default function ProgramDetailPage() {
  const { t } = useTranslation()
  const { programId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const filterOptions = [
    { value: '', label: t('programs.allStatuses') },
    ...COHORT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(`programs.cohortStatus.${o.value}`) })),
  ]

  const [statusFilter, setStatusFilter] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [toast, setToast] = useState(null)

  // El nombre y el costo salen de la lista ya cacheada; no hay endpoint de
  // detalle de programa y no hacía falta agregarlo sólo para el encabezado.
  const { data: programs = [], isLoading: loadingProgram } = usePrograms()
  const program = programs.find((p) => p.id === programId)

  const { data: cohorts = [], isLoading, isError } = useCohorts(programId, statusFilter)

  const mutation = useMutation({
    mutationFn: ({ cohort, status }) => updateCohort(programId, cohort.id, { status }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['cohorts', programId] })
      setToast({
        type: 'success',
        message: t('programs.cohortMarked', {
          number: updated.number,
          status: (updated.status_label ?? t(`programs.cohortStatus.${updated.status}`)).toLowerCase(),
        }),
      })
    },
    onError: (error) => {
      setToast({
        type: 'error',
        message: errorMessage(error, t('programs.cohortStatusError')),
      })
    },
  })

  // Sugerencia para el formulario: el número siguiente al mayor existente. Sólo
  // es una comodidad — el backend valida la unicidad de verdad.
  const suggestedNumber =
    cohorts.reduce((max, c) => Math.max(max, c.number), 0) + 1

  if (!loadingProgram && !program) {
    return (
      <div className="p-6 sm:p-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">{t('programs.notFound')}</p>
          <button
            onClick={() => navigate('/admin/programs')}
            className="mt-3 text-sm font-medium text-[#1D3176] hover:underline"
          >
            {t('programs.backToPrograms')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8">
      <button
        onClick={() => navigate('/admin/programs')}
        className="text-sm text-gray-500 hover:text-[#1D3176] transition-colors mb-4"
      >
        {t('programs.back')}
      </button>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{program?.name ?? t('programs.loading')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('programs.detailSubtitle')}
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          disabled={!program}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1D3176] text-white text-sm font-medium rounded-xl hover:bg-[#182861] transition-colors disabled:opacity-60"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('programs.newCohort')}
        </button>
      </header>

      <div className="mb-4 max-w-[240px]">
        <CustomSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={filterOptions}
          placeholder={t('programs.allStatuses')}
        />
      </div>

      {isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {t('programs.cohortsLoadError')}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isLoading && !isError && cohorts.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">
            {statusFilter
              ? t('programs.emptyStatusFilter')
              : t('programs.emptyCohorts')}
          </p>
        </div>
      )}

      {!isLoading && cohorts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cohorts.map((cohort) => (
            <CohortCard
              key={cohort.id}
              cohort={cohort}
              isBusy={mutation.isPending}
              onChangeStatus={(target, status) => mutation.mutate({ cohort: target, status })}
            />
          ))}
        </div>
      )}

      {isCreating && program && (
        <CreateCohortModal
          program={program}
          suggestedNumber={suggestedNumber}
          onClose={() => setIsCreating(false)}
          onSuccess={(message) => setToast({ type: 'success', message })}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
