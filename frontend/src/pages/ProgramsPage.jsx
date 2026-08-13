import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { usePrograms } from '../hooks/use-programs'
import CreateProgramModal from '../components/programs/CreateProgramModal'
import Toast from '../components/Toast'

function fmtMoney(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ProgramCard({ program, onClick }) {
  const { t } = useTranslation()
  const cohorts = program.cohort_count ?? 0

  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:shadow-md hover:border-[#1D3176]/30 transition-all w-full group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-gray-900 group-hover:text-[#1D3176] transition-colors">
          {program.name}
        </p>
        {!program.is_active && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 flex-shrink-0">
            {t('programs.inactive')}
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-gray-900 leading-tight">
        {cohorts}
        <span className="text-sm font-medium text-gray-400 ml-1.5">
          {t('programs.cohorts', { count: cohorts })}
        </span>
      </p>

      <p className="text-xs text-gray-400 mt-3">{t('programs.programCost', { amount: fmtMoney(program.total_cost) })}</p>
    </button>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
      <div className="h-7 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-32" />
    </div>
  )
}

export default function ProgramsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [toast, setToast] = useState(null)

  const { data: programs = [], isLoading, isError } = usePrograms()

  return (
    <div className="p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('programs.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('programs.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1D3176] text-white text-sm font-medium rounded-xl hover:bg-[#182861] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('programs.newProgram')}
        </button>
      </header>

      {isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {t('programs.loadError')}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isLoading && !isError && programs.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">{t('programs.emptyPrograms')}</p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-3 text-sm font-medium text-[#1D3176] hover:underline"
          >
            {t('programs.createFirst')}
          </button>
        </div>
      )}

      {!isLoading && programs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              onClick={() => navigate(`/admin/programs/${program.id}`)}
            />
          ))}
        </div>
      )}

      {isCreating && (
        <CreateProgramModal
          onClose={() => setIsCreating(false)}
          onSuccess={(message) => setToast({ type: 'success', message })}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
