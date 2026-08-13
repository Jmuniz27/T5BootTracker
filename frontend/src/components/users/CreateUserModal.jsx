import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createUser } from '../../api/users.api'
import { isValidCedula } from '../../utils/cedula'
import { ROLE_OPTIONS } from './roles'
import {
  coordinatorScopeFields,
  coordinatorScopePayload,
  makeRefineCoordinatorScope,
} from './coordinatorScope'
import ModalShell from './ModalShell'
import UserFormFields from './UserFormFields'
import { applyServerErrors } from './apiErrors'

function buildSchema(t) {
  return z
    .object({
      first_name: z.string().trim().min(1, t('users.validation.firstNameRequired')),
      last_name: z.string().trim().min(1, t('users.validation.lastNameRequired')),
      email: z.string().trim().email(t('users.validation.emailInvalid')),
      role: z.enum(
        ROLE_OPTIONS.map((r) => r.value),
        { message: t('users.validation.roleRequired') },
      ),
      // Sin `min` aquí: dejarla en blanco es válido para cualquier rol que sí
      // inicia sesión — el backend manda una invitación por correo en ese caso.
      // Si se escribe algo, sí debe cumplir el mínimo (se valida más abajo).
      password: z.string(),
      cedula: z
        .string()
        .trim()
        .refine((v) => v === '' || isValidCedula(v), t('users.validation.cedulaInvalid')),
      phone: z.string().trim(),
      ...coordinatorScopeFields,
    })
    .superRefine(makeRefineCoordinatorScope(t))
    .superRefine((values, ctx) => {
      if (values.role === 'COORDINATOR') return
      if (values.password === '') return

      if (values.password.length < 8) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: t('users.validation.passwordMin'),
        })
      }
    })
}

export default function CreateUserModal({ onClose, onSuccess, onError }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildSchema(t), [t])
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
      first_name: '',
      last_name: '',
      email: '',
      role: '',
      password: '',
      cedula: '',
      phone: '',
      coordinator_scope: '',
      coordinator_programs: [],
    },
  })

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (user, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      const message = variables.password
        ? t('users.modals.createdWithPassword', { name: user.full_name })
        : t('users.modals.createdInvite', { name: user.full_name, email: user.email })
      onSuccess(message)
      onClose()
    },
    onError: (error) => {
      const general = applyServerErrors(error, setError, undefined, t('users.genericError'))
      if (general) onError(general)
    },
  })

  const onSubmit = (values) =>
    mutation.mutate({
      ...values,
      // El backend rechaza cadena vacía en campos únicos/opcionales — manda null.
      cedula: values.cedula || null,
      phone: values.phone || null,
      // El campo se oculta al elegir Coordinador, pero si ya se había escrito
      // algo el valor sigue en el formulario: se descarta aquí para no crearle
      // una credencial que por diseño no debe tener.
      password: values.role === 'COORDINATOR' ? '' : values.password,
      ...coordinatorScopePayload(values),
    })

  return (
    <ModalShell
      title={t('users.modals.createTitle')}
      subtitle={t('users.modals.createSubtitle')}
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
            {t('users.modals.cancel')}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? t('users.modals.creating') : t('users.modals.create')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
