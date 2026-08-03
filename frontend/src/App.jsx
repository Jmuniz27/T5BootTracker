import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import CheckEmailPage from './pages/CheckEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ResetSuccessPage from './pages/ResetSuccessPage'
import LeadsDashboard from './pages/LeadsDashboard'
import UsersPage from './pages/UsersPage'
import AnalyticsPage from './pages/AnalyticsPage'
import PaymentsPage from './pages/PaymentsPage'
import SalespersonPaymentsPage from './pages/SalespersonPaymentsPage'
import BootcamperPaymentDetailPage from './pages/BootcamperPaymentDetailPage'
import { useAuthStore } from './store/auth.store'

function PaymentsRoute() {
  const user = useAuthStore((s) => s.user)
  return user?.role === 'BOOTCAMPER' ? <PaymentsPage /> : <SalespersonPaymentsPage />
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
          <Route path="/my-leads" element={<div className="p-8 text-gray-500">My leads — coming soon</div>} />
          <Route path="/schedule" element={<div className="p-8 text-gray-500">Schedule — coming soon</div>} />
          <Route path="/payments" element={<PaymentsRoute />} />
          <Route path="/payments/:bootcamperId/:programId" element={<BootcamperPaymentDetailPage />} />
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
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
