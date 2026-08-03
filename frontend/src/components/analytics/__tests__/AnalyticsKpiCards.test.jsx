import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnalyticsKpiCards from '../AnalyticsKpiCards';
import { getAnalyticsKpis } from '../../../api/analytics.api';

vi.mock('../../../api/analytics.api', () => ({
  getAnalyticsKpis: vi.fn(),
}));

const KPIS = {
  conversion_rate: { total_leads: 50, converted_leads: 10, rate_percentage: 20 },
  response_time: {
    avg_hours: 4.5,
    median_hours: 3,
    leads_without_response: 7,
    leads_considered: 50,
  },
  lead_velocity: {
    current_period: { count: 30 },
    previous_period: { count: 24 },
    growth_rate_percentage: 25,
  },
  payment_collection: {
    overall: { collected_amount: 1500, expected_amount: 3000, collection_rate_percentage: 50 },
  },
};

function renderCards(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsKpiCards filters={{}} {...props} />
    </QueryClientProvider>,
  );
}

describe('AnalyticsKpiCards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra los cuatro indicadores con sus valores', async () => {
    getAnalyticsKpis.mockResolvedValue(KPIS);
    renderCards();

    expect(await screen.findByText('20%')).toBeInTheDocument();
    expect(screen.getByText('4.5 h')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('muestra el detalle de cada indicador', async () => {
    getAnalyticsKpis.mockResolvedValue(KPIS);
    renderCards();

    expect(await screen.findByText('10 de 50 leads')).toBeInTheDocument();
    expect(screen.getByText(/mediana 3 h · 7 sin respuesta/i)).toBeInTheDocument();
    expect(screen.getByText('Período anterior: 24')).toBeInTheDocument();
  });

  it('muestra la tendencia positiva de velocidad', async () => {
    getAnalyticsKpis.mockResolvedValue(KPIS);
    renderCards();
    expect(await screen.findByText(/▲ 25%/)).toBeInTheDocument();
  });

  it('muestra la tendencia negativa cuando el crecimiento es negativo', async () => {
    getAnalyticsKpis.mockResolvedValue({
      ...KPIS,
      lead_velocity: {
        current_period: { count: 12 },
        previous_period: { count: 24 },
        growth_rate_percentage: -50,
      },
    });
    renderCards();
    expect(await screen.findByText(/▼ 50%/)).toBeInTheDocument();
  });

  it('distingue dato ausente de cero', async () => {
    getAnalyticsKpis.mockResolvedValue({
      ...KPIS,
      conversion_rate: { total_leads: 0, converted_leads: 0, rate_percentage: 0 },
      response_time: { avg_hours: null, median_hours: null, leads_without_response: 0 },
    });
    renderCards();

    // 0% es un dato real; el tiempo de respuesta sin interacciones es "—".
    expect(await screen.findByText('0%')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/sin interacciones registradas/i)).toBeInTheDocument();
  });

  it('avisa que el cobro no responde a segmento cuando ese filtro está activo', async () => {
    getAnalyticsKpis.mockResolvedValue(KPIS);
    renderCards({ filters: { segment: 'INSTAGRAM' } });

    expect(await screen.findByText(/no responde a segmento/i)).toBeInTheDocument();
  });

  it('muestra un error si la petición falla', async () => {
    getAnalyticsKpis.mockRejectedValue(new Error('boom'));
    renderCards();

    expect(await screen.findByText(/no se pudieron cargar los indicadores/i)).toBeInTheDocument();
  });

  it('pasa los filtros al endpoint', async () => {
    getAnalyticsKpis.mockResolvedValue(KPIS);
    const filters = { fecha_desde: '2026-01-01', fecha_hasta: '2026-03-31', segment: 'WHATSAPP' };
    renderCards({ filters });

    await screen.findByText('20%');
    expect(getAnalyticsKpis).toHaveBeenCalledWith(filters);
  });
});
