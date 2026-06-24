import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { loginUser } from '../api/auth.api'
import { useAuthStore } from '../store/auth.store'
import logo from '../assets/logo.png'

const schema = z.object({
  email: z.string().email('Ingresa un email válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [showPassword, setShowPassword] = useState(false)

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

  const errorMsg =
    error?.response?.status === 401
      ? 'Credenciales incorrectas'
      : error?.response?.status === 403
        ? error.response.data?.error
        : error
          ? 'Error de conexión. Intenta de nuevo.'
          : null

  return (
    <div
      className="min-h-screen flex items-center justify-center px-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1a2f6e 0%, #0d1b4b 60%, #091336 100%)' }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(59,99,214,0.35) 0%, transparent 65%)',
        }}
      />

      {/* Logo top-left */}
      <div className="absolute top-8 left-10 z-10 flex items-center gap-3">
        <img src={logo} alt="Coding Bootcamps ESPOL" className="w-10 h-10 object-contain" />
        <div className="text-white text-xs font-semibold leading-tight opacity-80">
          CODING<br />BOOTCAMPS<br /><span className="text-[10px] tracking-widest">espol</span>
        </div>
      </div>

      {/* Form card */}
      <div className="relative z-10 w-full max-w-md">
        <h2 className="text-3xl font-bold text-white mb-2">
          Inicia sesión para <span className="text-[#5B9BD5]">continuar</span>
        </h2>
        <p className="text-white/50 text-sm mb-10">¡Retoma donde lo dejaste!</p>

        <form onSubmit={handleSubmit((d) => mutate(d))} noValidate className="space-y-5">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Email</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <input
                {...register('email')}
                type="email"
                placeholder="placeholder@placeholder.com"
                className="w-full rounded-full px-5 py-3.5 pl-12 text-sm text-white placeholder-white/30 outline-none transition"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                onFocus={e => e.target.style.borderColor = 'rgba(91,155,213,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
              />
            </div>
            {errors.email && <p className="text-red-400 text-xs mt-1.5 pl-4">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white/70">Contraseña</label>
              <Link to="/forgot-password" className="text-sm text-[#5B9BD5] hover:text-[#7ab3e0] transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••"
                className="w-full rounded-full px-5 py-3.5 pl-12 pr-12 text-sm text-white placeholder-white/30 outline-none transition"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                onFocus={e => e.target.style.borderColor = 'rgba(91,155,213,0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && <p className="text-red-400 text-xs mt-1.5 pl-4">{errors.password.message}</p>}
          </div>

          {errorMsg && (
            <p className="text-red-400 text-sm text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3.5 rounded-full text-white font-semibold text-sm transition hover:opacity-90 disabled:opacity-60 mt-4"
            style={{ background: 'linear-gradient(135deg, #2D4DB5 0%, #1a3399 100%)' }}
          >
            {isPending ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
