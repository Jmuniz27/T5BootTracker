import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '../api/auth.api';
import AuthLayout from '../components/AuthLayout';
import AuthInput, { EmailIcon } from '../components/AuthInput';
import AuthButton from '../components/AuthButton';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const schema = useMemo(() => z.object({
    email: z.string().email(t('forgot.invalidEmail')),
  }), [t]);

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
    <AuthLayout backTo="/login" backLabel={t('forgot.back')}>
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
        {t('forgot.headingA')}<span className="text-[#5B9BD5]">{t('forgot.headingB')}</span>{t('forgot.headingSuffix')}
      </h1>
      <p className="text-white/50 text-sm mb-6 sm:mb-10">
        {t('forgot.subtitle')}
      </p>

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate>
        <div className="mb-6 sm:mb-10">
          <label className="block text-sm font-medium text-white/70 mb-2">{t('forgot.email')}</label>
          <AuthInput
            {...register('email')}
            type="email"
            placeholder="placeholder@placeholder.com"
            icon={EmailIcon}
            error={errors.email?.message}
          />
          {error && (
            <p className="text-red-400 text-xs mt-2 pl-4">
              {t('forgot.sendError')}
            </p>
          )}
        </div>

        <AuthButton type="submit" disabled={isPending}>
          {isPending ? t('forgot.submitting') : t('forgot.submit')}
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
