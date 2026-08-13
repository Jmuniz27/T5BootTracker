import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCohort } from '../../api/programs.api'
import CustomSelect from '../CustomSelect'
import ModalShell from '../users/ModalShell'
import { applyServerErrors } from '../users/apiErrors'
import {
  COHORT_STATUS_OPTIONS,
  currentMonthValue,
  monthInputToDate,
} from './cohortStatus'

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200'

const COHORT_FIELDS = ['number', 'start_month', 'status']

function buildSchema(t) {
  return z.object({
    number: z
      .string()
      .min(1, t('programs.validation.numberRequired'))
      .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, t('programs.validation.numberMin')),
    start_month: z.string().min(1, t('programs.validation.startMonthRequired')),
    end_month: z.string().min(1, t('programs.validation.expectedEndRequired')),
    status: z.string().min(1, t('programs.validation.statusRequired')),
  })
    // Misma regla que CohortWriteSerializer.validate en el backend.
    .refine((v) => !v.start_month || !v.end_month || v.end_month >= v.start_month, {
      path: ['end_month'],
      message: t('programs.validation.endMonthBeforeStart'),
    })
}

/** `htmlFor` asocia la etiqueta con su input, para lectores de pantalla. */
function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        <span className="text-red-500"> *</span>
        {hint && <span className="text-xs text-gray-400 font-normal"> ({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

export default function CreateCohortModal({ program, suggestedNumber, onClose, onSuccess, onError }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildSchema(t), [t])
  const statusOptions = COHORT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(`programs.cohortStatus.${o.value}`) }))
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      number: String(suggestedNumber ?? 1),
      start_month: currentMonthValue(),
      // Tres meses por delante: es sólo un punto de partida editable.
      end_month: currentMonthValue(3),
      status: 'UPCOMING',
    },
  })

  const mutation = useMutation({
    mutationFn: (data) => createCohort(program.id, data),
    onSuccess: (cohort) => {
      queryClient.invalidateQueries({ queryKey: ['cohorts', program.id] })
      queryClient.invalidateQueries({ queryKey: ['programs'] })
      onSuccess(t('programs.cohortCreated', { number: cohort.number }))
      onClose()
    },
    onError: (error) => {
      const general = applyServerErrors(error, setError, COHORT_FIELDS, t('users.genericError'))
      if (general) onError(general)
    },
  })

  const onSubmit = (values) =>
    mutation.mutate({
      number: Number(values.number),
      // El input entrega "2026-09"; el backend guarda el día 1 de todos modos.
      start_month: monthInputToDate(values.start_month),
      end_month: monthInputToDate(values.end_month),
      status: values.status,
    })

  return (
    <ModalShell
      title={t('programs.createCohortTitle')}
      subtitle={t('programs.createCohortSubtitle', { name: program.name })}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('programs.number')} htmlFor="cohort-number" error={errors.number?.message}>
            <input
              id="cohort-number"
              {...register('number')}
              type="number"
              min="1"
              className={inputClass}
            />
          </Field>
          <Field label={t('programs.startMonth')} htmlFor="cohort-start-month" error={errors.start_month?.message}>
            <input
              id="cohort-start-month"
              {...register('start_month')}
              type="month"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label={t('programs.expectedEnd')} htmlFor="cohort-end-month" error={errors.end_month?.message}>
          <input
            id="cohort-end-month"
            {...register('end_month')}
            type="month"
            className={inputClass}
          />
        </Field>

        <Field label={t('programs.status')} hint={t('programs.statusManualHint')} error={errors.status?.message}>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <CustomSelect
                value={field.value}
                onChange={field.onChange}
                options={statusOptions}
                placeholder={t('programs.selectStatus')}
              />
            )}
          />
        </Field>

        <p className="text-xs text-gray-400">
          {t('programs.cohortNote')}
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            {t('programs.cancel')}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2.5 bg-[#1D3176] text-white text-sm font-medium rounded-xl hover:bg-[#182861] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? t('programs.creating') : t('programs.createCohort')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
