import { Controller } from 'react-hook-form'
import CustomSelect from '../CustomSelect'
import { ROLE_OPTIONS } from './roles'

const inputClass =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200'

function Field({ label, required, hint, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {hint && <span className="text-xs text-gray-400 font-normal"> ({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

/**
 * Campos compartidos por CreateUserModal y EditUserModal. La contraseña solo
 * aplica en creación — al editar, el reseteo va por su propia acción.
 */
export default function UserFormFields({ register, errors, control, includePassword = false }) {
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nombre" required error={errors.first_name?.message}>
          <input {...register('first_name')} placeholder="Ana" className={inputClass} />
        </Field>
        <Field label="Apellido" required error={errors.last_name?.message}>
          <input {...register('last_name')} placeholder="Vera" className={inputClass} />
        </Field>
      </div>

      <Field label="Email" required error={errors.email?.message}>
        <input {...register('email')} type="email" placeholder="ana.vera@espol.edu.ec" className={inputClass} />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Rol" required error={errors.role?.message}>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <CustomSelect
                value={field.value}
                onChange={field.onChange}
                options={ROLE_OPTIONS}
                placeholder="Seleccionar rol"
              />
            )}
          />
        </Field>
        <Field label="Cédula" hint="opcional" error={errors.cedula?.message}>
          <input
            {...register('cedula')}
            inputMode="numeric"
            maxLength={10}
            placeholder="0912345678"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Teléfono" hint="opcional" error={errors.phone?.message}>
        <input {...register('phone')} placeholder="0991234567" className={inputClass} />
      </Field>

      {includePassword && (
        <Field label="Contraseña temporal" required error={errors.password?.message}>
          <input
            {...register('password')}
            type="text"
            placeholder="Mínimo 8 caracteres"
            className={inputClass}
          />
          <p className="text-xs text-gray-400 mt-1">
            Se le comparte al usuario para su primer ingreso.
          </p>
        </Field>
      )}
    </>
  )
}
