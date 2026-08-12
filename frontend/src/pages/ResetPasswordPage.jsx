import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import AuthButton from '../components/AuthButton';
import { confirmPasswordReset } from '../api/auth.api';

function buildSchema(t) {
  return z
    .object({
      password: z.string().min(8, t('reset.minChars')),
      password_confirm: z.string(),
    })
    .refine((d) => d.password === d.password_confirm, {
      message: t('reset.noMatch'),
      path: ['password_confirm'],
    });
}

function resetPasswordErrorMessage(error, t) {
  if (error?.response?.status === 400) return error.response.data?.error ?? t('reset.tokenInvalid');
  if (error) return t('reset.connError');
  return null;
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const schema = useMemo(() => buildSchema(t), [t]);
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

  const errorMsg = resetPasswordErrorMessage(error, t);

  if (!token) {
    return (
      <AuthLayout backTo="/login" backLabel={t('common.backToLogin')}>
        <p className="text-white/50 text-sm text-center py-8">
          {t('reset.invalidLink')}{' '}
          <a href="/forgot-password" className="text-[#5B9BD5] hover:underline">
            {t('reset.requestNew')}
          </a>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backTo="/login" backLabel={t('common.backToLogin')}>
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
        {t('reset.titleA')}<span className="text-[#5B9BD5]">{t('reset.titleB')}</span>
      </h1>
      <p className="text-white/50 text-sm mb-6 sm:mb-10">{t('reset.subtitle')}</p>

      <form onSubmit={handleSubmit((d) => mutate(d))} noValidate className="space-y-4 sm:space-y-5">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            {t('reset.newPassword')}
          </label>
          <PasswordInput
            {...register('password')}
            placeholder="••••••••"
            error={errors.password?.message}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            {t('reset.confirmPassword')}
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
          {isPending ? t('reset.saving') : t('reset.save')}
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
