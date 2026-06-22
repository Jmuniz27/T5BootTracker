import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { requestPasswordReset } from '../api/auth.api';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
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
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1a2f6e 0%, #0d1b4b 60%, #091336 100%)' }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(59,99,214,0.35) 0%, transparent 65%)',
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-3xl p-10 flex flex-col"
        style={{ background: 'rgba(15, 23, 60, 0.75)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Back button */}
        <Link
          to="/login"
          className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-8 transition-colors w-fit"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to login
        </Link>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white mb-2">
          Forgot <span className="text-[#5B9BD5]">password</span>
        </h1>
        <p className="text-white/50 text-sm mb-8">
          Please enter your email to reset the password
        </p>

        <form onSubmit={handleSubmit((d) => mutate(d))} noValidate className="flex flex-col flex-1">
          {/* Email */}
          <div className="mb-10">
            <label className="block text-sm font-semibold text-white mb-2">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="Enter your email"
              className="w-full rounded-full px-6 py-4 text-sm text-white placeholder-white/30 outline-none transition"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}
              onFocus={e => e.target.style.borderColor = 'rgba(91,155,213,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
            {errors.email && (
              <p className="text-red-400 text-xs mt-2 pl-4">{errors.email.message}</p>
            )}
            {error && (
              <p className="text-red-400 text-xs mt-2 pl-4">Error sending email. Please try again.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-4 rounded-full text-white font-semibold text-sm transition hover:opacity-90 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #2D4DB5 0%, #1a3399 100%)' }}
          >
            {isPending ? 'Sending...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
