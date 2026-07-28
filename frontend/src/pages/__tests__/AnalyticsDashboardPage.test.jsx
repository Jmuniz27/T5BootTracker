import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AnalyticsDashboardPage from '../AnalyticsDashboardPage'
import { getDashboard } from '../../api/analytics.api'
import { getPrograms } from '../../api/payments.api'

vi.mock('../../api/analytics.api', () => ({ getDashboard: vi.fn() }))
vi.mock('../../api/payments.api', () => ({ getPrograms: vi.fn() }))

const FIXTURE = {
  kpis: {
    total_leads: 428,
    leads_delta_pct: 12.4,
    conversion_rate: 0.31,
    conversion_delta_pct: -2.1,
    revenue_collected: 48250,
    revenue_delta_pct: 8.7,
    pending_payments: 17,
  },
  leads_over_time: [{ date: '2026-07-01', new_leads: 10, converted: 3 }],
  revenue_over_time: [{ date: '2026-07-01', collected: 900, expected: 1200 }],
  leads_by_status: [{ status: 'NEW', count: 120 }],
  conversion_funnel: [{ stage: 'Lead', count: 428 }],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AnalyticsDashboardPage />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('AnalyticsDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPrograms.mockResolvedValue([])
    getDashboard.mockResolvedValue(FIXTURE)
  })

  it('renders KPI cards with values from the API', async () => {
    renderPage()
    expect(await screen.findByText('428')).toBeInTheDocument()   // total leads
    expect(screen.getByText('31%')).toBeInTheDocument()          // conversion rate
    expect(screen.getByText('17')).toBeInTheDocument()           // pending payments
  })

  it('renders the four chart cards', async () => {
    renderPage()
    expect(await screen.findByText(/Leads en el tiempo/i)).toBeInTheDocument()
    expect(screen.getByText(/Ingresos en el tiempo/i)).toBeInTheDocument()
    expect(screen.getByText(/Leads por estado/i)).toBeInTheDocument()
    expect(screen.getByText(/Embudo de conversión/i)).toBeInTheDocument()
  })

  it('refetches with new params when a filter changes', async () => {
    renderPage()
    await screen.findByText('428')

    const segment = screen.getByLabelText('Segmento')
    fireEvent.change(segment, { target: { value: 'leads' } })

    await waitFor(() =>
      expect(getDashboard).toHaveBeenCalledWith(expect.objectContaining({ segment: 'leads' })),
    )
  })

  it('shows an error state with retry when the API fails', async () => {
    getDashboard.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/No se pudieron cargar las métricas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument()
  })
})
