import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, resendInvitation } from '../../api/leads.api';

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

function leadConvertido(overrides = {}) {
  return {
    id: 'lead-1',
    name: 'Ana Vera',
    phone: '0991234567',
    email: 'ana@test.com',
    status: 'CONVERTED',
    owner: 's1',
    source: 'MANUAL',
    interaction_count: 1,
    bootcamper: 'boot-1',
    bootcamper_verification_status: 'INVITED',
    ...overrides,
  };
}

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

async function abrirMenu(user, nombre = 'Ana Vera') {
  await user.click(await screen.findByRole('button', { name: /convertidos/i }));
  await screen.findByText(nombre);
  const fila = screen.getByText(nombre).closest('tr') ?? document.body;
  const menus = within(fila).getAllByRole('button');
  await user.click(menus[menus.length - 1]);
}

describe('LeadsDashboard — reenvío de invitación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('un lead convertido con bootcamper INVITED muestra la opción de reenviar', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [], converted_leads: [leadConvertido()], pagination: {},
    });
    renderDashboard();
    await abrirMenu(user);

    expect(await screen.findByRole('button', { name: /reenviar invitación/i })).toBeInTheDocument();
  });

  it('un bootcamper ya PENDING_VERIFICATION no ofrece reenviar', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [],
      converted_leads: [leadConvertido({ bootcamper_verification_status: 'PENDING_VERIFICATION' })],
      pagination: {},
    });
    renderDashboard();
    await abrirMenu(user);

    expect(screen.queryByRole('button', { name: /reenviar invitación/i })).not.toBeInTheDocument();
  });

  it('un bootcamper VERIFIED no ofrece reenviar', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [],
      converted_leads: [leadConvertido({ bootcamper_verification_status: 'VERIFIED' })],
      pagination: {},
    });
    renderDashboard();
    await abrirMenu(user);

    expect(screen.queryByRole('button', { name: /reenviar invitación/i })).not.toBeInTheDocument();
  });

  it('reenviar muestra el link nuevo con opción de copiar', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [], converted_leads: [leadConvertido()], pagination: {},
    });
    resendInvitation.mockResolvedValue({ invitation_link: 'https://app.test/onboarding/nuevo' });
    renderDashboard();
    await abrirMenu(user);
    await user.click(await screen.findByRole('button', { name: /reenviar invitación/i }));

    await user.click(await screen.findByRole('button', { name: /^reenviar$/i }));

    expect(resendInvitation).toHaveBeenCalledWith('lead-1');
    expect(await screen.findByDisplayValue('https://app.test/onboarding/nuevo')).toBeInTheDocument();
  });
});
