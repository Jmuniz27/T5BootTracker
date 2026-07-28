import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createUser } from '../../api/users.api'
import { isValidCedula } from '../../utils/cedula'
import { ROLE_OPTIONS } from './roles'
import ModalShell from './ModalShell'
import UserFormFields from './UserFormFields'
import { applyServerErrors } from './apiErrors'

const schema = z.object({
  first_name: z.string().trim().min(1, 'El nombre es requerido'),
  last_name: z.string().trim().min(1, 'El apellido es requerido'),
  email: z.string().trim().email('Ingresa un email válido'),
  role: z.enum(
    ROLE_OPTIONS.map((r) => r.value),
    { message: 'Selecciona un rol' },
  ),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  cedula: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidCedula(v), 'Cédula ecuatoriana inválida'),
  phone: z.string().trim(),
})

export default function CreateUserModal({ onClose, onSuccess, onError }) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { first_name: '', last_name: '', email: '', role: '', password: '', cedula: '', phone: '' },
  })

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onSuccess(`Usuario ${user.full_name} creado correctamente.`)
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
      // El backend rechaza cadena vacía en campos únicos/opcionales — manda null.
      cedula: values.cedula || null,
      phone: values.phone || null,
    })

  return (
    <ModalShell
      title="Nuevo usuario"
      subtitle="El usuario podrá iniciar sesión con el email y la contraseña temporal."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <UserFormFields register={register} errors={errors} control={control} includePassword />

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
            className="px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
