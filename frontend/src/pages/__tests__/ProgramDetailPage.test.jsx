import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProgramDetailPage from '../ProgramDetailPage';
import {
  getPrograms,
  getCohorts,
  createCohort,
  updateCohort,
} from '../../api/programs.api';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ programId: 'prog-1' }) };
});

vi.mock('../../api/programs.api', () => ({
  getPrograms: vi.fn(),
  getCohorts: vi.fn(),
  createCohort: vi.fn(),
  updateCohort: vi.fn(),
}));

const PROGRAMA = {
  id: 'prog-1',
  name: 'Python Full Stack',
  total_cost: '1200.00',
  is_active: true,
  cohort_count: 2,
};

const COHORTES = [
  {
    id: 'coh-1',
    program: 'prog-1',
    number: 2,
    start_month: '2026-07-01',
    end_month: null,
    status: 'IN_PROGRESS',
    status_label: 'En curso',
  },
  {
    id: 'coh-2',
    program: 'prog-1',
    number: 1,
    start_month: '2026-01-01',
    end_month: '2026-06-01',
    status: 'FINISHED',
    status_label: 'Finalizada',
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProgramDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProgramDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPrograms.mockResolvedValue([PROGRAMA]);
    getCohorts.mockResolvedValue(COHORTES);
  });

  it('muestra el nombre del programa y sus cohortes en tarjetas', async () => {
    renderPage();

    expect(await screen.findByText('Python Full Stack')).toBeInTheDocument();
    expect(screen.getByText('Cohorte 2')).toBeInTheDocument();
    expect(screen.getByText('Cohorte 1')).toBeInTheDocument();
  });

  it('formatea los meses en texto y sin corrimiento de zona horaria', async () => {
    renderPage();
    await screen.findByText('Cohorte 1');

    // "2026-01-01" debe leerse enero, no diciembre de 2025.
    expect(screen.getByText('enero 2026')).toBeInTheDocument();
    expect(screen.getByText('junio 2026')).toBeInTheDocument();
    expect(screen.getByText('julio 2026')).toBeInTheDocument();
  });

  it('muestra un guion cuando la cohorte no tiene mes de finalización', async () => {
    renderPage();
    await screen.findByText('Cohorte 2');

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('pide las cohortes filtradas al elegir un estado', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cohorte 2');

    await user.click(screen.getByRole('button', { name: /todos los estados/i }));
    await user.click(screen.getByText('Finalizada', { selector: 'li' }));

    expect(getCohorts).toHaveBeenLastCalledWith('prog-1', { status: 'FINISHED' });
  });

  it('no manda el parámetro cuando el filtro es todos', async () => {
    renderPage();
    await screen.findByText('Cohorte 2');

    expect(getCohorts).toHaveBeenCalledWith('prog-1', {});
  });

  it('cambia el estado de una cohorte', async () => {
    const user = userEvent.setup();
    updateCohort.mockResolvedValue({ ...COHORTES[0], status: 'FINISHED', status_label: 'Finalizada' });
    renderPage();
    await screen.findByText('Cohorte 2');

    // El nombre accesible distingue el select de cada tarjeta.
    await user.click(screen.getByRole('button', { name: 'Estado de la cohorte 2' }));
    const card = screen.getByText('Cohorte 2').closest('div.bg-white');
    await user.click(within(card).getByText('Finalizada', { selector: 'li' }));

    expect(updateCohort).toHaveBeenCalledWith('prog-1', 'coh-1', { status: 'FINISHED' });
  });

  it('muestra un estado vacío distinto cuando el filtro no da resultados', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cohorte 2');

    getCohorts.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: /todos los estados/i }));
    await user.click(screen.getByText('Próximamente', { selector: 'li' }));

    expect(await screen.findByText(/ninguna cohorte en este estado/i)).toBeInTheDocument();
  });

  it('sugiere el número siguiente al crear una cohorte', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cohorte 2');

    await user.click(screen.getByRole('button', { name: /nueva cohorte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nueva cohorte/i });

    // La mayor existente es 2, así que propone 3.
    expect(within(dialog).getByDisplayValue('3')).toBeInTheDocument();
  });

  it('pide el fin previsto y explica que se resella al finalizar', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cohorte 2');

    await user.click(screen.getByRole('button', { name: /nueva cohorte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nueva cohorte/i });

    expect(within(dialog).getByLabelText(/fin previsto/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/se resella con el mes real/i)).toBeInTheDocument();
  });

  it('rechaza un fin previsto anterior al inicio', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cohorte 2');

    await user.click(screen.getByRole('button', { name: /nueva cohorte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nueva cohorte/i });

    const inicio = within(dialog).getByLabelText(/mes de inicio/i);
    const fin = within(dialog).getByLabelText(/fin previsto/i);
    await user.clear(inicio);
    await user.type(inicio, '2026-10');
    await user.clear(fin);
    await user.type(fin, '2026-09');

    await user.click(within(dialog).getByRole('button', { name: /crear cohorte/i }));

    expect(await within(dialog).findByText(/no puede ser anterior/i)).toBeInTheDocument();
    expect(createCohort).not.toHaveBeenCalled();
  });

  it('la tarjeta distingue el fin previsto del real', async () => {
    renderPage();
    await screen.findByText('Cohorte 2');

    // La 2 sigue en curso: previsión. La 1 está finalizada: hecho.
    expect(screen.getByText('Fin previsto')).toBeInTheDocument();
    expect(screen.getByText('Finalizó')).toBeInTheDocument();
  });

  it('crea la cohorte mandando el mes con día 1', async () => {
    const user = userEvent.setup();
    createCohort.mockResolvedValue({ ...COHORTES[0], number: 3 });
    renderPage();
    await screen.findByText('Cohorte 2');

    await user.click(screen.getByRole('button', { name: /nueva cohorte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nueva cohorte/i });

    const inicio = within(dialog).getByLabelText(/mes de inicio/i);
    await user.clear(inicio);
    await user.type(inicio, '2026-10');
    const fin = within(dialog).getByLabelText(/fin previsto/i);
    await user.clear(fin);
    await user.type(fin, '2027-01');

    await user.click(within(dialog).getByRole('button', { name: /crear cohorte/i }));

    expect(createCohort.mock.calls[0][1]).toEqual({
      number: 3,
      start_month: '2026-10-01',
      end_month: '2027-01-01',
      status: 'UPCOMING',
    });
  });

  it('avisa cuando el programa no existe', async () => {
    getPrograms.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no encontramos este programa/i)).toBeInTheDocument();
  });
});
