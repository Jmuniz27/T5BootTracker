import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminFinanceDetailPage from '../AdminFinanceDetailPage';
import { getFinanceBootcampers } from '../../api/finance.api';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ financeId: 'fin-1' }),
  };
});

vi.mock('../../api/finance.api', () => ({
  getFinancePortfolio: vi.fn(),
  getFinanceBootcampers: vi.fn(),
}));

const CARTERA = {
  finance_id: 'fin-1',
  finance_name: 'Finanzas Uno',
  email: 'uno@boottracker.com',
  bootcampers: [
    {
      bootcamper_id: 'bc-1',
      bootcamper_name: 'Ana Torres',
      email: 'ana@test.com',
      program_count: 1,
      pending_payments: 2,
      expected_amount: '1200.00',
      total_paid: '400.00',
      deficit: '800.00',
      critical_count: 1,
    },
    {
      bootcamper_id: 'bc-2',
      bootcamper_name: 'Luis Vera',
      email: 'luis@test.com',
      program_count: 1,
      pending_payments: 0,
      expected_amount: '1200.00',
      total_paid: '1200.00',
      deficit: '0.00',
      critical_count: 0,
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminFinanceDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminFinanceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFinanceBootcampers.mockResolvedValue(CARTERA);
  });

  it('muestra el nombre de la persona de Finanzas y sus bootcampers', async () => {
    renderPage();

    expect(await screen.findByText('Finanzas Uno')).toBeInTheDocument();
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText('Luis Vera')).toBeInTheDocument();
  });

  it('suma las estadísticas de la cartera', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    // 400 + 1200 cobrado sobre 1200 + 1200 esperado, y un solo crítico.
    expect(screen.getByText('$1,600.00')).toBeInTheDocument();
    expect(screen.getByText('$2,400.00')).toBeInTheDocument();
    expect(screen.getByText('En crítico')).toBeInTheDocument();
  });

  it('marca al bootcamper en crítico y no al que está al día', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  it('muestra los pagos pendientes cuando hay', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    expect(screen.getByText('2 pendientes')).toBeInTheDocument();
  });

  it('no ofrece ninguna acción sobre la cartera ni sus pagos', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    expect(screen.queryByRole('button', { name: /aprobar|rechazar|editar|reasignar|eliminar/i }))
      .not.toBeInTheDocument();
  });

  it('las tarjetas de bootcamper no son enlaces ni botones', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    // Sólo lectura: no debe haber forma de entrar a una pantalla con acciones.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1); // únicamente el "volver"
  });

  it('muestra un estado vacío cuando no tomó ningún bootcamper', async () => {
    getFinanceBootcampers.mockResolvedValue({ ...CARTERA, bootcampers: [] });
    renderPage();

    expect(await screen.findByText(/todavía no tomó ningún bootcamper/i)).toBeInTheDocument();
  });

  it('avisa cuando el id no es de Finanzas', async () => {
    getFinanceBootcampers.mockRejectedValue({ response: { status: 404 } });
    renderPage();

    expect(await screen.findByText(/no existe o no es de finanzas/i)).toBeInTheDocument();
  });
});
