import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import AuthLayout from '../components/AuthLayout';
import AuthButton from '../components/AuthButton';
import { requestPasswordReset } from '../api/auth.api';

function maskEmail(email) {
  const at = email.indexOf('@');
  if (at < 3) return email;
  return `${email.slice(0, 2)}…${email.slice(at)}`;
}

export default function CheckEmailPage() {
  const { state } = useLocation();
  const email = state?.email ?? '';
  const displayEmail = email ? maskEmail(email) : 'tu correo';
  const [resent, setResent] = useState(false);

  const { mutate: resend, isPending } = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => setResent(true),
  });

  return (
    <AuthLayout backTo="/login" backLabel="Volver al inicio de sesión">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Revisa tu correo</h1>
      <p className="text-white/50 text-sm mb-6 sm:mb-10">
        {/* `maskEmail` sólo acorta la parte local: el dominio viaja entero y no
            tiene espacios donde cortar, así que en pantallas angostas hay que
            permitir el corte dentro de la palabra o desborda la tarjeta. */}
        Si <span className="font-semibold text-white break-words">{displayEmail}</span> tiene una cuenta
        registrada, te enviamos un enlace de recuperación. Abre el correo y haz clic en el
        enlace para elegir una nueva contraseña. El enlace expira en 60 minutos.
      </p>

      <AuthButton
        type="button"
        onClick={() => resend({ email })}
        disabled={isPending}
      >
        {isPending ? 'Enviando...' : 'Reenviar correo'}
      </AuthButton>

      <p className="text-center text-sm text-white/50 mt-6">
        {resent ? (
          'Correo reenviado.'
        ) : (
          <>¿No te llegó el correo? Usa el botón de arriba para reenviarlo.</>
        )}
      </p>
    </AuthLayout>
  );
}
