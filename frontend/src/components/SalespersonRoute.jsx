import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

/**
 * Guard de rol para la Agenda. Se monta dentro de ProtectedRoute (token ya
 * validado): la agenda es una herramienta del vendedor, así que solo SALESPERSON
 * entra; cualquier otro rol que escriba la URL termina en su dashboard.
 */
export default function SalespersonRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'SALESPERSON' ? children : <Navigate to="/dashboard" replace />;
}
