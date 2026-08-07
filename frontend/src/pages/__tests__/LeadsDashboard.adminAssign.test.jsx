import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, getSelfAssignmentSetting, adminReassignLead } from '../../api/leads.api';
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
  getPrograms: vi.fn().mockResolvedValue([]),
  updateLeadStatus: vi.fn(),
  discardLead: vi.fn(),
  restoreLead: vi.fn(),
  getSelfAssignmentSetting: vi.fn(),
  updateSelfAssignmentSetting: vi.fn(),
}));

vi.mock('../../api/users.api', () => ({
  getUsers: vi.fn(),
}));

const LEAD_SIN_DUENO = {
  id: 'lead-1',
  name: 'Lead Sin Dueño',
  phone: '0991111111',
  email: 'lead@example.com',
  source: 'MANUAL',
  status: 'NEW',
  owner: null,
  owner_name: null,
  is_company: false,
};

const LEAD_ASIGNADO = {
  id: 'lead-2',
  name: 'Lead Asignado',
  phone: '0992222222',
  email: 'asignado@example.com',
  source: 'MANUAL',
  status: 'NEW',
  owner: 's1',
  owner_name: 'Vendedor Uno',
  is_company: false,
};

const SALESPEOPLE = [
  { id: 'sp-1', full_name: 'Nueva Vendedora', role: 'SALESPERSON' },
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

describe('LeadsDashboard — admin reasigna desde la columna "Asignado a" (CB-224/CB-225)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 'a1', role: 'ADMINISTRATOR' } });
    getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
    getUsers.mockResolvedValue({ results: SALESPEOPLE });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('clickear "Sin asignar" abre el modal de asignación', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [],
      available_leads: [],
      all_leads: [LEAD_SIN_DUENO],
      unassigned_leads: [LEAD_SIN_DUENO],
      assigned_leads: [],
      pagination: {},
    });
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /asignado a: sin asignar/i }));

    expect(await screen.findByRole('heading', { name: /asignar lead/i })).toBeInTheDocument();
    expect(screen.getByText(/^asignar a$/i)).toBeInTheDocument();
  });

  it('el botón de confirmar queda deshabilitado hasta elegir un vendedor', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [],
      available_leads: [],
      all_leads: [LEAD_SIN_DUENO],
      unassigned_leads: [LEAD_SIN_DUENO],
      assigned_leads: [],
      pagination: {},
    });
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /asignado a: sin asignar/i }));

    const submitButton = await screen.findByRole('button', { name: /^asignar$/i });
    expect(submitButton).toBeDisabled();
  });

  it('asigna el lead sin dueño al vendedor elegido', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [],
      available_leads: [],
      all_leads: [LEAD_SIN_DUENO],
      unassigned_leads: [LEAD_SIN_DUENO],
      assigned_leads: [],
      pagination: {},
    });
    adminReassignLead.mockResolvedValue({ ...LEAD_SIN_DUENO, owner: 'sp-1' });
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /asignado a: sin asignar/i }));

    await user.selectOptions(await screen.findByRole('combobox'), 'sp-1');
    await user.click(screen.getByRole('button', { name: /^asignar$/i }));

    expect(adminReassignLead).toHaveBeenCalledWith('lead-1', 'sp-1');
  });

  it('clickear el nombre de un lead asignado abre "Liberar o reasignar"', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [],
      available_leads: [],
      all_leads: [LEAD_ASIGNADO],
      unassigned_leads: [],
      assigned_leads: [LEAD_ASIGNADO],
      pagination: {},
    });
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /asignado a: vendedor uno/i }));

    expect(await screen.findByRole('heading', { name: /liberar o reasignar lead/i })).toBeInTheDocument();
  });

  it('el menú de "Acciones" ya no ofrece asignar/reasignar (vive en la columna "Asignado a")', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [],
      available_leads: [],
      all_leads: [LEAD_ASIGNADO],
      unassigned_leads: [],
      assigned_leads: [LEAD_ASIGNADO],
      pagination: {},
    });
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /acciones para lead asignado/i }));

    expect(screen.queryByRole('button', { name: /liberar \/ reasignar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^asignar a$/i })).not.toBeInTheDocument();
  });
});
