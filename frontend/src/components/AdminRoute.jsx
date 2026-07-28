import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

/**
 * Guard de rol. Se monta dentro de ProtectedRoute, así que el token ya está
 * validado: acá solo se decide por rol. Un no-admin que escriba la URL a mano
 * termina en su dashboard, no en una pantalla vacía.
 */
export default function AdminRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'ADMINISTRATOR' ? children : <Navigate to="/dashboard" replace />;
}
