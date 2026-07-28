import client from './client'
import analyticsDashboardMock from '../mocks/analytics.mock'

// Mock-first toggle: CB-57 ships against a defined contract while CB-55
// (Analytics API) is still a backend stub. Flip VITE_USE_MOCKS=false in
// .env to point the exact same UI at the real endpoint — no component changes.
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

function mockDashboard() {
  // Simulate network latency so loading/skeleton states are demoable.
  return new Promise((resolve) => setTimeout(() => resolve(analyticsDashboardMock), 400))
}

/**
 * GET /api/analytics/dashboard/
 * @param {{ date_from?: string, date_to?: string, segment?: string, program_id?: number }} params
 */
export const getDashboard = (params = {}) => {
  if (USE_MOCKS) return mockDashboard()
  return client.get('/analytics/dashboard/', { params }).then((r) => r.data)
}
