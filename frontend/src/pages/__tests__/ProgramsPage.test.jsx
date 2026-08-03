import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProgramsPage from '../ProgramsPage';
import { getPrograms, createProgram } from '../../api/programs.api';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../api/programs.api', () => ({
  getPrograms: vi.fn(),
  createProgram: vi.fn(),
}));

const PROGRAMAS = [
  {
    id: 'prog-1',
    name: 'Python Full Stack',
    total_cost: '1200.00',
    is_active: true,
    cohort_count: 3,
  },
  {
    id: 'prog-2',
    name: 'Data Science',
    total_cost: '1500.00',
    is_active: false,
    cohort_count: 1,
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProgramsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProgramsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPrograms.mockResolvedValue(PROGRAMAS);
  });

  it('lista los programas con su conteo de cohortes', async () => {
    renderPage();

    expect(await screen.findByText('Python Full Stack')).toBeInTheDocument();
    expect(screen.getByText('Data Science')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('singulariza el conteo cuando hay una sola cohorte', async () => {
    renderPage();
    await screen.findByText('Data Science');

    expect(screen.getByText('cohorte')).toBeInTheDocument();
    expect(screen.getByText('cohortes')).toBeInTheDocument();
  });

  it('marca los programas inactivos', async () => {
    renderPage();
    await screen.findByText('Data Science');

    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('navega al detalle al elegir un programa', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Python Full Stack'));

    expect(navigate).toHaveBeenCalledWith('/admin/programs/prog-1');
  });

  it('muestra un estado vacío cuando no hay programas', async () => {
    getPrograms.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/todavía no hay programas/i)).toBeInTheDocument();
  });

  it('avisa si la carga falla', async () => {
    getPrograms.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(/no pudimos cargar los programas/i)).toBeInTheDocument();
  });

  it('exige la fecha de fin posterior a la de inicio', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Python Full Stack');

    await user.click(screen.getByRole('button', { name: /nuevo programa/i }));
    const dialog = await screen.findByRole('dialog', { name: /nuevo programa/i });

    await user.type(within(dialog).getByLabelText(/nombre/i), 'Nuevo');
    await user.type(within(dialog).getByLabelText(/fecha de inicio/i), '2026-09-01');
    await user.type(within(dialog).getByLabelText(/fecha de fin/i), '2026-08-01');
    await user.type(within(dialog).getByLabelText(/costo total/i), '900');

    await user.click(within(dialog).getByRole('button', { name: /crear programa/i }));

    expect(await within(dialog).findByText(/posterior a la de inicio/i)).toBeInTheDocument();
    expect(createProgram).not.toHaveBeenCalled();
  });

  it('crea un programa con los datos del formulario', async () => {
    const user = userEvent.setup();
    createProgram.mockResolvedValue({ ...PROGRAMAS[0], name: 'Nuevo' });
    renderPage();
    await screen.findByText('Python Full Stack');

    await user.click(screen.getByRole('button', { name: /nuevo programa/i }));
    const dialog = await screen.findByRole('dialog', { name: /nuevo programa/i });

    await user.type(within(dialog).getByLabelText(/nombre/i), 'Nuevo');
    await user.type(within(dialog).getByLabelText(/fecha de inicio/i), '2026-09-01');
    await user.type(within(dialog).getByLabelText(/fecha de fin/i), '2026-12-01');
    await user.type(within(dialog).getByLabelText(/costo total/i), '900');

    await user.click(within(dialog).getByRole('button', { name: /crear programa/i }));

    // Sólo el primer argumento: TanStack Query añade el contexto de la mutación.
    expect(createProgram.mock.calls[0][0]).toEqual({
      name: 'Nuevo',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      total_cost: '900',
    });
  });
});
