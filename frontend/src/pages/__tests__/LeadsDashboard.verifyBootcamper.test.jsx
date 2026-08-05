import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, verifyBootcamper } from '../../api/leads.api';

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
    bootcamper_verification_status: 'PENDING_VERIFICATION',
    bootcamper_profile: {
      first_name: 'Ana',
      last_name: 'Vera',
      email: 'ana.activada@test.com',
      cedula: '1710034065',
      phone: '0991234567',
      verification_status: 'PENDING_VERIFICATION',
      verified_at: null,
      verified_by_name: null,
    },
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

async function abrirVista(user, nombre = 'Ana Vera') {
  await user.click(await screen.findByRole('button', { name: /convertidos/i }));
  await screen.findByText(nombre);
  const fila = screen.getByText(nombre).closest('tr') ?? document.body;
  const menus = within(fila).getAllByRole('button');
  await user.click(menus[menus.length - 1]);
  await user.click(await screen.findByRole('button', { name: /^ver lead$/i }));
}

describe('LeadsDashboard — verificación de datos del bootcamper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('el dueño ve los datos completados y el botón de verificar con PENDING_VERIFICATION', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [], converted_leads: [leadConvertido()], pagination: {},
    });
    renderDashboard();
    await abrirVista(user);

    expect(await screen.findByText('ana.activada@test.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marcar como verificado/i })).toBeInTheDocument();
  });

  it('no muestra el botón cuando el bootcamper sigue en INVITED', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [],
      converted_leads: [leadConvertido({
        bootcamper_verification_status: 'INVITED',
        bootcamper_profile: { ...leadConvertido().bootcamper_profile, verification_status: 'INVITED' },
      })],
      pagination: {},
    });
    renderDashboard();
    await abrirVista(user);

    expect(screen.queryByRole('button', { name: /marcar como verificado/i })).not.toBeInTheDocument();
  });

  it('no muestra el botón cuando ya está VERIFIED', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [],
      converted_leads: [leadConvertido({
        bootcamper_verification_status: 'VERIFIED',
        bootcamper_profile: {
          ...leadConvertido().bootcamper_profile,
          verification_status: 'VERIFIED',
          verified_by_name: 'Otro Vendedor',
        },
      })],
      pagination: {},
    });
    renderDashboard();
    await abrirVista(user);

    expect(screen.queryByRole('button', { name: /marcar como verificado/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/verificado por otro vendedor/i)).toBeInTheDocument();
  });

  it('un vendedor no dueño no ve la acción de verificar', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: { id: 'otro-vendedor', role: 'SALESPERSON' } });
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [], converted_leads: [leadConvertido()], pagination: {},
    });
    renderDashboard();
    await abrirVista(user);

    expect(await screen.findByText('ana.activada@test.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar como verificado/i })).not.toBeInTheDocument();
  });

  it('al marcar como verificado invalida la lista de leads', async () => {
    const user = userEvent.setup();
    getLeads.mockResolvedValue({
      my_leads: [], available_leads: [], converted_leads: [leadConvertido()], pagination: {},
    });
    verifyBootcamper.mockResolvedValue({});
    renderDashboard();
    await abrirVista(user);

    await user.click(await screen.findByRole('button', { name: /marcar como verificado/i }));

    expect(verifyBootcamper).toHaveBeenCalledWith('lead-1');
  });
});
