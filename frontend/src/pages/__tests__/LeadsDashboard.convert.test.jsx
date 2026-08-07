import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, convertLead, getPrograms } from '../../api/leads.api';
import { getCohorts } from '../../api/programs.api';

vi.mock('../../api/leads.api', () => ({
  getLeads: vi.fn(),
  assignLead: vi.fn(),
  releaseLead: vi.fn(),
  adminReassignLead: vi.fn(),
  getInteractions: vi.fn().mockResolvedValue([]),
  createLead: vi.fn(),
  createInteraction: vi.fn(),
  updateInteraction: vi.fn(),
  convertLead: vi.fn(),
  resendInvitation: vi.fn(),
  verifyBootcamper: vi.fn(),
  getPrograms: vi.fn(),
  updateLeadStatus: vi.fn(),
  discardLead: vi.fn(),
  restoreLead: vi.fn(),
  updateLead: vi.fn(),
  getSelfAssignmentSetting: vi.fn(),
  updateSelfAssignmentSetting: vi.fn(),
}));

vi.mock('../../api/programs.api', () => ({
  getCohorts: vi.fn(),
}));

vi.mock('../../api/users.api', () => ({
  getUsers: vi.fn().mockResolvedValue({ results: [] }),
}));

const PROGRAMA = {
  id: 'prog-1',
  name: 'Python Full Stack',
  start_date: '2026-09-01',
  total_cost: '1500.00',
};

// Sólo se convierte un lead propio y calificado: es lo que habilita la acción.
const LEAD = {
  id: 'lead-1',
  name: 'Ana Vera',
  phone: '0991234567',
  email: 'ana@test.com',
  status: 'QUALIFIED',
  owner: 's1',
  source: 'MANUAL',
  interaction_count: 1,
};

const COHORTES = [
  {
    id: 'coh-2',
    number: 2,
    start_month: '2026-07-01',
    end_month: '2026-11-01',
    status: 'IN_PROGRESS',
    status_label: 'En curso',
  },
  {
    id: 'coh-3',
    number: 3,
    start_month: '2026-10-01',
    end_month: '2027-02-01',
    status: 'UPCOMING',
    status_label: 'Próximamente',
  },
  {
    id: 'coh-1',
    number: 1,
    start_month: '2026-01-01',
    end_month: '2026-06-01',
    status: 'FINISHED',
    status_label: 'Finalizada',
  },
];

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LeadsDashboard />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

async function abrirModal(user) {
  await screen.findByText('Ana Vera');
  // El menú de la fila esconde la acción de convertir.
  const fila = screen.getByText('Ana Vera').closest('tr') ?? document.body;
  const menus = within(fila).getAllByRole('button');
  await user.click(menus[menus.length - 1]);
  await user.click(await screen.findByRole('button', { name: /convertir lead/i }));
  return screen.findByText(/convirtiendo a/i);
}

async function elegirPrograma(user) {
  await user.click(screen.getByTestId('convert-program'));
  await user.click(await screen.findByText(new RegExp(PROGRAMA.name)));
}

