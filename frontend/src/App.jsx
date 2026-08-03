import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import SalespersonRoute from './components/SalespersonRoute'
import RoleRoute from './components/RoleRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import CheckEmailPage from './pages/CheckEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ResetSuccessPage from './pages/ResetSuccessPage'
import LeadsDashboard from './pages/LeadsDashboard'
import UsersPage from './pages/UsersPage'
import AnalyticsPage from './pages/AnalyticsPage'
import AgendaPage from './pages/AgendaPage'
import PaymentsPage from './pages/PaymentsPage'
import FinancePaymentsPage from './pages/FinancePaymentsPage'
import BootcamperPaymentDetailPage from './pages/BootcamperPaymentDetailPage'
import AdminPortfoliosPage from './pages/AdminPortfoliosPage'
import AdminSalespersonActivityPage from './pages/AdminSalespersonActivityPage'
import AdminFinanceDetailPage from './pages/AdminFinanceDetailPage'
import ProgramsPage from './pages/ProgramsPage'
import ProgramDetailPage from './pages/ProgramDetailPage'
import { useAuthStore } from './store/auth.store'

function PaymentsRoute() {
  const user = useAuthStore((s) => s.user)
  if (user?.role === 'BOOTCAMPER') return <PaymentsPage />
  // El administrador no tiene bootcampers propios: ve las carteras del equipo
  // en lugar de una lista que no le pertenece.
  if (user?.role === 'ADMINISTRATOR') return <AdminPortfoliosPage />
  // El cobro es de Finanzas. Cualquier otro rol —vendedor, coordinador (que no
  // es usuario del sistema), o uno nuevo— no tiene nada que hacer acá.
  if (user?.role === 'FINANCE') return <FinancePaymentsPage />
  return <Navigate to="/dashboard" replace />
}

function DashboardRoute() {
  const user = useAuthStore((s) => s.user)
  if (user?.role === 'BOOTCAMPER') return <Navigate to="/payments" replace />
  return <LeadsDashboard />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/check-email" element={<CheckEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-success" element={<ResetSuccessPage />} />

        {/* Protected app routes */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="/schedule" element={<SalespersonRoute><AgendaPage /></SalespersonRoute>} />
          <Route path="/agenda" element={<SalespersonRoute><AgendaPage /></SalespersonRoute>} />
          <Route path="/payments" element={<PaymentsRoute />} />
          <Route
            path="/payments/:bootcamperId/:programId"
            element={
              <RoleRoute allow={['FINANCE', 'ADMINISTRATOR', 'BOOTCAMPER']}>
                <BootcamperPaymentDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="/payments/finanzas/:financeId"
            element={
              <AdminRoute>
                <AdminFinanceDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="/analytics/vendedor/:salespersonId"
            element={
              <AdminRoute>
                <AdminSalespersonActivityPage />
              </AdminRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <AdminRoute>
                <AnalyticsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <UsersPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/programs"
            element={
              <AdminRoute>
                <ProgramsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/programs/:programId"
            element={
              <AdminRoute>
                <ProgramDetailPage />
              </AdminRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
