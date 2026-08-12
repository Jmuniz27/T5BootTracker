import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCohorts } from '../../api/programs.api'
import { updateEnrollmentCohort } from '../../api/users.api'
import CustomSelect from '../CustomSelect'
import ModalShell from './ModalShell'
import { errorMessage } from './apiErrors'

const NO_COHORT = ''

function formatMonth(value) {
  if (!value) return ''
  const [year, month] = value.split('-')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-EC', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Asignar o cambiar la cohorte de una inscripción de un bootcamper (CB-347).
 *
 * Hasta ahora la cohorte sólo se fijaba una vez, al convertir el lead: no
 * había forma de completarla si el programa no tenía cohortes creadas
 * todavía, ni de corregirla si se asignó mal. Cualquiera de staff (menos
 * Coordinador) puede hacer el cambio — el backend es quien decide eso
 * (IsStaffNotCoordinator), acá sólo se refleja.
 *
 * Se filtra a cohortes próximas o en curso, igual que el selector de
 * conversión en LeadsDashboard: es la misma regla de
 * `resolve_assignable_cohort`, y no tiene sentido ofrecer algo que el
 * backend va a rechazar.
 */
export default function ChangeCohortModal({ bootcamper, enrollment, onClose, onSuccess, onError }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [cohortId, setCohortId] = useState(enrollment.cohort_id ?? NO_COHORT)

  const { data: cohorts = [], isLoading: loadingCohorts } = useQuery({
    queryKey: ['cohorts', enrollment.program_id],
    queryFn: () => getCohorts(enrollment.program_id),
  })

  // La cohorte actual puede estar finalizada (ej. si el bootcamper ya venía de
  // una edición cerrada) — se sigue ofreciendo para no esconder el valor
  // vigente, aunque no aparezca entre las asignables si se quiere cambiar.
  const assignableCohorts = cohorts.filter(
    (c) => c.status === 'UPCOMING' || c.status === 'IN_PROGRESS' || c.id === enrollment.cohort_id,
  )

  useEffect(() => {
    setCohortId(enrollment.cohort_id ?? NO_COHORT)
  }, [enrollment.cohort_id])

  const mutation = useMutation({
    mutationFn: () =>
      updateEnrollmentCohort(bootcamper.id, enrollment.enrollment_id, cohortId || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onSuccess(t('users.modals.cohortUpdated', { name: bootcamper.full_name }))
      onClose()
    },
    onError: (error) => {
      onError(errorMessage(error, t('users.modals.cohortError')))
    },
  })

  const hasChanged = cohortId !== (enrollment.cohort_id ?? NO_COHORT)

  return (
    <ModalShell
      title={t('users.modals.changeCohortTitle')}
      subtitle={t('users.modals.changeCohortSubtitle', { name: bootcamper.full_name, program: enrollment.program_name })}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.modals.cohortLabel')}</label>
          {loadingCohorts && <p className="text-sm text-gray-400">{t('users.modals.loadingCohorts')}</p>}
          {!loadingCohorts && (
            <CustomSelect
              testId="change-cohort-select"
              value={cohortId}
              onChange={setCohortId}
              placeholder={t('users.modals.noCohort')}
              options={[
                { value: NO_COHORT, label: t('users.modals.noCohort') },
                ...assignableCohorts.map((c) => ({
                  value: c.id,
                  label: t('users.modals.cohortOption', { number: c.number, status: c.status_label, month: formatMonth(c.start_month) }),
                })),
              ]}
            />
          )}
          {!loadingCohorts && assignableCohorts.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {t('users.modals.noCohorts')}
            </p>
          )}
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-500">
            {errorMessage(mutation.error, t('users.modals.cohortError'))}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            {t('users.modals.cancel')}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !hasChanged}
            className="px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? t('users.modals.saving') : t('users.modals.saveChanges')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
