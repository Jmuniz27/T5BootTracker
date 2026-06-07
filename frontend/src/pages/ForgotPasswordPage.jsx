import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { requestPasswordReset } from '../api/auth.api';

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
    <AuthLayout backTo="/login" backLabel="Volver al inicio">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Forgot password</h1>
      <p className="text-gray-400 text-sm mb-6">
        Please enter your email to reset the password
      </p>

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate>
        <div className="mb-12">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="Enter your email"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-secondary focus:border-secondary transition"
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
          )}
          {error && (
            <p className="text-red-500 text-xs mt-1">Error al enviar. Intenta de nuevo.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:opacity-90 disabled:opacity-60 transition"
        >
          {isPending ? 'Enviando...' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
}
