import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth.store';

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold text-primary">{t('dashboard.title')}</h1>
      {user && (
        <p className="text-gray-600">
          {t('dashboard.welcome')}<span className="font-semibold">{user.full_name}</span>
        </p>
      )}
      <button
        onClick={handleLogout}
        className="px-6 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition"
      >
        {t('dashboard.logout')}
      </button>
    </div>
  );
}
