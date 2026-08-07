import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import { useAuthStore } from '../../store/auth.store';
import { getLeads, createLead } from '../../api/leads.api';

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
  getUsers: vi.fn().mockResolvedValue({ results: [] }),
}));

const DUPLICADO = {
  id: 'lead-existente',
  name: 'Ana Vera',
  phone: '0991234567',
  email: 'ana.vera@example.com',
};

const CONFLICTO_409 = {
  response: {
    status: 409,
    data: {
      error: 'Ya existe un lead con estos datos.',
      code: 'POSSIBLE_DUPLICATE',
      duplicate: DUPLICADO,
    },
  },
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

/** El form de creación no asocia label↔input, así que se busca por estructura. */
function campo(labelText) {
  const label = screen
    .getAllByText((_, el) => el?.tagName === 'LABEL' && el.textContent.startsWith(labelText))
    .at(-1);
  return label.parentElement.querySelector('input');
}

async function abrirFormularioYEnviar(user) {
  await user.click(screen.getByRole('button', { name: /nuevo lead/i }));
  await user.type(campo('Nombre completo'), 'Ana Vera');
  await user.type(campo('Teléfono'), '0991234567');
  await user.click(screen.getByRole('button', { name: /^crear lead$/i }));
}

describe('LeadsDashboard — advertencia de duplicado (CR-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 's1', role: 'SALESPERSON' } });
    getLeads.mockResolvedValue({ my_leads: [], available_leads: [], pagination: {} });
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('muestra la advertencia con los datos del lead existente ante un 409', async () => {
    const user = userEvent.setup();
    createLead.mockRejectedValue(CONFLICTO_409);
    renderDashboard();

    await abrirFormularioYEnviar(user);

    const dialog = await screen.findByRole('dialog', { name: /posible lead duplicado/i });
    expect(within(dialog).getByText('Ana Vera')).toBeInTheDocument();
    expect(within(dialog).getByText('0991234567')).toBeInTheDocument();
    expect(within(dialog).getByText('ana.vera@example.com')).toBeInTheDocument();
  });

  it('no crea nada si se cancela la advertencia', async () => {
    const user = userEvent.setup();
    createLead.mockRejectedValue(CONFLICTO_409);
    renderDashboard();

    await abrirFormularioYEnviar(user);
    const dialog = await screen.findByRole('dialog', { name: /posible lead duplicado/i });
    await user.click(within(dialog).getByRole('button', { name: /cancelar/i }));

    expect(screen.queryByRole('dialog', { name: /posible lead duplicado/i })).not.toBeInTheDocument();
    expect(createLead).toHaveBeenCalledTimes(1);
  });

  it('reenvía con confirm_duplicate al confirmar', async () => {
    const user = userEvent.setup();
    createLead.mockRejectedValueOnce(CONFLICTO_409).mockResolvedValueOnce({ id: 'lead-nuevo' });
    renderDashboard();

    await abrirFormularioYEnviar(user);
    const dialog = await screen.findByRole('dialog', { name: /posible lead duplicado/i });
    await user.click(within(dialog).getByRole('button', { name: /crear de todos modos/i }));

    expect(createLead).toHaveBeenCalledTimes(2);
    expect(createLead.mock.calls[0][0]).not.toHaveProperty('confirm_duplicate');
    expect(createLead.mock.calls[1][0]).toMatchObject({
      name: 'Ana Vera',
      phone: '0991234567',
      confirm_duplicate: true,
    });
    expect(await screen.findByText(/lead creado/i)).toBeInTheDocument();
  });

  it('un error que no es 409 sigue mostrándose como toast, sin advertencia', async () => {
    const user = userEvent.setup();
    createLead.mockRejectedValue({
      response: { status: 400, data: { error: 'Teléfono inválido.' } },
    });
    renderDashboard();

    await abrirFormularioYEnviar(user);

    expect(await screen.findByText('Teléfono inválido.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /posible lead duplicado/i })).not.toBeInTheDocument();
  });
});
