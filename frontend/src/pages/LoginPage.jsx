import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loginUser } from '../api/auth.api'
import { useAuthStore } from '../store/auth.store'
import AuthLayout from '../components/AuthLayout'
import AuthInput, { EmailIcon } from '../components/AuthInput'
import PasswordInput from '../components/PasswordInput'
import AuthButton from '../components/AuthButton'

function loginErrorMessage(error, t) {
  if (error?.response?.status === 401) return t('login.badCredentials')
  if (error?.response?.status === 403) return error.response.data?.error
  if (error) return t('login.connError')
  return null
}

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  // `forceLogout` recarga la página entera, así que el motivo no puede viajar en
  // el state del router: llega como query param (ver api/client.js).
  const [params] = useSearchParams()
  const sesionExpirada = params.get('expired') === '1'

  const schema = useMemo(() => z.object({
    email: z.string().email(t('login.invalidEmail')),
    password: z.string().min(1, t('login.passwordRequired')),
  }), [t])

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

  const errorMsg = loginErrorMessage(error, t)

  return (
    <AuthLayout>
      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
        {t('login.headingA')}<span className="text-[#5B9BD5]">{t('login.headingB')}</span>
      </h2>
      {/* El aviso ocupa el lugar del subtítulo en vez de apilarse sobre él: en un
          teléfono bajo, sumarlo empujaba el botón de ingresar fuera de la
          pantalla. Y decir "retoma donde lo dejaste" justo debajo de "tu sesión
          expiró" sobra. */}
      {sesionExpirada ? (
        <div
          role="status"
          className="mb-6 sm:mb-10 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
        >
          {t('login.expired')}
        </div>
      ) : (
        <p className="text-white/50 text-sm mb-6 sm:mb-10">{t('login.subtitle')}</p>
      )}

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-white/70 mb-2">{t('login.email')}</label>
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
            <label htmlFor="login-password" className="text-sm font-medium text-white/70">{t('login.password')}</label>
            <Link to="/forgot-password" className="text-sm text-[#5B9BD5] hover:text-[#7ab3e0] transition-colors">
              {t('login.forgot')}
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
          {isPending ? t('login.submitting') : t('login.submit')}
        </AuthButton>
      </form>
    </AuthLayout>
  )
}
