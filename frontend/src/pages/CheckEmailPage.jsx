import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import AuthLayout from '../components/AuthLayout';
import { requestPasswordReset } from '../api/auth.api';

export default function CheckEmailPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const email = state?.email ?? '';
  const displayEmail = email ? email.replace(/(.{2}).+(@.+)/, '$1…$2') : 'tu correo';

  const inputRefs = useRef([]);
  const digits = useRef(Array(5).fill(''));

  const { mutate: resend, isPending } = useMutation({
    mutationFn: requestPasswordReset,
  });

  const handleDigit = (e, index) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    e.target.value = val;
    digits.current[index] = val;
    if (val && index < 4) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <AuthLayout backTo="/forgot-password" backLabel="Volver">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
      <p className="text-gray-400 text-sm mb-8">
        We sent a reset link to{' '}
        <span className="font-semibold text-gray-700">{displayEmail}</span>.{' '}
        Enter the 5 digit code mentioned in the email.
      </p>

      <div className="flex gap-3 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            onChange={(e) => handleDigit(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className="w-full aspect-square text-center text-lg font-semibold border-2 border-gray-200 rounded-lg outline-none focus:border-secondary transition"
          />
        ))}
      </div>

      <button
        onClick={() => navigate('/reset-success')}
        className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:opacity-90 transition mb-4"
      >
        Verify code
      </button>

      <p className="text-center text-sm text-gray-400">
        Haven&apos;t got the email yet?{' '}
        <button
          onClick={() => resend({ email })}
          disabled={isPending}
          className="text-secondary hover:underline disabled:opacity-60"
        >
          {isPending ? 'Enviando...' : 'Resend email'}
        </button>
      </p>
    </AuthLayout>
  );
}
