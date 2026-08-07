import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SalespeopleComparison from '../SalespeopleComparison';
import { getSalespeopleActivity } from '../../../api/salespeople.api';

vi.mock('../../../api/salespeople.api', () => ({
  getSalespeopleActivity: vi.fn(),
  getSalespersonActivity: vi.fn(),
}));

// recharts mide el contenedor con ResizeObserver, que jsdom no trae; sin un
// tamaño concreto no renderiza nada y las aserciones del gráfico no servirían.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const VENDEDORES = [
  {
    salesperson_id: 'v-1',
    salesperson: 'Ana Torres',
    email: 'ana@test.com',
    assigned_leads: 20,
    converted_leads: 5,
    uncontacted_leads: 2,
    conversion_rate: 25,
  },
  {
    salesperson_id: 'v-2',
    salesperson: 'Luis Vera',
    email: 'luis@test.com',
    assigned_leads: 8,
    converted_leads: 4,
    uncontacted_leads: 0,
    conversion_rate: 50,
  },
];

function renderComparison() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SalespeopleComparison />
    </QueryClientProvider>,
  );
}

describe('SalespeopleComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalespeopleActivity.mockResolvedValue(VENDEDORES);
  });

  it('sin seleccionar a nadie invita a elegir', async () => {
    renderComparison();

    expect(await screen.findByText(/marca dos o más vendedores/i)).toBeInTheDocument();
  });

  it('lista a todos los vendedores para elegir', async () => {
    renderComparison();

    expect(await screen.findByRole('checkbox', { name: 'Ana Torres' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Luis Vera' })).toBeInTheDocument();
  });

  it('al marcar dos aparecen lado a lado en la tabla', async () => {
    const user = userEvent.setup();
    renderComparison();

    await user.click(await screen.findByRole('checkbox', { name: 'Ana Torres' }));
    await user.click(screen.getByRole('checkbox', { name: 'Luis Vera' }));

    const filas = screen.getAllByRole('row');
    // Encabezado + dos vendedores.
    expect(filas).toHaveLength(3);
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('muestra leads y convertidos, que son las métricas que pidió la clienta', async () => {
    const user = userEvent.setup();
    renderComparison();

    await user.click(await screen.findByRole('checkbox', { name: 'Ana Torres' }));

    expect(screen.getByText('Leads manejados y convertidos')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-chart')).toBeInTheDocument();
  });

  it('desmarcar quita al vendedor de la comparación', async () => {
    const user = userEvent.setup();
    renderComparison();

    const ana = await screen.findByRole('checkbox', { name: 'Ana Torres' });
    await user.click(ana);
    expect(screen.getAllByRole('row')).toHaveLength(2);

    await user.click(ana);
    expect(await screen.findByText(/marca dos o más vendedores/i)).toBeInTheDocument();
  });

  it('avisa cuando todavía no hay vendedores', async () => {
    getSalespeopleActivity.mockResolvedValue([]);
    renderComparison();

    expect(await screen.findByText(/todavía no hay vendedores/i)).toBeInTheDocument();
  });

  it('avisa si la carga falla en vez de mostrar una comparación vacía', async () => {
    getSalespeopleActivity.mockRejectedValue(new Error('boom'));
    renderComparison();

    expect(await screen.findByText(/no pudimos cargar a los vendedores/i)).toBeInTheDocument();
  });
});
