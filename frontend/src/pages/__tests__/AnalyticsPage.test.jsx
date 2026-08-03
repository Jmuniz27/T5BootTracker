import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnalyticsPage from '../AnalyticsPage';
import { getAnalyticsKpis, getLeadManagementMetrics } from '../../api/analytics.api';
import { getSalespeopleActivity } from '../../api/salespeople.api';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../api/salespeople.api', () => ({
  getSalespeopleActivity: vi.fn(),
  getSalespersonActivity: vi.fn(),
}));

const VENDEDORES = [
  {
    salesperson_id: 'sp-1',
    salesperson: 'Vendedor Uno',
    email: 'uno@boottracker.com',
    assigned_leads: 12,
    converted_leads: 3,
    uncontacted_leads: 2,
    conversion_rate: 25,
  },
  {
    salesperson_id: 'sp-2',
    salesperson: 'Vendedor Dos',
    email: 'dos@boottracker.com',
    assigned_leads: 0,
    converted_leads: 0,
    uncontacted_leads: 0,
    conversion_rate: 0,
  },
];

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
    getSalespeopleActivity.mockResolvedValue(VENDEDORES);
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
    await user.type(screen.getByLabelText('Desde'), '2026-01-15');

    await waitFor(() => {
      expect(getAnalyticsKpis).toHaveBeenLastCalledWith(
        expect.objectContaining({ fecha_desde: '2026-01-15' }),
      );
    });
  });

  describe('pestaña Vendedor', () => {
    async function abrirVendedor(user) {
      await user.click(screen.getByRole('tab', { name: 'Vendedor' }));
      return screen.findByText('Vendedor Uno');
    }

    it('arranca en Vista General y no pide los vendedores hasta abrir la pestaña', async () => {
      renderPage();
      await screen.findByLabelText(/desde/i);

      expect(screen.getByRole('tab', { name: 'Vista General' })).toHaveAttribute('aria-selected', 'true');
      expect(getSalespeopleActivity).not.toHaveBeenCalled();
    });

    it('muestra la actividad comercial de cada vendedor', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByLabelText(/desde/i);
      await abrirVendedor(user);

      const card = screen.getByText('Vendedor Uno').closest('button');
      expect(card).toHaveTextContent('12');
      expect(card).toHaveTextContent('leads asignados');
      expect(card).toHaveTextContent('25%');
      expect(card).toHaveTextContent('3 de 12');
      expect(card).toHaveTextContent('2 sin contactar');
    });

    it('incluye al vendedor sin leads, en cero', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByLabelText(/desde/i);
      await abrirVendedor(user);

      const card = screen.getByText('Vendedor Dos').closest('button');
      // Omitirlo daría la impresión de que el vendedor no existe.
      expect(card).toHaveTextContent('0');
      expect(card).not.toHaveTextContent('Convertidos');
      expect(card).not.toHaveTextContent('sin contactar');
    });

    it('no muestra montos: el cobro se consulta en Finanzas', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByLabelText(/desde/i);
      await user.click(screen.getByRole('tab', { name: 'Vendedor' }));
      await screen.findByText('Vendedor Uno');

      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });

    it('la tarjeta abre el rendimiento de ese vendedor', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByLabelText(/desde/i);
      await abrirVendedor(user);

      await user.click(screen.getByText('Vendedor Uno'));

      expect(navigate).toHaveBeenCalledWith('/analytics/vendedor/sp-1');
    });

    it('no ofrece ninguna acción de escritura', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByLabelText(/desde/i);
      await abrirVendedor(user);

      expect(screen.queryByRole('button', { name: /aprobar|rechazar|editar|reasignar/i }))
        .not.toBeInTheDocument();
    });

    it('muestra un estado vacío cuando no hay vendedores', async () => {
      const user = userEvent.setup();
      getSalespeopleActivity.mockResolvedValue([]);
      renderPage();
      await screen.findByLabelText(/desde/i);

      await user.click(screen.getByRole('tab', { name: 'Vendedor' }));

      expect(await screen.findByText(/no hay vendedores activos/i)).toBeInTheDocument();
    });

    it('avisa si la carga de vendedores falla', async () => {
      const user = userEvent.setup();
      getSalespeopleActivity.mockRejectedValue(new Error('boom'));
      renderPage();
      await screen.findByLabelText(/desde/i);

      await user.click(screen.getByRole('tab', { name: 'Vendedor' }));

      expect(await screen.findByText(/no pudimos cargar los vendedores/i)).toBeInTheDocument();
    });

    it('vuelve a Vista General sin perder los datos', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByLabelText(/desde/i);
      await abrirVendedor(user);

      await user.click(screen.getByRole('tab', { name: 'Vista General' }));

      expect(await screen.findByLabelText(/desde/i)).toBeInTheDocument();
      expect(screen.queryByText('Vendedor Uno')).not.toBeInTheDocument();
    });
  });
});
