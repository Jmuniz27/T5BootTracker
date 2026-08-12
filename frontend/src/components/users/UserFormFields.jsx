import { Controller, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import CustomSelect from '../CustomSelect'
import { getPrograms } from '../../api/leads.api'
import { COORDINATOR_SCOPE_OPTIONS, ROLE_OPTIONS } from './roles'

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200'

function Field({ label, required, hint, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {hint && <span className="text-xs text-gray-500 font-normal"> ({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

/**
 * Bloque que sólo aparece con el rol Coordinador. El coordinador no opera el
 * CRM: la cuenta existe para que reciba por correo los avisos que dispara el
 * vendedor, y el alcance decide de qué programas.
 */
function CoordinatorScopeFields({ control, errors }) {
  const { t } = useTranslation()
  const scope = useWatch({ control, name: 'coordinator_scope' })
  const scopeOptions = COORDINATOR_SCOPE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.value === 'GENERAL' ? t('users.scope.generalOption') : t('users.scope.programOption'),
  }))

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    enabled: scope === 'PROGRAM',
  })

  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 space-y-4">
      <p className="text-xs text-purple-900/80">
        {t('users.form.coordinatorNote')}
      </p>

      <Field label={t('users.form.scope')} required error={errors.coordinator_scope?.message}>
        <Controller
          name="coordinator_scope"
          control={control}
          render={({ field }) => (
            <CustomSelect
              value={field.value}
              onChange={field.onChange}
              options={scopeOptions}
              placeholder={t('users.form.selectScope')}
            />
          )}
        />
      </Field>

      {scope === 'PROGRAM' && (
        <Field label={t('users.form.programs')} required error={errors.coordinator_programs?.message}>
          <Controller
            name="coordinator_programs"
            control={control}
            render={({ field }) => (
              <ProgramCheckboxes
                value={field.value ?? []}
                onChange={field.onChange}
                programs={programs}
                isLoading={isLoading}
              />
            )}
          />
        </Field>
      )}
    </div>
  )
}

/**
 * Selección múltiple de programas. Casillas en vez de un multi-select nativo
 * para que se vea cuántos y cuáles están marcados sin abrir nada.
 */
function ProgramCheckboxes({ value, onChange, programs, isLoading }) {
  const { t } = useTranslation()
  if (isLoading) {
    return <p className="text-sm text-gray-400">{t('users.form.loadingPrograms')}</p>
  }

  if (programs.length === 0) {
    return <p className="text-sm text-gray-400">{t('users.form.noPrograms')}</p>
  }

  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="space-y-1.5 max-h-40 overflow-y-auto">
      {programs.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(p.id)}
            onChange={() => toggle(p.id)}
            className="rounded border-gray-300 text-[#1D3176] focus:ring-[#1D3176]"
          />
          <span className="truncate">{p.name}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * Campos compartidos por CreateUserModal y EditUserModal. La contraseña solo
 * aplica en creación — al editar, el reseteo va por su propia acción.
 */
export default function UserFormFields({ register, errors, control, includePassword = false }) {
  const { t } = useTranslation()
  const role = useWatch({ control, name: 'role' })
  const roleOptions = ROLE_OPTIONS.map((o) => ({ value: o.value, label: t(`users.roles.${o.value}`) }))

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t('users.form.firstName')} required error={errors.first_name?.message}>
          <input {...register('first_name')} placeholder="Ana" className={inputClass} />
        </Field>
        <Field label={t('users.form.lastName')} required error={errors.last_name?.message}>
          <input {...register('last_name')} placeholder="Vera" className={inputClass} />
        </Field>
      </div>

      <Field label={t('users.form.email')} required error={errors.email?.message}>
        <input {...register('email')} type="email" placeholder="ana.vera@espol.edu.ec" className={inputClass} />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t('users.form.role')} required error={errors.role?.message}>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <CustomSelect
                value={field.value}
                onChange={field.onChange}
                options={roleOptions}
                placeholder={t('users.form.selectRole')}
              />
            )}
          />
        </Field>
        <Field label={t('users.form.cedula')} hint={t('users.form.optional')} error={errors.cedula?.message}>
          <input
            {...register('cedula')}
            inputMode="numeric"
            maxLength={10}
            placeholder="0912345678"
            className={inputClass}
          />
        </Field>
      </div>

      {role === 'COORDINATOR' && <CoordinatorScopeFields control={control} errors={errors} />}

      <Field label={t('users.form.phone')} hint={t('users.form.optional')} error={errors.phone?.message}>
        <input {...register('phone')} placeholder="0991234567" className={inputClass} />
      </Field>

      {/* El coordinador no inicia sesión: pedirle contraseña sería crear una
          credencial que nadie usa. Para el resto de roles es opcional: si se
          deja en blanco, el backend envía una invitación por correo para que
          la persona elija su propia contraseña. */}
      {includePassword && role !== 'COORDINATOR' && (
        <Field label={t('users.form.tempPassword')} hint={t('users.form.optional')} error={errors.password?.message}>
          <input
            {...register('password')}
            type="text"
            placeholder={t('users.form.passwordPlaceholder')}
            className={inputClass}
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('users.form.passwordHint')}
          </p>
        </Field>
      )}
    </>
  )
}
