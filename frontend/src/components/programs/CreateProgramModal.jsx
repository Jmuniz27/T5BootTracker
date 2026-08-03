import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createProgram } from '../../api/programs.api'
import ModalShell from '../users/ModalShell'
import { applyServerErrors } from '../users/apiErrors'

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200'

const PROGRAM_FIELDS = ['name', 'start_date', 'end_date', 'total_cost']

const schema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es requerido'),
    start_date: z.string().min(1, 'La fecha de inicio es requerida'),
    end_date: z.string().min(1, 'La fecha de fin es requerida'),
    total_cost: z
      .string()
      .min(1, 'El costo es requerido')
      .refine((v) => Number(v) > 0, 'El costo debe ser mayor que cero'),
  })
  // Misma regla que ProgramWriteSerializer.validate en el backend.
  .refine((v) => v.end_date > v.start_date, {
    path: ['end_date'],
    message: 'La fecha de fin debe ser posterior a la de inicio',
  })

/** `htmlFor` asocia la etiqueta con su input, para lectores de pantalla. */
function Field({ label, error, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        <span className="text-red-500"> *</span>
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

export default function CreateProgramModal({ onClose, onSuccess, onError }) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', start_date: '', end_date: '', total_cost: '' },
  })

  const mutation = useMutation({
    mutationFn: createProgram,
    onSuccess: (program) => {
      queryClient.invalidateQueries({ queryKey: ['programs'] })
      onSuccess(`Programa ${program.name} creado correctamente.`)
      onClose()
    },
    onError: (error) => {
      // Devuelve null cuando el error ya quedó pintado bajo su campo.
      const general = applyServerErrors(error, setError, PROGRAM_FIELDS)
      if (general) onError(general)
    },
  })

  return (
    <ModalShell
      title="Nuevo programa"
      subtitle="El costo y las fechas del programa son la referencia para los pagos."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
        <Field label="Nombre" htmlFor="program-name" error={errors.name?.message}>
          <input
            id="program-name"
            {...register('name')}
            placeholder="Python Full Stack"
            className={inputClass}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Fecha de inicio" htmlFor="program-start" error={errors.start_date?.message}>
            <input id="program-start" {...register('start_date')} type="date" className={inputClass} />
          </Field>
          <Field label="Fecha de fin" htmlFor="program-end" error={errors.end_date?.message}>
            <input id="program-end" {...register('end_date')} type="date" className={inputClass} />
          </Field>
        </div>

        <Field label="Costo total" htmlFor="program-cost" error={errors.total_cost?.message}>
          <input
            id="program-cost"
            {...register('total_cost')}
            type="number"
            step="0.01"
            min="0"
            placeholder="1200.00"
            className={inputClass}
          />
        </Field>

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
            {mutation.isPending ? 'Creando…' : 'Crear programa'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
