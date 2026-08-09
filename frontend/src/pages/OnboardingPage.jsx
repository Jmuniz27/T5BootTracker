import { useState } from 'react';
import { useForm } from 'react-hook-form';
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

const confirmSchema = z.object({
  first_name: z.string().min(1, 'El nombre no puede estar vacío'),
  last_name: z.string().min(1, 'El apellido no puede estar vacío'),
  email: z.string().email('Correo inválido'),
  phone: z.string().optional(),
  cedula: z
    .string()
    .optional()
    .refine((v) => !v || isValidIdentificacion(v), 'Cédula o RUC ecuatoriano inválido'),
});

// El texto del consentimiento y su versión viven en el backend
// (authentication/services.py); acá se replica sólo lo que se muestra.
const DATA_CONSENT_TEXT =
  'Acepto que mis datos personales sean utilizados para los fines internos de seguimiento de Coding Bootcamps ESPOL.';

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    password_confirm: z.string(),
    // #329: sin marcar no se activa. El backend lo exige igual — una casilla
    // que sólo vive en el cliente no es constancia de nada.
    data_consent: z.boolean(),
  })
  // superRefine y no dos .refine encadenados: así se juntan todos los problemas
  // en una pasada. Con una validación de forma que falle (por ejemplo el
  // consentimiento sin marcar), un .refine posterior ni siquiera corre y el
  // error de contraseñas quedaría escondido hasta arreglar el otro.
  .superRefine((d, ctx) => {
    if (d.password !== d.password_confirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las contraseñas no coinciden',
        path: ['password_confirm'],
      });
    }
    if (!d.data_consent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hay que aceptar el uso de datos para continuar',
        path: ['data_consent'],
      });
    }
  });

// Todos los códigos vienen con status 400 (ver authentication/services.py::read_onboarding_token) —
// se ramifica por `code`, no por status HTTP.
function onboardingErrorInfo(error) {
  const code = error?.response?.data?.code;
  if (code === 'TOKEN_EXPIRED' || code === 'TOKEN_SUPERSEDED') {
    return {
      title: 'El enlace expiró',
      message: 'Este enlace de invitación ya no es válido. Pide a tu vendedor que te reenvíe uno nuevo.',
      showLogin: false,
    };
  }
  if (code === 'ALREADY_ACTIVATED') {
    return {
      title: 'Tu cuenta ya está activa',
      message: 'Ya activaste esta cuenta anteriormente. Inicia sesión con tu contraseña.',
      showLogin: true,
    };
  }
  return {
    title: 'Enlace inválido',
    message: 'Este enlace de invitación no es válido. Pide a tu vendedor que te reenvíe uno nuevo.',
    showLogin: false,
  };
}

function passwordErrorMessage(error) {
  if (error?.response?.status === 400) {
    const data = error.response.data;
    return data?.error ?? data?.non_field_errors?.[0]?.error ?? data?.cedula?.[0] ?? 'No pudimos activar tu cuenta. Intenta de nuevo.';
  }
  if (error) return 'Error de conexión. Intenta de nuevo.';
  return null;
}

export default function OnboardingPage() {
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

  const errorMsg = passwordErrorMessage(activateMutation.error);

  if (isLoading) {
    return (
      <AuthLayout>
        <p className="text-white/50 text-sm text-center py-8">Verificando tu enlace...</p>
      </AuthLayout>
    );
  }

  if (infoError) {
    const { title, message, showLogin } = onboardingErrorInfo(infoError);
    return (
      <AuthLayout backTo={showLogin ? '/login' : undefined} backLabel="Ir al inicio de sesión">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{title}</h1>
        <p className="text-white/50 text-sm py-4">{message}</p>
        {showLogin && (
          <AuthButton onClick={() => navigate('/login')} className="mt-4">
            Ir al inicio de sesión
          </AuthButton>
        )}
      </AuthLayout>
    );
  }

  if (step === 'confirm') {
    return (
      <AuthLayout>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Confirma tus <span className="text-[#5B9BD5]">datos</span>
        </h1>
        <p className="text-white/50 text-sm mb-6 sm:mb-10">
          Revisa que tus datos estén correctos antes de crear tu contraseña.
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
            <label className="block text-sm font-medium text-white/70 mb-2">Nombre</label>
            <AuthInput {...confirmForm.register('first_name')} error={confirmForm.formState.errors.first_name?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Apellido</label>
            <AuthInput {...confirmForm.register('last_name')} error={confirmForm.formState.errors.last_name?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Email</label>
            <AuthInput
              icon={EmailIcon}
              type="email"
              {...confirmForm.register('email')}
              error={confirmForm.formState.errors.email?.message}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Teléfono</label>
            <AuthInput {...confirmForm.register('phone')} error={confirmForm.formState.errors.phone?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Cédula / RUC</label>
            <AuthInput {...confirmForm.register('cedula')} error={confirmForm.formState.errors.cedula?.message} />
          </div>

          <AuthButton type="submit" className="mt-4">
            Continuar
          </AuthButton>
        </form>
      </AuthLayout>
    );
  }

  const password = passwordForm.watch('password') ?? '';

  return (
    <AuthLayout>
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
        Crea tu <span className="text-[#5B9BD5]">contraseña</span>
      </h1>
      <p className="text-white/50 text-sm mb-6 sm:mb-10">Con esto termina la activación de tu cuenta.</p>

      <form onSubmit={passwordForm.handleSubmit((d) => activateMutation.mutate(d))} noValidate className="space-y-4 sm:space-y-5">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">Contraseña</label>
          <PasswordInput
            {...passwordForm.register('password')}
            placeholder="••••••••"
            error={passwordForm.formState.errors.password?.message}
          />
          <p className={`text-xs mt-1.5 pl-4 ${password.length >= 8 ? 'text-green-400' : 'text-white/40'}`}>
            {password.length >= 8 ? '✓' : '•'} Mínimo 8 caracteres
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">Confirmar contraseña</label>
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
            <span className="text-sm text-white/70 leading-snug">{DATA_CONSENT_TEXT}</span>
          </label>
          {passwordForm.formState.errors.data_consent && (
            <p className="text-red-400 text-sm mt-1.5">
              {passwordForm.formState.errors.data_consent.message}
            </p>
          )}
        </div>

        {errorMsg && <p className="text-red-400 text-sm text-center">{errorMsg}</p>}

        <AuthButton type="submit" disabled={activateMutation.isPending} className="mt-4">
          {activateMutation.isPending ? 'Activando...' : 'Activar mi cuenta'}
        </AuthButton>

        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="w-full text-center text-white/50 hover:text-white text-sm transition-colors"
        >
          Volver a mis datos
        </button>
      </form>
    </AuthLayout>
  );
}
