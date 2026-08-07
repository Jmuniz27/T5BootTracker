import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, rejectBootcamper, verifyBootcamper } from '../../api/leads.api';

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

const MOTIVO = 'La cédula no coincide con el documento que enviaste.';

function perfil(overrides = {}) {
  return {
    first_name: 'Ana',
    last_name: 'Vera',
    email: 'ana.activada@test.com',
    cedula: '1710034065',
    phone: '0991234567',
    verification_status: 'PENDING_VERIFICATION',
    verification_rejection_reason: '',
    verified_at: null,
    verified_by_name: null,
    ...overrides,
  };
}

function leadConvertido(perfilOverrides = {}) {
  const p = perfil(perfilOverrides);
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
    bootcamper_verification_status: p.verification_status,
    bootcamper_profile: p,
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

function conLead(lead) {
  // El admin ve all/assigned/unassigned; el vendedor, convertidos. Se llenan
  // los dos juegos para que el mismo lead sirva en ambos roles.
  getLeads.mockResolvedValue({
    my_leads: [], available_leads: [], converted_leads: [lead],
    all_leads: [lead], assigned_leads: [lead], unassigned_leads: [],
    pagination: {},
  });
}

async function abrirVista(user, nombre = 'Ana Vera') {
  // Por testid y no por etiqueta: el nombre de la pestaña cambia según el rol.
  const pestana = screen.queryByTestId('tab-converted') ?? screen.getByTestId('tab-all');
  await user.click(pestana);
  await screen.findByText(nombre);
  const fila = screen.getByText(nombre).closest('tr') ?? document.body;
  const menus = within(fila).getAllByRole('button');
  await user.click(menus[menus.length - 1]);
  await user.click(await screen.findByRole('button', { name: /^ver lead$/i }));
}

const botonRechazar = () => screen.queryByRole('button', { name: /rechazar datos/i });
const botonVerificar = () => screen.queryByRole('button', { name: /marcar como verificado/i });

describe('LeadsDashboard — rechazo de datos del bootcamper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  describe('quién ve la acción', () => {
    it('el dueño la ve con PENDING_VERIFICATION', async () => {
      const user = userEvent.setup();
      conLead(leadConvertido());
      renderDashboard();
      await abrirVista(user);

      expect(await screen.findByText('ana.activada@test.com')).toBeInTheDocument();
      expect(botonRechazar()).toBeInTheDocument();
    });

    it('un admin la ve aunque el lead no sea suyo', async () => {
      const user = userEvent.setup();
      useAuthStore.setState({ user: { id: 'admin-1', role: 'ADMINISTRATOR' } });
      conLead(leadConvertido());
      renderDashboard();
      await abrirVista(user);

      expect(await screen.findByText('ana.activada@test.com')).toBeInTheDocument();
      expect(botonRechazar()).toBeInTheDocument();
    });

    it('un vendedor ajeno no la ve', async () => {
      const user = userEvent.setup();
      useAuthStore.setState({ user: { id: 'otro-vendedor', role: 'SALESPERSON' } });
      conLead(leadConvertido());
      renderDashboard();
      await abrirVista(user);

      expect(await screen.findByText('ana.activada@test.com')).toBeInTheDocument();
      expect(botonRechazar()).not.toBeInTheDocument();
    });

    it('no aparece con el bootcamper todavía en INVITED', async () => {
      const user = userEvent.setup();
      conLead(leadConvertido({ verification_status: 'INVITED' }));
      renderDashboard();
      await abrirVista(user);

      expect(await screen.findByText('ana.activada@test.com')).toBeInTheDocument();
      expect(botonRechazar()).not.toBeInTheDocument();
    });
  });

  describe('el motivo es obligatorio', () => {
    it('no envía nada si el motivo está vacío', async () => {
      const user = userEvent.setup();
      conLead(leadConvertido());
      renderDashboard();
      await abrirVista(user);

      await user.click(botonRechazar());
      await user.click(screen.getByRole('button', { name: /^rechazar$/i }));

      expect(await screen.findByText('Escribe qué hay que corregir.')).toBeInTheDocument();
      expect(rejectBootcamper).not.toHaveBeenCalled();
    });

    it('envía el motivo escrito', async () => {
      const user = userEvent.setup();
      conLead(leadConvertido());
      rejectBootcamper.mockResolvedValue({});
      renderDashboard();
      await abrirVista(user);

      await user.click(botonRechazar());
      await user.type(screen.getByLabelText(/qué hay que corregir/i), MOTIVO);
      await user.click(screen.getByRole('button', { name: /^rechazar$/i }));

      expect(rejectBootcamper).toHaveBeenCalledWith('lead-1', MOTIVO);
    });

    it('cancelar no envía nada', async () => {
      const user = userEvent.setup();
      conLead(leadConvertido());
      renderDashboard();
      await abrirVista(user);

      await user.click(botonRechazar());
      await user.click(screen.getByRole('button', { name: /^cancelar$/i }));

      expect(rejectBootcamper).not.toHaveBeenCalled();
    });
  });

  describe('un lead ya rechazado', () => {
    const rechazado = () => leadConvertido({
      verification_status: 'REJECTED',
      verification_rejection_reason: MOTIVO,
      verified_by_name: 'Sale Person',
    });

    it('muestra el motivo pendiente de corregir', async () => {
      const user = userEvent.setup();
      conLead(rechazado());
      renderDashboard();
      await abrirVista(user);

      expect(await screen.findByText(new RegExp(MOTIVO))).toBeInTheDocument();
      expect(screen.getByText(/rechazado por sale person/i)).toBeInTheDocument();
    });

    it('sigue ofreciendo verificar, que es la salida del rechazo', async () => {
      const user = userEvent.setup();
      conLead(rechazado());
      verifyBootcamper.mockResolvedValue({});
      renderDashboard();
      await abrirVista(user);

      await user.click(botonVerificar());

      expect(verifyBootcamper).toHaveBeenCalledWith('lead-1');
    });

    it('no ofrece rechazar de nuevo', async () => {
      const user = userEvent.setup();
      conLead(rechazado());
      renderDashboard();
      await abrirVista(user);

      expect(await screen.findByText('ana.activada@test.com')).toBeInTheDocument();
      expect(botonRechazar()).not.toBeInTheDocument();
    });
  });
});
