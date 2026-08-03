import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import AuthButton from '../components/AuthButton';
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
      <AuthLayout backTo="/login" backLabel="Volver al inicio de sesión">
        <p className="text-white/50 text-sm text-center py-8">
          Enlace inválido.{' '}
          <a href="/forgot-password" className="text-[#5B9BD5] hover:underline">
            Solicita un nuevo reset
          </a>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backTo="/login" backLabel="Volver al inicio de sesión">
      <h1 className="text-3xl font-bold text-white mb-2">
        Nueva <span className="text-[#5B9BD5]">contraseña</span>
      </h1>
      <p className="text-white/50 text-sm mb-10">Ingresa tu nueva contraseña</p>

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            Nueva contraseña
          </label>
          <PasswordInput
            {...register('password')}
            placeholder="••••••••"
            error={errors.password?.message}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            Confirmar contraseña
          </label>
          <PasswordInput
            {...register('password_confirm')}
            placeholder="••••••••"
            error={errors.password_confirm?.message}
          />
        </div>

        {errorMsg && (
          <p className="text-red-400 text-sm text-center">{errorMsg}</p>
        )}

        <AuthButton type="submit" disabled={isPending} className="mt-4">
          {isPending ? 'Guardando...' : 'Guardar contraseña'}
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
