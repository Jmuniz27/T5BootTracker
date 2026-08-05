import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, getSelfAssignmentSetting, assignLead } from '../../api/leads.api';

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
  getPrograms: vi.fn().mockResolvedValue([]),
  updateLeadStatus: vi.fn(),
  getSelfAssignmentSetting: vi.fn(),
  updateSelfAssignmentSetting: vi.fn(),
}));

vi.mock('../../api/users.api', () => ({
  getUsers: vi.fn().mockResolvedValue({ results: [] }),
}));

const LEAD_DISPONIBLE = {
  id: 'lead-1',
  name: 'Lead Disponible',
  phone: '0991111111',
  email: 'lead@example.com',
  source: 'MANUAL',
  status: 'NEW',
  owner: null,
  is_company: false,
};

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

/** El tab por defecto es "Mis leads"; los leads sin dueño viven en "Disponibles". */
async function openAvailableTab(user) {
  await user.click(await screen.findByRole('button', { name: /^disponibles/i }));
  return screen.findByText('Lead Disponible');
}

describe('LeadsDashboard — control de auto-asignación (CR-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLeads.mockResolvedValue({
      my_leads: [],
      available_leads: [LEAD_DISPONIBLE],
      pagination: {},
    });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('no muestra el switch en el dashboard (vive en Usuarios)', async () => {
    useAuthStore.setState({ user: { id: 'a1', role: 'ADMINISTRATOR' } });
    getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
    renderDashboard();

    await screen.findByText('Dashboard de Leads')
    expect(screen.queryByRole('switch', { name: /auto-asignación/i })).not.toBeInTheDocument();
  });

  it('deshabilita "Asignarme" y explica quién asigna cuando el control está apagado', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
    getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: false });
    renderDashboard();

    await openAvailableTab(user);
    await user.click(await screen.findByRole('button', { name: /acciones para lead disponible/i }));

    expect(screen.getByRole('button', { name: /asignarme/i })).toBeDisabled();
    expect(screen.getByText(/la asignación la realiza el administrador/i)).toBeInTheDocument();
    expect(assignLead).not.toHaveBeenCalled();
  });

  it('habilita "Asignarme" cuando el control está encendido', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
    getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
    renderDashboard();

    await openAvailableTab(user);
    await user.click(await screen.findByRole('button', { name: /acciones para lead disponible/i }));

    const assignButton = screen.getByRole('button', { name: /asignarme/i });
    expect(assignButton).toBeEnabled();

    await user.click(assignButton);
    // react-query invoca mutationFn con (variables, context) — solo interesa el primero.
    expect(assignLead.mock.calls[0][0]).toBe('lead-1');
  });
});
