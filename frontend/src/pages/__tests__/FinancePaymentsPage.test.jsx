import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinancePaymentsPage from '../FinancePaymentsPage';
import {
  assignBootcamper,
  getBootcamperPool,
  getBootcamperAssignmentSetting,
  releaseBootcamper,
} from '../../api/payments.api';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../api/payments.api', () => ({
  getBootcamperPool: vi.fn(),
  assignBootcamper: vi.fn(),
  releaseBootcamper: vi.fn(),
  getPrograms: vi.fn(),
  getBootcamperAssignmentSetting: vi.fn(),
}));

vi.mock('../../api/programs.api', () => ({
  getCohorts: vi.fn(),
}));

const MIA = {
  bootcamper_id: 'bc-1',
  bootcamper_name: 'Ana Torres',
  email: 'ana@test.com',
  program_id: 'prog-1',
  program_name: 'Python Full Stack',
  total_cost: '1200.00',
  total_paid: '600.00',
  pending_payments: 1,
  payment_status: 'AT_RISK',
};

const EN_POOL = {
  bootcamper_id: 'bc-2',
  bootcamper_name: 'Luis Vera',
  email: 'luis@test.com',
  program_id: 'prog-1',
  program_name: 'Python Full Stack',
  total_cost: '1200.00',
  total_paid: '0.00',
  pending_payments: 0,
  payment_status: 'CRITICAL',
};

function poolResponse({ mine = [MIA], available = [EN_POOL] } = {}) {
  return {
    my_bootcampers: mine,
    available_bootcampers: available,
    pagination: {
      page: 1,
      page_size: 100,
      my_bootcampers_count: mine.length,
      available_bootcampers_count: available.length,
      my_bootcampers_total_pages: 1,
      available_bootcampers_total_pages: 1,
    },
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FinancePaymentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La tarjeta que contiene el nombre dado. */
function cardFor(name) {
  return screen.getByText(name).closest('.rounded-2xl');
}

describe('FinancePaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBootcamperAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
    getBootcamperPool.mockResolvedValue(poolResponse());
  });

  it('separa la cartera propia del pool disponible', async () => {
    renderPage();

    expect(await screen.findByText('Mis bootcampers')).toBeInTheDocument();
    expect(screen.getByText('Disponibles')).toBeInTheDocument();
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText('Luis Vera')).toBeInTheDocument();
  });

  it('ofrece asignarse los del pool y liberar los propios', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    expect(within(cardFor('Luis Vera')).getByRole('button', { name: /asignarme/i })).toBeInTheDocument();
    expect(within(cardFor('Ana Torres')).getByRole('button', { name: /liberar/i })).toBeInTheDocument();
    // El propio no se ofrece de nuevo, ni el del pool se puede liberar.
    expect(within(cardFor('Ana Torres')).queryByRole('button', { name: /asignarme/i })).not.toBeInTheDocument();
    expect(within(cardFor('Luis Vera')).queryByRole('button', { name: /liberar/i })).not.toBeInTheDocument();
  });

  it('toma un bootcamper del pool', async () => {
    const user = userEvent.setup();
    assignBootcamper.mockResolvedValue([EN_POOL]);
    renderPage();
    await screen.findByText('Luis Vera');

    await user.click(within(cardFor('Luis Vera')).getByRole('button', { name: /asignarme/i }));

    expect(assignBootcamper.mock.calls[0][0]).toBe('bc-2');
    expect(await screen.findByText(/bootcamper asignado/i)).toBeInTheDocument();
  });

  it('avisa cuando otra persona se lo llevó primero', async () => {
    const user = userEvent.setup();
    assignBootcamper.mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'Este bootcamper ya lo está monitoreando otra persona.' },
      },
    });
    renderPage();
    await screen.findByText('Luis Vera');

    await user.click(within(cardFor('Luis Vera')).getByRole('button', { name: /asignarme/i }));

    expect(
      await screen.findByText('Este bootcamper ya lo está monitoreando otra persona.'),
    ).toBeInTheDocument();
  });

  it('devuelve un bootcamper al pool', async () => {
    const user = userEvent.setup();
    releaseBootcamper.mockResolvedValue([MIA]);
    renderPage();
    await screen.findByText('Ana Torres');

    await user.click(within(cardFor('Ana Torres')).getByRole('button', { name: /liberar/i }));

    expect(releaseBootcamper.mock.calls[0][0]).toBe('bc-1');
    expect(await screen.findByText(/devuelto al pool/i)).toBeInTheDocument();
  });

  it('abre el detalle de pagos al tocar la tarjeta', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Ana Torres'));

    expect(navigate).toHaveBeenCalledWith('/payments/bc-1/prog-1', { state: { bc: MIA } });
  });

  it('las estadísticas cuentan sólo la cartera propia', async () => {
    renderPage();
    await screen.findByText('Ana Torres');

    // Luis está en crítico pero sigue en el pool: no es responsabilidad de nadie.
    const criticos = screen.getByText('Críticos').closest('div');
    expect(criticos).toHaveTextContent('0');
  });

  it('invita a tomar del pool cuando no monitorea a nadie', async () => {
    getBootcamperPool.mockResolvedValue(poolResponse({ mine: [] }));
    renderPage();

    expect(await screen.findByText(/todavía no monitoreás a nadie/i)).toBeInTheDocument();
  });

  it('avisa cuando el pool está vacío', async () => {
    getBootcamperPool.mockResolvedValue(poolResponse({ available: [] }));
    renderPage();

    expect(await screen.findByText(/no hay bootcampers esperando/i)).toBeInTheDocument();
  });

  it('busca contra el backend en vez de filtrar la página', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Torres');

    await user.type(screen.getByPlaceholderText(/buscar bootcamper/i), 'ana');

    // Paginado en el servidor: filtrar sólo lo ya traído escondería resultados.
    expect(getBootcamperPool).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'ana' }),
    );
  });
});