describe('LeadsDashboard — convertir con cohorte y descuento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
    getLeads.mockResolvedValue({
      my_leads: [LEAD], available_leads: [], pagination: {},
    });
    getPrograms.mockResolvedValue([PROGRAMA]);
    getCohorts.mockResolvedValue(COHORTES);
    convertLead.mockResolvedValue({ email: 'ana@test.com', invitation_link: 'https://app.test/onboarding/tok' });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('no pide cohortes hasta que se elige un programa', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);

    expect(getCohorts).not.toHaveBeenCalled();
    expect(screen.queryByTestId('convert-cohort')).not.toBeInTheDocument();
  });

  it('ofrece las cohortes del programa elegido', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    expect(await screen.findByTestId('convert-cohort')).toBeInTheDocument();
    expect(getCohorts).toHaveBeenCalledWith('prog-1');
  });

  it('no ofrece las cohortes finalizadas', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    await user.click(await screen.findByTestId('convert-cohort'));

    // El backend rechaza inscribir en una finalizada, así que no se propone.
    expect(screen.getByText(/Cohorte 2/)).toBeInTheDocument();
    expect(screen.getByText(/Cohorte 3/)).toBeInTheDocument();
    expect(screen.queryByText(/Cohorte 1/)).not.toBeInTheDocument();
  });

  it('avisa cuando el programa no tiene cohortes asignables', async () => {
    const user = userEvent.setup();
    getCohorts.mockResolvedValue([COHORTES[2]]); // sólo la finalizada
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    expect(await screen.findByText(/no tiene cohortes próximas ni en curso/i)).toBeInTheDocument();
    expect(screen.queryByTestId('convert-cohort')).not.toBeInTheDocument();
  });

  it('muestra el precio con descuento y el original tachado', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    const campo = screen.getByTestId('convert-discount');
    await user.clear(campo);
    await user.type(campo, '25');

    expect(await screen.findByText('$1,125.00')).toBeInTheDocument();
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  it('sin descuento muestra el precio completo y nada tachado', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    expect(await screen.findByText('$1,500.00')).toBeInTheDocument();
    expect(screen.queryByText(/en vez de/i)).not.toBeInTheDocument();
  });

  it('rechaza un descuento fuera de 0 a 100 sin llamar al backend', async () => {
    const user = userEvent.setup();
    renderDashboard();
    const dialog = await abrirModal(user);
    await elegirPrograma(user);

    await user.type(screen.getByTestId('convert-cedula'), '1713175071');
    const campo = screen.getByTestId('convert-discount');
    await user.clear(campo);
    await user.type(campo, '150');
    await user.click(screen.getByRole('button', { name: /convertir a bootcamper/i }));
    expect(await screen.findByText(/el descuento va de 0 a 100/i)).toBeInTheDocument();
    expect(convertLead).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('manda la cohorte y el porcentaje, nunca el precio', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    await user.type(screen.getByTestId('convert-cedula'), '1713175071');
    await user.click(await screen.findByTestId('convert-cohort'));
    await user.click(screen.getByText(/Cohorte 3/));

    const campo = screen.getByTestId('convert-discount');
    await user.clear(campo);
    await user.type(campo, '10');

    await user.click(screen.getByRole('button', { name: /convertir a bootcamper/i }));

    const payload = convertLead.mock.calls[0][1];
    expect(payload).toMatchObject({
      program_id: 'prog-1',
      cohort_id: 'coh-3',
      discount_percentage: '10',
    });
    // El precio lo calcula el backend: mandarlo permitiría fijar cualquier monto.
    expect(payload).not.toHaveProperty('agreed_price');
  });

  it('no manda el descuento cuando es cero', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    await user.type(screen.getByTestId('convert-cedula'), '1713175071');
    await user.click(await screen.findByTestId('convert-cohort'));
    await user.click(screen.getByText(/Cohorte 3/));

    // El descuento es obligatorio: se ingresa 0 explícito y no se manda al backend.
    const campo = screen.getByTestId('convert-discount');
    await user.clear(campo);
    await user.type(campo, '0');
    await user.click(screen.getByRole('button', { name: /convertir a bootcamper/i }));

    expect(convertLead.mock.calls[0][1]).not.toHaveProperty('discount_percentage');
  });

  it('la cohorte se olvida al cambiar de programa', async () => {
    const user = userEvent.setup();
    const otro = { ...PROGRAMA, id: 'prog-2', name: 'Data Science' };
    getPrograms.mockResolvedValue([PROGRAMA, otro]);
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    await user.click(await screen.findByTestId('convert-cohort'));
    await user.click(screen.getByText(/Cohorte 3/));

    // Cambiar de programa invalida la elección anterior: la cohorte se resetea.
    await user.click(screen.getByTestId('convert-program'));
    await user.click(await screen.findByText(/Data Science/));

    await user.type(screen.getByTestId('convert-cedula'), '1713175071');
    const campo = screen.getByTestId('convert-discount');
    await user.clear(campo);
    await user.type(campo, '0');
    await user.click(screen.getByRole('button', { name: /convertir a bootcamper/i }));

    // Como la cohorte es obligatoria y quedó vacía, no se convierte hasta elegir otra.
    // Se busca el error exacto (con punto) para no chocar con el placeholder del select.
    expect(convertLead).not.toHaveBeenCalled();
    expect(await screen.findByText('Selecciona una cohorte.')).toBeInTheDocument();
  });

  it('la pantalla de éxito muestra el link de invitación y ninguna contraseña', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirModal(user);
    await elegirPrograma(user);

    await user.type(screen.getByTestId('convert-cedula'), '1713175071');
    await user.click(await screen.findByTestId('convert-cohort'));
    await user.click(screen.getByText(/Cohorte 3/));
    const campo = screen.getByTestId('convert-discount');
    await user.clear(campo);
    await user.type(campo, '0');
    await user.click(screen.getByRole('button', { name: /convertir a bootcamper/i }));

    expect(await screen.findByDisplayValue('https://app.test/onboarding/tok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copiar/i })).toBeInTheDocument();
    expect(screen.queryByText(/contraseña temporal/i)).not.toBeInTheDocument();
  });
});
