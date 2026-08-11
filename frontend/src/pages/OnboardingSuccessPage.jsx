import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import AuthButton from '../components/AuthButton';

export default function OnboardingSuccessPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <div className="flex justify-center mb-6">
        <div
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(91,155,213,0.15)', border: '1px solid rgba(91,155,213,0.4)' }}
        >
          <svg className="w-8 h-8 text-[#5B9BD5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 text-center">Cuenta activada</h1>
      <p className="text-white/50 text-sm mb-8 sm:mb-10 text-center">
        Tu cuenta ya está lista. Inicia sesión con tu correo y la contraseña que acabas de crear.
      </p>

      <AuthButton onClick={() => navigate('/login')}>
        Ir al inicio de sesión
      </AuthButton>
    </AuthLayout>
  );
}
