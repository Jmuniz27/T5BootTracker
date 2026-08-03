import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { requestPasswordReset } from '../api/auth.api';
import AuthLayout from '../components/AuthLayout';
import AuthInput, { EmailIcon } from '../components/AuthInput';
import AuthButton from '../components/AuthButton';

const schema = z.object({
  email: z.string().email('Ingresa un email válido'),
});

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  const { mutate, isPending, error } = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => navigate('/check-email', { state: { email: getValues('email') } }),
  });

  return (
    <AuthLayout backTo="/login" backLabel="Volver al inicio de sesión">
      <h1 className="text-3xl font-bold text-white mb-2">
        ¿Olvidaste tu <span className="text-[#5B9BD5]">contraseña</span>?
      </h1>
      <p className="text-white/50 text-sm mb-10">
        Ingresa tu correo para restablecer la contraseña
      </p>

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate>
        <div className="mb-10">
          <label className="block text-sm font-medium text-white/70 mb-2">Email</label>
          <AuthInput
            {...register('email')}
            type="email"
            placeholder="placeholder@placeholder.com"
            icon={EmailIcon}
            error={errors.email?.message}
          />
          {error && (
            <p className="text-red-400 text-xs mt-2 pl-4">
              Error al enviar el correo. Intenta de nuevo.
            </p>
          )}
        </div>

        <AuthButton type="submit" disabled={isPending}>
          {isPending ? 'Enviando...' : 'Restablecer contraseña'}
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
