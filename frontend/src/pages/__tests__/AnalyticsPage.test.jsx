import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnalyticsPage from '../AnalyticsPage';
import { getAnalyticsKpis, getLeadManagementMetrics } from '../../api/analytics.api';

vi.mock('../../api/analytics.api', () => ({
  getAnalyticsKpis: vi.fn(),
  getLeadManagementMetrics: vi.fn(),
}));

const LEAD_MANAGEMENT = {
  leads_considered: 3,
  avg_retention_hours: 12.5,
  avg_time_to_first_contact_hours: 2.4,
  by_salesperson: [],
};

// Recharts mide el contenedor con ResizeObserver, ausente en jsdom.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const KPIS = {
  conversion_rate: { total_leads: 50, converted_leads: 10, rate_percentage: 20, by_segment: [] },
  response_time: {
    avg_hours: 4.5,
    median_hours: 3,
    leads_without_response: 7,
    leads_considered: 50,
    series: [],
  },
  lead_velocity: {
    current_period: { count: 30 },
    previous_period: { count: 24 },
    growth_rate_percentage: 25,
    series: [],
  },
  payment_collection: {
    overall: { collected_amount: 1500, expected_amount: 3000, collection_rate_percentage: 50 },
    by_program: [],
  },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage />
    </QueryClientProvider>,
  );
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLeadManagementMetrics.mockResolvedValue(LEAD_MANAGEMENT);
  });

  it('renderiza el encabezado, los KPIs y los gráficos', async () => {
    getAnalyticsKpis.mockResolvedValue(KPIS);
    renderPage();

    expect(screen.getByRole('heading', { name: /analítica/i })).toBeInTheDocument();
    expect(await screen.findByText('20%')).toBeInTheDocument();
    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument();
  });

  it('hace una sola petición para toda la pantalla (cards y gráficos comparten queryKey)', async () => {
    getAnalyticsKpis.mockResolvedValue(KPIS);
    renderPage();

    await screen.findByText('20%');
    expect(getAnalyticsKpis).toHaveBeenCalledTimes(1);
  });

  it('propaga los filtros al backend al cambiarlos', async () => {
    const user = userEvent.setup();
    getAnalyticsKpis.mockResolvedValue(KPIS);
    renderPage();

    await screen.findByText('20%');
    await user.type(screen.getByLabelText(/campaña/i), 'verano');

    await waitFor(() => {
      expect(getAnalyticsKpis).toHaveBeenLastCalledWith(
        expect.objectContaining({ campaign: 'verano' }),
      );
    });
  });
});
