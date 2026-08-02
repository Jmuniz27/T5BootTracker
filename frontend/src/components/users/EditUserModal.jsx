import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateUser } from '../../api/users.api'
import { isValidCedula } from '../../utils/cedula'
import { ROLE_OPTIONS } from './roles'
import {
  coordinatorScopeFields,
  coordinatorScopePayload,
  refineCoordinatorScope,
} from './coordinatorScope'
import ModalShell from './ModalShell'
import UserFormFields from './UserFormFields'
import { applyServerErrors } from './apiErrors'

const schema = z
  .object({
    first_name: z.string().trim().min(1, 'El nombre es requerido'),
    last_name: z.string().trim().min(1, 'El apellido es requerido'),
    email: z.string().trim().email('Ingresa un email válido'),
    role: z.enum(
      ROLE_OPTIONS.map((r) => r.value),
      { message: 'Selecciona un rol' },
    ),
    cedula: z
      .string()
      .trim()
      .refine((v) => v === '' || isValidCedula(v), 'Cédula ecuatoriana inválida'),
    phone: z.string().trim(),
    ...coordinatorScopeFields,
  })
  .superRefine(refineCoordinatorScope)

export default function EditUserModal({ user, onClose, onSuccess, onError }) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      email: user.email ?? '',
      role: user.role ?? '',
      cedula: user.cedula ?? '',
      phone: user.phone ?? '',
      coordinator_scope: user.coordinator_scope ?? '',
      coordinator_programs: user.coordinator_programs ?? [],
    },
  })

  const mutation = useMutation({
    mutationFn: (data) => updateUser(user.id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onSuccess(`Usuario ${updated.full_name} actualizado.`)
      onClose()
    },
    onError: (error) => {
      const general = applyServerErrors(error, setError)
      if (general) onError(general)
    },
  })

  const onSubmit = (values) =>
    mutation.mutate({
      ...values,
      cedula: values.cedula || null,
      phone: values.phone || null,
      ...coordinatorScopePayload(values),
    })

  return (
    <ModalShell title="Editar usuario" subtitle={user.email} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <UserFormFields register={register} errors={errors} control={control} />

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
            disabled={mutation.isPending || !isDirty}
            className="px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
