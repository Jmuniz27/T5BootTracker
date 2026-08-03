import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { loginUser } from '../api/auth.api'
import { useAuthStore } from '../store/auth.store'
import AuthLayout from '../components/AuthLayout'
import AuthInput, { EmailIcon } from '../components/AuthInput'
import PasswordInput from '../components/PasswordInput'
import AuthButton from '../components/AuthButton'

const schema = z.object({
  email: z.string().email('Ingresa un email válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

function loginErrorMessage(error) {
  if (error?.response?.status === 401) return 'Credenciales incorrectas'
  if (error?.response?.status === 403) return error.response.data?.error
  if (error) return 'Error de conexión. Intenta de nuevo.'
  return null
}

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) })

  const { mutate, isPending, error } = useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      setAuth(data)
      navigate('/dashboard')
    },
  })

  const errorMsg = loginErrorMessage(error)

  return (
    <AuthLayout>
      <h2 className="text-3xl font-bold text-white mb-2">
        Inicia sesión para <span className="text-[#5B9BD5]">continuar</span>
      </h2>
      <p className="text-white/50 text-sm mb-10">¡Retoma donde lo dejaste!</p>

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-white/70 mb-2">Email</label>
          <AuthInput
            {...register('email')}
            id="login-email"
            data-testid="login-email"
            type="email"
            placeholder="placeholder@placeholder.com"
            icon={EmailIcon}
            error={errors.email?.message}
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="login-password" className="text-sm font-medium text-white/70">Contraseña</label>
            <Link to="/forgot-password" className="text-sm text-[#5B9BD5] hover:text-[#7ab3e0] transition-colors">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <PasswordInput
            {...register('password')}
            id="login-password"
            data-testid="login-password"
            placeholder="••••••••••"
            error={errors.password?.message}
          />
        </div>

        {errorMsg && (
          <p className="text-red-400 text-sm text-center">{errorMsg}</p>
        )}

        <AuthButton type="submit" data-testid="login-submit" disabled={isPending} className="mt-4">
          {isPending ? 'Ingresando...' : 'Ingresar'}
        </AuthButton>
      </form>
    </AuthLayout>
  )
}
