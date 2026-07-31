import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AnalyticsCharts from '../AnalyticsCharts'
import { useAnalyticsKpis } from '../../../hooks/use-analytics-kpis'

vi.mock('../../../hooks/use-analytics-kpis', () => ({
  useAnalyticsKpis: vi.fn(),
}))

// ResponsiveContainer no tiene dimensiones en jsdom; forzamos un tamaño fijo
// para que los gráficos monten y no ensucien la salida con warnings.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: 600, height: 260 }}>{children}</div>
    ),
  }
})

const sampleKpis = {
  conversion_rate: { by_segment: [{ segment: 'INSTAGRAM', total_leads: 10, converted_leads: 3, rate_percentage: 30 }] },
  response_time: { series: [{ period_start: '2026-07-01', avg_hours: 4.5, count: 5 }] },
  lead_velocity: { series: [{ period_start: '2026-07-01', count: 7 }] },
  payment_collection: { by_program: [{ program_name: 'Full Stack', expected_amount: '1000.00', collected_amount: '750.00', is_critical: false }] },
}

describe('AnalyticsCharts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra estado de carga', () => {
    useAnalyticsKpis.mockReturnValue({ isLoading: true })
    render(<AnalyticsCharts />)
    expect(screen.getByText(/Cargando analíticas/i)).toBeInTheDocument()
  })

  it('muestra error de permisos en 403', () => {
    useAnalyticsKpis.mockReturnValue({ isError: true, error: { response: { status: 403 } } })
    render(<AnalyticsCharts />)
    expect(screen.getByText(/permisos de administrador/i)).toBeInTheDocument()
  })

  it('renderiza los cuatro gráficos con datos', () => {
    useAnalyticsKpis.mockReturnValue({ data: sampleKpis })
    render(<AnalyticsCharts />)
    expect(screen.getByText(/Tasa de conversión por segmento/i)).toBeInTheDocument()
    expect(screen.getByText(/Tiempo de respuesta promedio/i)).toBeInTheDocument()
    expect(screen.getByText(/Velocidad de leads/i)).toBeInTheDocument()
    expect(screen.getByText(/Cobro por programa/i)).toBeInTheDocument()
  })

  it('marca los paneles vacíos cuando no hay datos', () => {
    useAnalyticsKpis.mockReturnValue({ data: {} })
    render(<AnalyticsCharts />)
    expect(screen.getAllByText(/Sin datos para este período/i).length).toBeGreaterThan(0)
  })
})
