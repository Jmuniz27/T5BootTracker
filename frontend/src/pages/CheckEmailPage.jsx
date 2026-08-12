import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { state } = useLocation();
  const email = state?.email ?? '';
  const displayEmail = email ? maskEmail(email) : t('checkEmail.yourEmail');
  const [resent, setResent] = useState(false);

  const { mutate: resend, isPending } = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => setResent(true),
  });

  return (
    <AuthLayout backTo="/login" backLabel={t('common.backToLogin')}>
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t('checkEmail.title')}</h1>
      <p className="text-white/50 text-sm mb-6 sm:mb-10">
        {/* `maskEmail` sólo acorta la parte local: el dominio viaja entero y no
            tiene espacios donde cortar, así que en pantallas angostas hay que
            permitir el corte dentro de la palabra o desborda la tarjeta. */}
        {t('checkEmail.bodyPrefix')}<span className="font-semibold text-white break-words">{displayEmail}</span>{t('checkEmail.bodySuffix')}
      </p>

      <AuthButton
        type="button"
        onClick={() => resend({ email })}
        disabled={isPending}
      >
        {isPending ? t('checkEmail.sending') : t('checkEmail.resend')}
      </AuthButton>

      <p className="text-center text-sm text-white/50 mt-6">
        {resent ? (
          t('checkEmail.resent')
        ) : (
          <>{t('checkEmail.notReceived')}</>
        )}
      </p>
    </AuthLayout>
  );
}
