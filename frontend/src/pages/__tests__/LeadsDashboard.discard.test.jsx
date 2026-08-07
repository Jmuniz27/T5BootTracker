import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';
import * as leadsApi from '../../api/leads.api';
import { useAuthStore } from '../../store/auth.store';

vi.mock('../../api/leads.api');

const LEAD = {
  id: 'lead-1',
  name: 'Ana Torres',
  phone: '0991112222',
  email: 'ana@test.com',
  source: 'INSTAGRAM',
  status: 'INTERESTED',
  is_company: false,
  program_interest: '',
  interaction_count: 1,
  last_outcome: null,
  last_interaction_at: null,
  days_assigned: 3,
  owner: 'sales-1',
  owner_name: 'Vendedor Uno',
  created_at: '2026-07-01T10:00:00Z',
  discard_reason: '',
  discard_reason_display: '',
  discard_detail: '',
  discarded_at: null,
  bootcamper: null,
};

const respuesta = (leads) => ({
  my_leads: leads,
  available_leads: [],
  converted_leads: [],
  pagination: { my_leads_total_pages: 1, available_leads_total_pages: 1, converted_leads_total_pages: 1 },
});

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LeadsDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Abre el menú de acciones de la única fila. */
async function abrirAcciones(user) {
  const fila = await screen.findByText('Ana Torres');
  const menus = screen.getAllByRole('button', { name: /acciones/i });
  await user.click(menus[menus.length - 1]);
  return fila;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'sales-1', role: 'SALESPERSON', first_name: 'Vendedor', last_name: 'Uno' },
  });
  leadsApi.getLeads.mockResolvedValue(respuesta([LEAD]));
  leadsApi.getInteractions.mockResolvedValue([]);
  leadsApi.getPrograms.mockResolvedValue([]);
  leadsApi.getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
  leadsApi.discardLead.mockResolvedValue({ ...LEAD, status: 'DISCARDED' });
  leadsApi.restoreLead.mockResolvedValue({ ...LEAD, status: 'INTERESTED' });
});

describe('descartar un lead', () => {
  it('el motivo es obligatorio: sin elegir uno no se llama al backend', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);
    await user.click(screen.getByRole('button', { name: 'Descartar lead' }));

    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(await screen.findByText('Elige un motivo.')).toBeInTheDocument();
    expect(leadsApi.discardLead).not.toHaveBeenCalled();
  });

  it('con el motivo "Otro" exige el detalle', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);
    await user.click(screen.getByRole('button', { name: 'Descartar lead' }));

    await user.click(screen.getByRole('radio', { name: 'Otro' }));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(await screen.findByText(/hay que escribir el detalle/i)).toBeInTheDocument();
    expect(leadsApi.discardLead).not.toHaveBeenCalled();
  });

  it('envía la causal y el detalle', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);
    await user.click(screen.getByRole('button', { name: 'Descartar lead' }));

    await user.click(screen.getByRole('radio', { name: 'Sin presupuesto' }));
    await user.type(screen.getByLabelText(/detalle/i), 'No le alcanza este año');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(leadsApi.discardLead).toHaveBeenCalled());
    // TanStack Query pasa un segundo argumento al mutationFn.
    expect(leadsApi.discardLead.mock.calls[0][0]).toBe('lead-1');
    expect(leadsApi.discardLead.mock.calls[0][1]).toEqual({
      reason: 'NO_BUDGET',
      detail: 'No le alcanza este año',
    });
  });

  it('una causal distinta de "Otro" no exige detalle', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);
    await user.click(screen.getByRole('button', { name: 'Descartar lead' }));

    await user.click(screen.getByRole('radio', { name: /no responde/i }));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(leadsApi.discardLead).toHaveBeenCalled());
    expect(leadsApi.discardLead.mock.calls[0][1].reason).toBe('NO_RESPONSE');
  });

  it('ofrece las cinco causales que nombró la clienta', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);
    await user.click(screen.getByRole('button', { name: 'Descartar lead' }));

    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });
});

describe('un lead ya descartado', () => {
  beforeEach(() => {
    leadsApi.getLeads.mockResolvedValue(respuesta([{
      ...LEAD,
      status: 'DISCARDED',
      discard_reason: 'NO_BUDGET',
      discard_reason_display: 'Sin presupuesto',
      discard_detail: 'No le alcanza este año',
    }]));
  });

  it('ofrece reactivarlo y no volver a descartarlo', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);

    expect(screen.getByRole('button', { name: 'Reactivar lead' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descartar lead' })).not.toBeInTheDocument();
  });

  it('reactivar llama al backend', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);

    await user.click(screen.getByRole('button', { name: 'Reactivar lead' }));

    await waitFor(() => expect(leadsApi.restoreLead).toHaveBeenCalled());
    expect(leadsApi.restoreLead.mock.calls[0][0]).toBe('lead-1');
  });

  it('el detalle del lead muestra el motivo', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirAcciones(user);
    await user.click(screen.getByRole('button', { name: 'Ver lead' }));

    expect(await screen.findByTestId('lead-discard-reason')).toHaveTextContent('Sin presupuesto');
    expect(screen.getByText('No le alcanza este año')).toBeInTheDocument();
  });
});
