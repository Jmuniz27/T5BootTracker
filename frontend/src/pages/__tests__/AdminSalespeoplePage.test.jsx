import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSalespeoplePage from '../AdminSalespeoplePage';
import { getSalespeoplePortfolio } from '../../api/salespeople.api';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../api/salespeople.api', () => ({
  getSalespeoplePortfolio: vi.fn(),
  getSalespersonBootcampers: vi.fn(),
}));

const VENDEDORES = [
  {
    salesperson_id: 'sp-1',
    salesperson: 'Vendedor Uno',
    email: 'uno@boottracker.com',
    bootcamper_count: 2,
    expected_amount: '2400.00',
    total_paid: '600.00',
    deficit: '1800.00',
    critical_count: 1,
  },
  {
    salesperson_id: 'sp-2',
    salesperson: 'Vendedor Dos',
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
        <AdminSalespeoplePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminSalespeoplePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSalespeoplePortfolio.mockResolvedValue(VENDEDORES);
  });

  it('lista una tarjeta por vendedor con su cantidad de bootcampers', async () => {
    renderPage();

    expect(await screen.findByText('Vendedor Uno')).toBeInTheDocument();
    expect(screen.getByText('Vendedor Dos')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('incluye al vendedor sin bootcampers, en cero', async () => {
    renderPage();
    const card = (await screen.findByText('Vendedor Dos')).closest('button');

    // Omitirlo daría la impresión de que el vendedor no existe.
    expect(card).toHaveTextContent('0');
    expect(card).toHaveTextContent('bootcampers');
    // Sin cartera no se pinta la barra de cobro.
    expect(card).not.toHaveTextContent('Cobrado');
  });

  it('destaca cuántos están en crítico', async () => {
    renderPage();
    await screen.findByText('Vendedor Uno');

    expect(screen.getByText('1 crítico')).toBeInTheDocument();
  });

  it('no muestra la etiqueta de crítico cuando no hay ninguno', async () => {
    getSalespeoplePortfolio.mockResolvedValue([VENDEDORES[1]]);
    renderPage();
    await screen.findByText('Vendedor Dos');

    expect(screen.queryByText(/crítico/i)).not.toBeInTheDocument();
  });

  it('navega a la cartera del vendedor al abrir la tarjeta', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Vendedor Uno'));

    expect(navigate).toHaveBeenCalledWith('/admin/vendedores/sp-1');
  });

  it('no ofrece ninguna acción de escritura', async () => {
    renderPage();
    await screen.findByText('Vendedor Uno');

    expect(screen.queryByRole('button', { name: /aprobar|rechazar|editar|reasignar/i }))
      .not.toBeInTheDocument();
  });

  it('muestra un estado vacío cuando no hay vendedores', async () => {
    getSalespeoplePortfolio.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no hay vendedores activos/i)).toBeInTheDocument();
  });

  it('avisa si la carga falla', async () => {
    getSalespeoplePortfolio.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(/no pudimos cargar los vendedores/i)).toBeInTheDocument();
  });
});
