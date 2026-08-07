import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, getSelfAssignmentSetting } from '../../api/leads.api';
import { getUsers } from '../../api/users.api';

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
  rejectBootcamper: vi.fn(),
  getPrograms: vi.fn().mockResolvedValue([]),
  updateLeadStatus: vi.fn(),
  getSelfAssignmentSetting: vi.fn(),
  updateSelfAssignmentSetting: vi.fn(),
}));

vi.mock('../../api/users.api', () => ({
  getUsers: vi.fn(),
}));

const LEAD_ASIGNADO = {
  id: 'lead-1',
  name: 'Lead Asignado',
  phone: '0991111111',
  email: 'asignado@example.com',
  source: 'MANUAL',
  status: 'NEW',
  owner: 'sp-1',
  owner_name: 'Nueva Vendedora',
  is_company: false,
};

const LEAD_SIN_DUENO = {
  id: 'lead-2',
  name: 'Lead Sin Dueño',
  phone: '0992222222',
  email: 'sindueno@example.com',
  source: 'MANUAL',
  status: 'NEW',
  owner: null,
  owner_name: null,
  is_company: false,
};

const SALESPEOPLE = [
  { id: 'sp-1', full_name: 'Nueva Vendedora', role: 'SALESPERSON' },
  { id: 'sp-2', full_name: 'Otro Vendedor', role: 'SALESPERSON' },
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

describe('LeadsDashboard — pestañas y filtro por vendedor del Administrador (HST-025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 'a1', role: 'ADMINISTRATOR' } });
    getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
    getUsers.mockResolvedValue({ results: SALESPEOPLE });
    getLeads.mockResolvedValue({
      my_leads: [],
      available_leads: [],
      all_leads: [LEAD_ASIGNADO, LEAD_SIN_DUENO],
      assigned_leads: [LEAD_ASIGNADO],
      unassigned_leads: [LEAD_SIN_DUENO],
      pagination: {
        all_leads_count: 2,
        assigned_leads_count: 1,
        unassigned_leads_count: 1,
      },
    });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('muestra las pestañas Todos/Asignados/Sin asignar con sus conteos', async () => {
    renderDashboard();

    await screen.findByText('Lead Asignado');
    await vi.waitFor(() => expect(screen.getByTestId('tab-all')).toHaveTextContent('Todos (2)'));
    expect(screen.getByTestId('tab-assigned')).toHaveTextContent('Asignados (1)');
    expect(screen.getByTestId('tab-unassigned')).toHaveTextContent('Sin asignar (1)');
    expect(screen.queryByTestId('tab-mine')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-available')).not.toBeInTheDocument();
  });

  it('arranca en la pestaña "Todos" y muestra ambos leads', async () => {
    renderDashboard();

    expect(await screen.findByText('Lead Asignado')).toBeInTheDocument();
    expect(screen.getByText('Lead Sin Dueño')).toBeInTheDocument();
  });

  it('la pestaña "Asignados" solo muestra leads con dueño', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Lead Asignado');

    await user.click(screen.getByTestId('tab-assigned'));

    expect(await screen.findByText('Lead Asignado')).toBeInTheDocument();
    expect(screen.queryByText('Lead Sin Dueño')).not.toBeInTheDocument();
  });

  it('la pestaña "Sin asignar" solo muestra leads sin dueño', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Lead Asignado');

    await user.click(screen.getByTestId('tab-unassigned'));

    expect(await screen.findByText('Lead Sin Dueño')).toBeInTheDocument();
    expect(screen.queryByText('Lead Asignado')).not.toBeInTheDocument();
  });

  it('filtra por vendedor llamando a getLeads con el uuid elegido', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Lead Asignado');

    await user.click(screen.getByRole('button', { name: /todos los vendedores/i }));
    await user.click(screen.getByRole('button', { name: 'Otro Vendedor' }));

    await vi.waitFor(() => {
      expect(getLeads).toHaveBeenCalledWith(expect.objectContaining({ vendedor: 'sp-2' }));
    });
  });

  it('el vendedor no ve el filtro por vendedor ni las pestañas de admin', async () => {
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
    getLeads.mockResolvedValue({ my_leads: [], available_leads: [], pagination: {} });
    renderDashboard();

    await screen.findByTestId('tab-mine');
    expect(screen.queryByRole('button', { name: /todos los vendedores/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-all')).not.toBeInTheDocument();
  });
});
