import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

/**
 * Guard de rol genérico. Se monta dentro de ProtectedRoute, así que el token ya está
 * validado: acá solo se decide por rol. Un rol no permitido que escriba la URL a mano
 * termina en su dashboard, no en una pantalla vacía.
 */
export default function RoleRoute({ allow, children }) {
  const user = useAuthStore((s) => s.user);
  return allow.includes(user?.role) ? children : <Navigate to="/dashboard" replace />;
}
