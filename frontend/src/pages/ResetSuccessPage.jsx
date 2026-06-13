import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

export default function ResetSuccessPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Password reset</h1>
      <p className="text-gray-400 text-sm mb-20">
        Your password has been successfully reset. Click confirm to sign in with your new
        password.
      </p>

      <button
        onClick={() => navigate('/login')}
        className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:opacity-90 transition"
      >
        Confirm
      </button>
    </AuthLayout>
  );
}
