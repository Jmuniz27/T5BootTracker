import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import AuthInput, { EmailIcon } from '../components/AuthInput';
import PasswordInput from '../components/PasswordInput';
import AuthButton from '../components/AuthButton';
import { getOnboardingInfo, activateOnboarding } from '../api/auth.api';
import { isValidIdentificacion } from '../utils/cedula';

function buildConfirmSchema(t) {
  return z.object({
    first_name: z.string().min(1, t('onboarding.firstNameRequired')),
    last_name: z.string().min(1, t('onboarding.lastNameRequired')),
    email: z.string().email(t('onboarding.emailInvalid')),
    phone: z.string().optional(),
    cedula: z
      .string()
      .optional()
      .refine((v) => !v || isValidIdentificacion(v), t('onboarding.cedulaInvalid')),
  });
}

function buildPasswordSchema(t) {
  return z
    .object({
      password: z.string().min(8, t('onboarding.passwordMin')),
      password_confirm: z.string(),
      data_consent: z.boolean(),
    })
    .superRefine((d, ctx) => {
      if (d.password !== d.password_confirm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('onboarding.passwordNoMatch'),
          path: ['password_confirm'],
        });
      }
      if (!d.data_consent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('onboarding.consentRequired'),
          path: ['data_consent'],
        });
      }
    });
}

// Todos los códigos vienen con status 400 (ver authentication/services.py::read_onboarding_token) —
// se ramifica por `code`, no por status HTTP.
function onboardingErrorInfo(error, t) {
  const code = error?.response?.data?.code;
  if (code === 'TOKEN_EXPIRED' || code === 'TOKEN_SUPERSEDED') {
    return {
      title: t('onboarding.linkExpiredTitle'),
      message: t('onboarding.linkExpiredMsg'),
      showLogin: false,
    };
  }
  if (code === 'ALREADY_ACTIVATED') {
    return {
      title: t('onboarding.alreadyActiveTitle'),
      message: t('onboarding.alreadyActiveMsg'),
      showLogin: true,
    };
  }
  return {
    title: t('onboarding.invalidLinkTitle'),
    message: t('onboarding.invalidLinkMsg'),
    showLogin: false,
  };
}

