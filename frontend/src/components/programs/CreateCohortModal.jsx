import { Controller, useForm } from 'react-hook-form'
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

const schema = z.object({
  number: z
    .string()
    .min(1, 'El número es requerido')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, 'El número empieza en 1'),
  start_month: z.string().min(1, 'El mes de inicio es requerido'),
  status: z.string().min(1, 'Selecciona el estado'),
})

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
      status: 'UPCOMING',
    },
  })

  const mutation = useMutation({
    mutationFn: (data) => createCohort(program.id, data),
    onSuccess: (cohort) => {
      queryClient.invalidateQueries({ queryKey: ['cohorts', program.id] })
      queryClient.invalidateQueries({ queryKey: ['programs'] })
      onSuccess(`Cohorte ${cohort.number} creada correctamente.`)
      onClose()
    },
    onError: (error) => {
      const general = applyServerErrors(error, setError, COHORT_FIELDS)
      if (general) onError(general)
    },
  })

  const onSubmit = (values) =>
    mutation.mutate({
      number: Number(values.number),
      // El input entrega "2026-09"; el backend guarda el día 1 de todos modos.
      start_month: monthInputToDate(values.start_month),
      status: values.status,
    })

  return (
    <ModalShell
      title="Nueva cohorte"
      subtitle={`Se creará dentro de ${program.name}.`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Número" htmlFor="cohort-number" error={errors.number?.message}>
            <input
              id="cohort-number"
              {...register('number')}
              type="number"
              min="1"
              className={inputClass}
            />
          </Field>
          <Field label="Mes de inicio" htmlFor="cohort-start-month" error={errors.start_month?.message}>
            <input
              id="cohort-start-month"
              {...register('start_month')}
              type="month"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Estado" hint="se cambia a mano" error={errors.status?.message}>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <CustomSelect
                value={field.value}
                onChange={field.onChange}
                options={COHORT_STATUS_OPTIONS}
                placeholder="Seleccionar estado"
              />
            )}
          />
        </Field>

        <p className="text-xs text-gray-400">
          El mes de finalización no se pide: se guarda solo cuando marques la cohorte como
          finalizada.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2.5 bg-[#1D3176] text-white text-sm font-medium rounded-xl hover:bg-[#182861] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? 'Creando…' : 'Crear cohorte'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
