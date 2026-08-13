import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateUser } from '../../api/users.api'
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
      cedula: z
        .string()
        .trim()
        .refine((v) => v === '' || isValidCedula(v), t('users.validation.cedulaInvalid')),
      phone: z.string().trim(),
      ...coordinatorScopeFields,
    })
    .superRefine(makeRefineCoordinatorScope(t))
}

export default function EditUserModal({ user, onClose, onSuccess, onError }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildSchema(t), [t])
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
      onSuccess(t('users.modals.updated', { name: updated.full_name }))
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
      cedula: values.cedula || null,
      phone: values.phone || null,
      ...coordinatorScopePayload(values),
    })

  return (
    <ModalShell title={t('users.modals.editTitle')} subtitle={user.email} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <UserFormFields register={register} errors={errors} control={control} />

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
            disabled={mutation.isPending || !isDirty}
            className="px-4 py-2.5 bg-[#213A8E] text-white text-sm font-semibold rounded-xl hover:bg-[#1a2f72] transition-colors disabled:opacity-60"
          >
            {mutation.isPending ? t('users.modals.saving') : t('users.modals.saveChanges')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
