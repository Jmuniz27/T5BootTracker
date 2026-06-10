import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export default function ProtectedRoute({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return accessToken ? children : <Navigate to="/login" replace />;
}
