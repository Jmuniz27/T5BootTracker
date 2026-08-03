import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { confirmPasswordReset } from '../api/auth.api';

const schema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    password_confirm: z.string(),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['password_confirm'],
  });

function resetPasswordErrorMessage(error) {
  if (error?.response?.status === 400) return error.response.data?.error ?? 'Token expirado o inválido.';
  if (error) return 'Error de conexión. Intenta de nuevo.';
  return null;
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  const { mutate, isPending, error } = useMutation({
    mutationFn: (d) => confirmPasswordReset({ token, ...d }),
    onSuccess: () => navigate('/reset-success'),
  });

  const errorMsg = resetPasswordErrorMessage(error);

  if (!token) {
    return (
      <AuthLayout>
        <p className="text-gray-500 text-sm text-center py-8">
          Enlace inválido.{' '}
          <a href="/forgot-password" className="text-secondary hover:underline">
            Solicita un nuevo reset
          </a>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backTo="/login" backLabel="Volver al inicio">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Nueva contraseña</h1>
      <p className="text-gray-500 text-sm mb-6">Ingresa tu nueva contraseña</p>

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nueva contraseña
          </label>
          <input
            {...register('password')}
            type="password"
            placeholder="••••••••"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-secondary focus:border-secondary transition"
          />
          {errors.password && (
            <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
          )}
        </div>

        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirmar contraseña
          </label>
          <input
            {...register('password_confirm')}
            type="password"
            placeholder="••••••••"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-secondary focus:border-secondary transition"
          />
          {errors.password_confirm && (
            <p className="text-red-500 text-xs mt-1">{errors.password_confirm.message}</p>
          )}
        </div>

        {errorMsg && (
          <p className="text-red-500 text-sm text-center mb-4">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:opacity-90 disabled:opacity-60 transition"
        >
          {isPending ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthLayout>
  );
}
