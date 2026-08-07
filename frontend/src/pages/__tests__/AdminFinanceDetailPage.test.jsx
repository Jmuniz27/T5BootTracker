import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminFinanceDetailPage from '../AdminFinanceDetailPage';
import { getFinanceBootcampers } from '../../api/finance.api';
import { releaseBootcamper } from '../../api/payments.api';

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

vi.mock('../../api/payments.api', () => ({
  releaseBootcamper: vi.fn(),
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
    releaseBootcamper.mockResolvedValue([]);
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

  it('no ofrece acciones sobre los pagos del bootcamper', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    // Desasignar sí (el admin reparte la cartera); aprobar, rechazar o editar
    // los pagos siguen siendo de quien cobra.
    expect(screen.queryByRole('button', { name: /aprobar|rechazar|editar|eliminar/i }))
      .not.toBeInTheDocument();
  });

  it('las tarjetas de bootcamper no son enlaces ni navegan', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    // No debe haber forma de entrar a una pantalla con acciones sobre los pagos.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // Volver + slicer (2 píldoras) + un "Desasignar" por tarjeta.
    expect(screen.getAllByRole('button', { name: 'Desasignar' })).toHaveLength(2);
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

describe('AdminFinanceDetailPage — cohortes y programa', () => {
  const EN_CURSO = {
    bootcamper_id: 'bc-10',
    bootcamper_name: 'Ana EnCurso',
    email: 'encurso@test.com',
    program_id: 'prog-1',
    program_name: 'Python Full Stack',
    cohort_number: 2,
    cohort_status: 'IN_PROGRESS',
    pending_payments: 1,
    expected_amount: '1200.00',
    total_paid: '400.00',
    deficit: '800.00',
    critical_count: 1,
    is_fully_paid: false,
  };

  const FINALIZADA = {
    ...EN_CURSO,
    bootcamper_id: 'bc-11',
    bootcamper_name: 'Luis Cerrada',
    email: 'cerrada@test.com',
    program_id: 'prog-2',
    program_name: 'Data Science',
    cohort_number: 5,
    cohort_status: 'FINISHED',
    is_fully_paid: true,
  };

  const SIN_COHORTE = {
    ...EN_CURSO,
    bootcamper_id: 'bc-12',
    bootcamper_name: 'Pedro SinCohorte',
    email: 'sincohorte@test.com',
    cohort_number: null,
    cohort_status: null,
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

  it('arranca en cohortes en curso y esconde las finalizadas', async () => {
    renderConCartera([EN_CURSO, FINALIZADA]);

    expect(await screen.findByText('Ana EnCurso')).toBeInTheDocument();
    expect(screen.queryByText('Luis Cerrada')).not.toBeInTheDocument();
  });

  it('muestra el conteo de cada lado del slicer', async () => {
    renderConCartera([EN_CURSO, FINALIZADA]);

    expect(await screen.findByRole('tab', { name: /en curso \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /finalizadas \(1\)/i })).toBeInTheDocument();
  });

  it('al cambiar de lado aparecen las cohortes finalizadas', async () => {
    const user = userEvent.setup();
    renderConCartera([EN_CURSO, FINALIZADA]);
    await screen.findByText('Ana EnCurso');

    await user.click(screen.getByRole('tab', { name: /finalizadas/i }));

    expect(screen.getByText('Luis Cerrada')).toBeInTheDocument();
    expect(screen.queryByText('Ana EnCurso')).not.toBeInTheDocument();
  });

  it('sin cohorte cuenta como en curso', async () => {
    // Se le sigue cobrando igual: dejarlo fuera de las dos listas lo esconde.
    renderConCartera([SIN_COHORTE]);

    expect(await screen.findByText('Pedro SinCohorte')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /en curso \(1\)/i })).toBeInTheDocument();
  });

  it('la tarjeta dice programa y cohorte', async () => {
    renderConCartera([EN_CURSO]);
    await screen.findByText('Ana EnCurso');

    expect(screen.getByText(/Python Full Stack/)).toBeInTheDocument();
    expect(screen.getByText(/Cohorte 2/)).toBeInTheDocument();
  });

  it('el filtro por programa aparece con más de un programa', async () => {
    renderConCartera([EN_CURSO, FINALIZADA]);
    await screen.findByText('Ana EnCurso');

    expect(screen.getByRole('button', { name: /filtrar por programa/i })).toBeInTheDocument();
  });

  it('no ofrece filtro cuando sólo hay un programa', async () => {
    renderConCartera([EN_CURSO]);
    await screen.findByText('Ana EnCurso');

    expect(screen.queryByRole('button', { name: /filtrar por programa/i })).not.toBeInTheDocument();
  });

  it('filtrar por programa acota los conteos del slicer', async () => {
    const user = userEvent.setup();
    renderConCartera([EN_CURSO, FINALIZADA]);
    await screen.findByText('Ana EnCurso');

    await user.click(screen.getByRole('button', { name: /filtrar por programa/i }));
    await user.click(screen.getByText('Data Science'));

    // Sólo queda el de Data Science, que está en cohorte finalizada.
    expect(screen.getByRole('tab', { name: /en curso \(0\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /finalizadas \(1\)/i })).toBeInTheDocument();
  });

  it('avisa cuando no hay cohortes finalizadas', async () => {
    const user = userEvent.setup();
    renderConCartera([EN_CURSO]);
    await screen.findByText('Ana EnCurso');

    await user.click(screen.getByRole('tab', { name: /finalizadas/i }));

    expect(screen.getByText(/no tiene bootcampers en cohortes finalizadas/i)).toBeInTheDocument();
  });
});

describe('AdminFinanceDetailPage — desasignar', () => {
  function renderPageConMock() {
    getFinanceBootcampers.mockResolvedValue(CARTERA);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminFinanceDetailPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    releaseBootcamper.mockResolvedValue([]);
  });

  it('pide confirmación antes de desasignar', async () => {
    const user = userEvent.setup();
    renderPageConMock();
    await screen.findByText('Ana Torres');

    await user.click(screen.getAllByRole('button', { name: 'Desasignar' })[0]);

    expect(screen.getByRole('button', { name: /sí, desasignar/i })).toBeInTheDocument();
    // Un clic no alcanza: todavía no se llamó al endpoint.
    expect(releaseBootcamper).not.toHaveBeenCalled();
  });

  it('al confirmar libera al bootcamper elegido', async () => {
    const user = userEvent.setup();
    renderPageConMock();
    await screen.findByText('Ana Torres');

    await user.click(screen.getAllByRole('button', { name: 'Desasignar' })[0]);
    await user.click(screen.getByRole('button', { name: /sí, desasignar/i }));

    // TanStack Query pasa un segundo argumento al mutationFn: se afirma el primero.
    expect(releaseBootcamper.mock.calls[0][0]).toBe('bc-1');
    expect(await screen.findByText(/ana torres volvió al pool/i)).toBeInTheDocument();
  });

  it('cancelar cierra la confirmación sin llamar al endpoint', async () => {
    const user = userEvent.setup();
    renderPageConMock();
    await screen.findByText('Ana Torres');

    await user.click(screen.getAllByRole('button', { name: 'Desasignar' })[0]);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('button', { name: /sí, desasignar/i })).not.toBeInTheDocument();
    expect(releaseBootcamper).not.toHaveBeenCalled();
  });

  it('avisa cuando el backend rechaza la desasignación', async () => {
    const user = userEvent.setup();
    releaseBootcamper.mockRejectedValue({
      response: { data: { error: 'Solo quien monitorea a este bootcamper puede liberarlo.' } },
    });
    renderPageConMock();
    await screen.findByText('Ana Torres');

    await user.click(screen.getAllByRole('button', { name: 'Desasignar' })[0]);
    await user.click(screen.getByRole('button', { name: /sí, desasignar/i }));

    expect(await screen.findByText(/solo quien monitorea/i)).toBeInTheDocument();
  });
});
