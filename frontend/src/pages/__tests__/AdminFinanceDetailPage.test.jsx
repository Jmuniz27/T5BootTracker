import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('AdminFinanceDetailPage — pagos finalizados y cohorte', () => {
  const EN_COBRO = {
    bootcamper_id: 'bc-10',
    bootcamper_name: 'Ana Debe',
    email: 'debe@test.com',
    program_name: 'Python Full Stack',
    cohort_number: 2,
    pending_payments: 1,
    expected_amount: '1200.00',
    total_paid: '400.00',
    deficit: '800.00',
    critical_count: 1,
    is_fully_paid: false,
  };

  const FINALIZADO = {
    bootcamper_id: 'bc-11',
    bootcamper_name: 'Luis Pago',
    email: 'pago@test.com',
    program_name: 'Data Science',
    cohort_number: 5,
    pending_payments: 0,
    expected_amount: '1200.00',
    total_paid: '1200.00',
    deficit: '0.00',
    critical_count: 0,
    is_fully_paid: true,
  };

  function renderConCartera(bootcampers) {
    getFinanceBootcampers.mockResolvedValue({ ...CARTERA, bootcampers });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminFinanceDetailPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => vi.clearAllMocks());

  it('arranca en En cobro y esconde a quien ya pagó', async () => {
    renderConCartera([EN_COBRO, FINALIZADO]);

    expect(await screen.findByText('Ana Debe')).toBeInTheDocument();
    expect(screen.queryByText('Luis Pago')).not.toBeInTheDocument();
  });

  it('muestra el conteo de cada pestaña', async () => {
    renderConCartera([EN_COBRO, FINALIZADO]);

    expect(await screen.findByRole('tab', { name: /en cobro \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /pagos finalizados \(1\)/i })).toBeInTheDocument();
  });

  it('al cambiar de pestaña aparece quien ya pagó', async () => {
    const user = userEvent.setup();
    renderConCartera([EN_COBRO, FINALIZADO]);
    await screen.findByText('Ana Debe');

    await user.click(screen.getByRole('tab', { name: /pagos finalizados/i }));

    expect(screen.getByText('Luis Pago')).toBeInTheDocument();
    expect(screen.queryByText('Ana Debe')).not.toBeInTheDocument();
  });

  it('la tarjeta dice programa y cohorte', async () => {
    renderConCartera([EN_COBRO]);
    await screen.findByText('Ana Debe');

    // El cobro se sigue por edición, no sólo por programa.
    expect(screen.getByText(/Python Full Stack/)).toBeInTheDocument();
    expect(screen.getByText(/Cohorte 2/)).toBeInTheDocument();
  });

  it('avisa cuando nadie de la cartera completó el pago', async () => {
    const user = userEvent.setup();
    renderConCartera([EN_COBRO]);
    await screen.findByText('Ana Debe');

    await user.click(screen.getByRole('tab', { name: /pagos finalizados/i }));

    expect(screen.getByText(/nadie de su cartera completó el pago/i)).toBeInTheDocument();
  });

  it('avisa cuando toda la cartera ya pagó', async () => {
    renderConCartera([FINALIZADO]);

    expect(await screen.findByText(/toda su cartera ya completó el pago/i)).toBeInTheDocument();
  });
});