function passwordErrorMessage(error, t) {
  if (error?.response?.status === 400) {
    const data = error.response.data;
    return data?.error ?? data?.non_field_errors?.[0]?.error ?? data?.cedula?.[0] ?? t('onboarding.activateError');
  }
  if (error) return t('onboarding.connError');
  return null;
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const confirmSchema = useMemo(() => buildConfirmSchema(t), [t]);
  const passwordSchema = useMemo(() => buildPasswordSchema(t), [t]);
  const navigate = useNavigate();
  const { token } = useParams();
  const [step, setStep] = useState('confirm');
  const [confirmedData, setConfirmedData] = useState(null);

  const {
    data: info,
    isLoading,
    error: infoError,
  } = useQuery({
    queryKey: ['onboarding', token],
    queryFn: () => getOnboardingInfo(token),
    retry: false,
    enabled: Boolean(token),
  });

  const confirmForm = useForm({ resolver: zodResolver(confirmSchema), values: info });
  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { data_consent: false },
  });

  const activateMutation = useMutation({
    mutationFn: (passwordData) =>
      activateOnboarding(token, { ...confirmedData, ...passwordData }),
    onSuccess: () => navigate('/onboarding-success'),
  });

  const errorMsg = passwordErrorMessage(activateMutation.error, t);

  if (isLoading) {
    return (
      <AuthLayout>
        <p className="text-white/50 text-sm text-center py-6 sm:py-8">{t('onboarding.verifying')}</p>
      </AuthLayout>
    );
  }

  if (infoError) {
    const { title, message, showLogin } = onboardingErrorInfo(infoError, t);
    return (
      <AuthLayout backTo={showLogin ? '/login' : undefined} backLabel={t('onboarding.goToLogin')}>
        {/* Centrado como el resto de las pantallas "solo-mensaje" que comparten
            AuthLayout (ResetPasswordPage sin token, OnboardingSuccessPage). Sin
            formulario que ancle la lectura, el texto alineado a la izquierda queda
            pegado al borde mientras el logo va centrado: el desbalance se nota en
            cuanto la pantalla es angosta. */}
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 text-center">{title}</h1>
        <p className="text-white/50 text-sm text-center py-4">{message}</p>
        {showLogin && (
          <AuthButton onClick={() => navigate('/login')} className="mt-4">
            {t('onboarding.goToLogin')}
          </AuthButton>
        )}
      </AuthLayout>
    );
  }

  if (step === 'confirm') {
    return (
      <AuthLayout>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          {t('onboarding.confirmTitleA')}<span className="text-[#5B9BD5]">{t('onboarding.confirmTitleB')}</span>
        </h1>
        <p className="text-white/50 text-sm mb-6 sm:mb-10">
          {t('onboarding.confirmSubtitle')}
        </p>

        <form
          onSubmit={confirmForm.handleSubmit((d) => {
            setConfirmedData(d);
            setStep('password');
          })}
          noValidate
          className="space-y-4 sm:space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">{t('onboarding.firstName')}</label>
            <AuthInput {...confirmForm.register('first_name')} error={confirmForm.formState.errors.first_name?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">{t('onboarding.lastName')}</label>
            <AuthInput {...confirmForm.register('last_name')} error={confirmForm.formState.errors.last_name?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">{t('onboarding.email')}</label>
            <AuthInput
              icon={EmailIcon}
              type="email"
              {...confirmForm.register('email')}
              error={confirmForm.formState.errors.email?.message}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">{t('onboarding.phone')}</label>
            <AuthInput {...confirmForm.register('phone')} error={confirmForm.formState.errors.phone?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">{t('onboarding.cedula')}</label>
            <AuthInput {...confirmForm.register('cedula')} error={confirmForm.formState.errors.cedula?.message} />
          </div>

          <AuthButton type="submit" className="mt-4">
            {t('onboarding.continue')}
          </AuthButton>
        </form>
      </AuthLayout>
    );
  }

  const password = passwordForm.watch('password') ?? '';

  return (
    <AuthLayout>
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
        {t('onboarding.passwordTitleA')}<span className="text-[#5B9BD5]">{t('onboarding.passwordTitleB')}</span>
      </h1>
      <p className="text-white/50 text-sm mb-6 sm:mb-10">{t('onboarding.passwordSubtitle')}</p>

      <form onSubmit={passwordForm.handleSubmit((d) => activateMutation.mutate(d))} noValidate className="space-y-4 sm:space-y-5">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">{t('onboarding.password')}</label>
          <PasswordInput
            {...passwordForm.register('password')}
            placeholder="••••••••"
            error={passwordForm.formState.errors.password?.message}
          />
          <p className={`text-xs mt-1.5 pl-4 ${password.length >= 8 ? 'text-green-400' : 'text-white/40'}`}>
            {password.length >= 8 ? '✓' : '•'} {t('onboarding.minCharsHint')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">{t('onboarding.confirmPassword')}</label>
          <PasswordInput
            {...passwordForm.register('password_confirm')}
            placeholder="••••••••"
            error={passwordForm.formState.errors.password_confirm?.message}
          />
        </div>

        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            {/* h-4 w-4 shrink-0: en móvil la frase del consentimiento ocupa tres
                líneas y el checkbox, como hijo flex sin ancho intrínseco, se
                aplastaba hasta quedar una elipse. */}
            <input
              type="checkbox"
              {...passwordForm.register('data_consent')}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-transparent text-[#213A8E] focus:ring-white/40"
            />
            <span className="text-sm text-white/70 leading-snug">{t('onboarding.consentText')}</span>
          </label>
          {passwordForm.formState.errors.data_consent && (
            <p className="text-red-400 text-sm mt-1.5">
              {passwordForm.formState.errors.data_consent.message}
            </p>
          )}
        </div>

        {errorMsg && <p className="text-red-400 text-sm text-center">{errorMsg}</p>}

        <AuthButton type="submit" disabled={activateMutation.isPending} className="mt-4">
          {activateMutation.isPending ? t('onboarding.activating') : t('onboarding.activate')}
        </AuthButton>

        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="w-full text-center text-white/50 hover:text-white text-sm transition-colors"
        >
          {t('onboarding.backToData')}
        </button>
      </form>
    </AuthLayout>
  );
}
