import React from 'react';
import { render, screen } from '@testing-library/react';
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
  status: 'QUALIFIED',
  is_company: false,
  program_interest: '',
  interaction_count: 2,
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

/** Historial de más nueva a más vieja, como lo devuelve el endpoint. */
const HISTORIAL = [
  {
    id: 'int-2',
    interaction_type: 'WHATSAPP',
    outcome: 'SCHEDULE_VISIT',
    interest_level: 5,
    notes: 'Lista para convertir',
    next_action: '',
    created_at: '2026-07-20T10:00:00Z',
    days_as_lead: 19,
    salesperson_name: 'Vendedor Uno',
    lead_status: 'QUALIFIED',
    lead_status_display: 'Calificado',
  },
  {
    id: 'int-1',
    interaction_type: 'CALL',
    outcome: 'SEND_INFO',
    interest_level: 3,
    notes: 'Le mandé la info',
    next_action: '',
    created_at: '2026-07-05T10:00:00Z',
    days_as_lead: 4,
    salesperson_name: 'Vendedor Uno',
    lead_status: 'INTERESTED',
    lead_status_display: 'Interesado',
  },
];

const respuesta = (leads) => ({
  my_leads: leads,
  available_leads: [],
  converted_leads: [],
  pagination: {
    my_leads_total_pages: 1,
    available_leads_total_pages: 1,
    converted_leads_total_pages: 1,
  },
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

/** Abre el historial del único lead de la grilla. */
async function abrirHistorial(user) {
  await screen.findByText('Ana Torres');
  const menus = screen.getAllByRole('button', { name: /acciones/i });
  await user.click(menus[menus.length - 1]);
  await user.click(screen.getByRole('button', { name: /ver historial/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'sales-1', role: 'SALESPERSON', first_name: 'Vendedor', last_name: 'Uno' },
  });
  leadsApi.getLeads.mockResolvedValue(respuesta([LEAD]));
  leadsApi.getInteractions.mockResolvedValue(HISTORIAL);
  leadsApi.getPrograms.mockResolvedValue([]);
  leadsApi.getSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: true });
});

describe('estado del lead en el historial (#325)', () => {
  it('cada entrada dice en qué estado quedó el lead', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirHistorial(user);

    const sellos = await screen.findAllByTestId('interaction-lead-status');
    expect(sellos).toHaveLength(2);
    // El historial se lee de arriba (más nueva) hacia abajo.
    expect(sellos[0]).toHaveTextContent('Calificado');
    expect(sellos[1]).toHaveTextContent('Interesado');
  });

  it('se lee la evolución: dos entradas con estados distintos', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await abrirHistorial(user);

    const sellos = await screen.findAllByTestId('interaction-lead-status');
    expect(sellos[0].textContent).not.toBe(sellos[1].textContent);
  });

  it('una interacción sin estado registrado lo dice en vez de quedar muda', async () => {
    // Pasa con las anteriores a este campo: la migración no las reconstruye
    // porque el estado de hoy no es el que tenían entonces.
    const user = userEvent.setup();
    leadsApi.getInteractions.mockResolvedValue([
      { ...HISTORIAL[0], lead_status: null, lead_status_display: null },
    ]);
    renderDashboard();
    await abrirHistorial(user);

    expect(await screen.findByTestId('interaction-lead-status-missing')).toHaveTextContent(
      'Sin registro de estado',
    );
    expect(screen.queryByTestId('interaction-lead-status')).not.toBeInTheDocument();
  });

  it('cae en la etiqueta local si el backend no manda la legible', async () => {
    const user = userEvent.setup();
    leadsApi.getInteractions.mockResolvedValue([
      { ...HISTORIAL[0], lead_status: 'DISCARDED', lead_status_display: null },
    ]);
    renderDashboard();
    await abrirHistorial(user);

    expect(await screen.findByTestId('interaction-lead-status')).toHaveTextContent('Descartado');
  });
});