describe('FinancePaymentsPage — pagos finalizados y cohorte', () => {
  const DEBE = {
    bootcamper_id: 'bc-90',
    bootcamper_name: 'Ana Debe',
    email: 'debe@test.com',
    program_id: 'prog-1',
    program_name: 'Python Full Stack',
    cohort_number: 2,
    total_cost: '1200.00',
    total_paid: '400.00',
    pending_payments: 1,
    payment_status: 'CRITICAL',
    is_fully_paid: false,
  };

  const PAGO = {
    ...DEBE,
    bootcamper_id: 'bc-91',
    bootcamper_name: 'Luis Pago',
    email: 'pago@test.com',
    cohort_number: 5,
    total_paid: '1200.00',
    payment_status: 'ON_TRACK',
    is_fully_paid: true,
  };

  function renderCon(mine) {
    getBootcamperPool.mockResolvedValue({
      my_bootcampers: mine, available_bootcampers: [], pagination: {},
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FinancePaymentsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => vi.clearAllMocks());

  it('arranca en En cobro y no muestra a quien ya pagó', async () => {
    renderCon([DEBE, PAGO]);

    expect(await screen.findByText('Ana Debe')).toBeInTheDocument();
    expect(screen.queryByText('Luis Pago')).not.toBeInTheDocument();
  });

  it('la pestaña de finalizados muestra a quien completó', async () => {
    const user = userEvent.setup();
    renderCon([DEBE, PAGO]);
    await screen.findByText('Ana Debe');

    await user.click(screen.getByRole('tab', { name: /pagos finalizados/i }));

    expect(screen.getByText('Luis Pago')).toBeInTheDocument();
    expect(screen.queryByText('Ana Debe')).not.toBeInTheDocument();
  });

  it('las estadísticas cuentan sólo lo que falta cobrar', async () => {
    renderCon([DEBE, PAGO]);
    await screen.findByText('Ana Debe');

    // Quien ya pagó no debe inflar el total de la cartera en cobro.
    expect(screen.getByRole('tab', { name: /en cobro \(1\)/i })).toBeInTheDocument();
  });

  it('la tarjeta dice programa y cohorte', async () => {
    renderCon([DEBE]);
    await screen.findByText('Ana Debe');

    expect(screen.getByText(/Cohorte 2/)).toBeInTheDocument();
  });

  it('avisa cuando nadie completó el pago', async () => {
    const user = userEvent.setup();
    renderCon([DEBE]);
    await screen.findByText('Ana Debe');

    await user.click(screen.getByRole('tab', { name: /pagos finalizados/i }));

    expect(screen.getByText(/todavía nadie completó el pago/i)).toBeInTheDocument();
  });

  it('el filtro de cohorte sólo aparece con un programa elegido', async () => {
    renderCon([DEBE]);
    await screen.findByText('Ana Debe');

    // Suelto no identifica nada: el número se repite entre programas.
    expect(screen.queryByRole('button', { name: /filtrar por cohorte/i })).not.toBeInTheDocument();
  });
});

describe('FinancePaymentsPage — auto-asignación deshabilitada', () => {
  const DISPONIBLE = {
    bootcamper_id: 'bc-80',
    bootcamper_name: 'Sin Responsable',
    email: 'pool@test.com',
    program_id: 'prog-1',
    program_name: 'Python Full Stack',
    total_cost: '1200.00',
    total_paid: '0.00',
    pending_payments: 0,
    payment_status: 'CRITICAL',
    is_fully_paid: false,
  };

  function renderCon(enabled) {
    getBootcamperPool.mockResolvedValue({
      my_bootcampers: [], available_bootcampers: [DISPONIBLE], pagination: {},
    });
    getBootcamperAssignmentSetting.mockResolvedValue({ self_assign_enabled: enabled });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FinancePaymentsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => vi.clearAllMocks());

  it('deja asignarse cuando está habilitada', async () => {
    renderCon(true);
    await screen.findByText('Sin Responsable');

    expect(screen.getByRole('button', { name: /asignarme/i })).toBeEnabled();
  });

  it('deshabilita el botón cuando el admin la apagó', async () => {
    renderCon(false);
    await screen.findByText('Sin Responsable');

    // Ofrecerlo sería engañoso: el backend responde 403.
    expect(await screen.findByRole('button', { name: /asignarme/i })).toBeDisabled();
  });

  it('explica por qué no se puede tomar del pool', async () => {
    renderCon(false);

    expect(
      await screen.findByText(/el administrador deshabilitó la auto-asignación/i),
    ).toBeInTheDocument();
  });

  it('no llama al backend si el botón está deshabilitado', async () => {
    const user = userEvent.setup();
    renderCon(false);
    await screen.findByText('Sin Responsable');

    await user.click(await screen.findByRole('button', { name: /asignarme/i }));

    expect(assignBootcamper).not.toHaveBeenCalled();
  });
});
