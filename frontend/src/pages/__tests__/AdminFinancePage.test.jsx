import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminFinancePage from '../AdminFinancePage';
import { getFinancePortfolio } from '../../api/finance.api';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../api/finance.api', () => ({
  getFinancePortfolio: vi.fn(),
  getFinanceBootcampers: vi.fn(),
}));

const CARTERAS = [
  {
    finance_id: 'fin-1',
    finance_name: 'Finanzas Uno',
    email: 'uno@boottracker.com',
    bootcamper_count: 2,
    expected_amount: '2400.00',
    total_paid: '600.00',
    deficit: '1800.00',
    critical_count: 1,
  },
  {
    finance_id: 'fin-2',
    finance_name: 'Finanzas Dos',
    email: 'dos@boottracker.com',
    bootcamper_count: 0,
    expected_amount: '0.00',
    total_paid: '0.00',
    deficit: '0.00',
    critical_count: 0,
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminFinancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminFinancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFinancePortfolio.mockResolvedValue({ portfolios: CARTERAS, unassigned_bootcampers: 0 });
  });

  it('lista una tarjeta por persona de Finanzas con su cantidad de bootcampers', async () => {
    renderPage();

    expect(await screen.findByText('Finanzas Uno')).toBeInTheDocument();
    expect(screen.getByText('Finanzas Dos')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('incluye a quien no tiene bootcampers, en cero', async () => {
    renderPage();
    const card = (await screen.findByText('Finanzas Dos')).closest('button');

    // Omitirla daría la impresión de que la persona no existe.
    expect(card).toHaveTextContent('0');
    expect(card).toHaveTextContent('bootcampers');
    // Sin cartera no se pinta la barra de cobro.
    expect(card).not.toHaveTextContent('Cobrado');
  });

  it('destaca cuántos están en crítico', async () => {
    renderPage();
    await screen.findByText('Finanzas Uno');

    expect(screen.getByText('1 crítico')).toBeInTheDocument();
  });

  it('no muestra la etiqueta de crítico cuando no hay ninguno', async () => {
    getFinancePortfolio.mockResolvedValue({ portfolios: [CARTERAS[1]], unassigned_bootcampers: 0 });
    renderPage();
    await screen.findByText('Finanzas Dos');

    expect(screen.queryByText(/crítico/i)).not.toBeInTheDocument();
  });

  it('navega a la cartera al abrir la tarjeta', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Finanzas Uno'));

    expect(navigate).toHaveBeenCalledWith('/payments/finanzas/fin-1');
  });

  it('no ofrece ninguna acción de escritura', async () => {
    renderPage();
    await screen.findByText('Finanzas Uno');

    expect(screen.queryByRole('button', { name: /aprobar|rechazar|editar|reasignar/i }))
      .not.toBeInTheDocument();
  });

  it('muestra un estado vacío cuando no hay personas de Finanzas', async () => {
    getFinancePortfolio.mockResolvedValue({ portfolios: [], unassigned_bootcampers: 0 });
    renderPage();

    expect(await screen.findByText(/no hay personas de finanzas activas/i)).toBeInTheDocument();
  });

  it('destaca los bootcampers que nadie está cobrando', async () => {
    getFinancePortfolio.mockResolvedValue({ portfolios: CARTERAS, unassigned_bootcampers: 3 });
    renderPage();

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText(/sin responsable de cobro/i)).toBeInTheDocument();
  });

  it('avisa si la carga falla', async () => {
    getFinancePortfolio.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(/no pudimos cargar las carteras/i)).toBeInTheDocument();
  });
});
