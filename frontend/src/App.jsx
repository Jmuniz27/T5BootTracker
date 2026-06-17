import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import CheckEmailPage from './pages/CheckEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ResetSuccessPage from './pages/ResetSuccessPage'
import LeadsDashboard from './pages/LeadsDashboard'
import PaymentsPage from './pages/PaymentsPage'
import PaymentQueuePage from './pages/PaymentQueuePage'
import { useAuthStore } from './store/auth.store'

function PaymentsRoute() {
  const user = useAuthStore((s) => s.user)
  const isBootcamper = user?.role === 'BOOTCAMPER'
  return isBootcamper ? <PaymentsPage /> : <PaymentQueuePage />
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
          <Route path="/dashboard" element={<LeadsDashboard />} />
          <Route path="/my-leads" element={<div className="p-8 text-gray-400">My leads — coming soon</div>} />
          <Route path="/schedule" element={<div className="p-8 text-gray-400">Schedule — coming soon</div>} />
          <Route path="/payments" element={<PaymentsRoute />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
