import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPortfoliosPage from '../AdminPortfoliosPage';
import { getFinancePortfolio } from '../../api/finance.api';
import { getSalespeopleActivity } from '../../api/salespeople.api';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../api/finance.api', () => ({
  getFinancePortfolio: vi.fn(),
  getFinanceBootcampers: vi.fn(),
}));

vi.mock('../../api/salespeople.api', () => ({
  getSalespeopleActivity: vi.fn(),
}));

const VENDEDORES = [
  {
    salesperson_id: 'sp-1',
    salesperson: 'Vendedor Uno',
    email: 'v1@boottracker.com',
    assigned_leads: 12,
    converted_leads: 3,
    uncontacted_leads: 2,
    conversion_rate: 25.0,
  },
  {
    salesperson_id: 'sp-2',
    salesperson: 'Vendedor Dos',
    email: 'v2@boottracker.com',
    assigned_leads: 0,
    converted_leads: 0,
    uncontacted_leads: 0,
    conversion_rate: 0.0,
  },
];

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
        <AdminPortfoliosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Cambia a la pestaña de vendedores y espera a que cargue. */
async function abrirVendedores(user) {
  await user.click(screen.getByRole('tab', { name: 'Vendedores' }));
  return screen.findByText('Vendedor Uno');
}

describe('AdminPortfoliosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFinancePortfolio.mockResolvedValue({ portfolios: CARTERAS, unassigned_bootcampers: 0 });
    getSalespeopleActivity.mockResolvedValue(VENDEDORES);
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

  describe('pestaña de vendedores', () => {
    it('arranca en Finanzas y no pide los vendedores hasta abrir su pestaña', async () => {
      renderPage();
      await screen.findByText('Finanzas Uno');

      expect(screen.getByRole('tab', { name: 'Finanzas' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByText('Vendedor Uno')).not.toBeInTheDocument();
      expect(getSalespeopleActivity).not.toHaveBeenCalled();
    });

    it('muestra la actividad comercial de cada vendedor', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Finanzas Uno');

      await abrirVendedores(user);

      const card = screen.getByText('Vendedor Uno').closest('div.rounded-2xl');
      expect(card).toHaveTextContent('12');
      expect(card).toHaveTextContent('leads asignados');
      expect(card).toHaveTextContent('25%');
      expect(card).toHaveTextContent('3 de 12');
      expect(card).toHaveTextContent('2 sin contactar');
    });

    it('incluye al vendedor sin leads, en cero', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Finanzas Uno');
      await abrirVendedores(user);

      const card = screen.getByText('Vendedor Dos').closest('div.rounded-2xl');
      // Omitirlo daría la impresión de que el vendedor no existe.
      expect(card).toHaveTextContent('0');
      expect(card).toHaveTextContent('leads asignados');
      // Sin leads no se pinta la barra de conversión ni el aviso de sin contactar.
      expect(card).not.toHaveTextContent('Convertidos');
      expect(card).not.toHaveTextContent('sin contactar');
    });

    it('no muestra montos: el cobro se ve en la otra pestaña', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Finanzas Uno');
      await abrirVendedores(user);

      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });

    it('no ofrece ninguna acción de escritura', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Finanzas Uno');
      await abrirVendedores(user);

      expect(screen.queryByRole('button', { name: /aprobar|rechazar|editar|reasignar/i }))
        .not.toBeInTheDocument();
    });

    it('muestra un estado vacío cuando no hay vendedores', async () => {
      const user = userEvent.setup();
      getSalespeopleActivity.mockResolvedValue([]);
      renderPage();
      await screen.findByText('Finanzas Uno');

      await user.click(screen.getByRole('tab', { name: 'Vendedores' }));

      expect(await screen.findByText(/no hay vendedores activos/i)).toBeInTheDocument();
    });

    it('avisa si la carga de vendedores falla', async () => {
      const user = userEvent.setup();
      getSalespeopleActivity.mockRejectedValue(new Error('boom'));
      renderPage();
      await screen.findByText('Finanzas Uno');

      await user.click(screen.getByRole('tab', { name: 'Vendedores' }));

      expect(await screen.findByText(/no pudimos cargar los vendedores/i)).toBeInTheDocument();
    });

    it('vuelve a Finanzas sin perder los datos', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Finanzas Uno');
      await abrirVendedores(user);

      await user.click(screen.getByRole('tab', { name: 'Finanzas' }));

      expect(await screen.findByText('Finanzas Uno')).toBeInTheDocument();
      expect(screen.queryByText('Vendedor Uno')).not.toBeInTheDocument();
    });
  });
});
