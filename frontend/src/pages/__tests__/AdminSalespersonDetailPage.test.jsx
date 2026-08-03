import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSalespersonDetailPage from '../AdminSalespersonDetailPage';
import { getSalespersonBootcampers } from '../../api/salespeople.api';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ salespersonId: 'sp-1' }),
  };
});

vi.mock('../../api/salespeople.api', () => ({
  getSalespeoplePortfolio: vi.fn(),
  getSalespersonBootcampers: vi.fn(),
}));

const CARTERA = {
  salesperson_id: 'sp-1',
  salesperson: 'Vendedor Uno',
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
        <AdminSalespersonDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminSalespersonDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalespersonBootcampers.mockResolvedValue(CARTERA);
  });

  it('muestra el nombre del vendedor y sus bootcampers', async () => {
    renderPage();

    expect(await screen.findByText('Vendedor Uno')).toBeInTheDocument();
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

  it('no ofrece ninguna acción sobre el vendedor ni sus pagos', async () => {
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

  it('muestra un estado vacío cuando el vendedor no tiene bootcampers', async () => {
    getSalespersonBootcampers.mockResolvedValue({ ...CARTERA, bootcampers: [] });
    renderPage();

    expect(await screen.findByText(/todavía no tiene bootcampers/i)).toBeInTheDocument();
  });

  it('avisa cuando el id no es de un vendedor', async () => {
    getSalespersonBootcampers.mockRejectedValue({ response: { status: 404 } });
    renderPage();

    expect(await screen.findByText(/no existe o no es un vendedor/i)).toBeInTheDocument();
  });
});
