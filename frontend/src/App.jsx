import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import LeadsDashboard from './pages/LeadsDashboard'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<LeadsDashboard />} />
        <Route path="/my-leads" element={<LeadsDashboard />} />
        <Route path="/schedule" element={<div className="p-8 text-gray-400">Schedule — coming soon</div>} />
      </Route>
    </Routes>
  )
}
