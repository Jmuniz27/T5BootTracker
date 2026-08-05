import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadManagementMetrics from '../LeadManagementMetrics';
import { getLeadManagementMetrics, getSalespersonLeads } from '../../../api/analytics.api';

vi.mock('../../../api/analytics.api', () => ({
  getLeadManagementMetrics: vi.fn(),
  getSalespersonLeads: vi.fn(),
}));

const SALESPERSON_LEADS = {
  leads_count: 2,
  leads: [
    {
      lead_id: 'l1',
      name: 'Ana Torres',
      source: 'INSTAGRAM',
      status: 'CONVERTED',
      program_interest: 'Data Science',
      created_at: '2026-07-01T10:00:00Z',
      assigned_at: '2026-07-01T12:00:00Z',
      released_at: null,
      is_released: false,
      retention_hours: 48.5,
      hours_to_first_contact: 2.5,
      interaction_count: 3,
      last_outcome: 'CALL_AGAIN',
      last_interaction_at: '2026-07-03T09:00:00Z',
    },
    {
      lead_id: 'l2',
      name: 'Pedro Guerrero',
      source: 'WHATSAPP',
      status: 'NEW',
      program_interest: '',
      created_at: '2026-07-05T10:00:00Z',
      assigned_at: '2026-07-05T11:00:00Z',
      released_at: '2026-07-06T11:00:00Z',
      is_released: true,
      retention_hours: 24,
      hours_to_first_contact: null,
      interaction_count: 0,
      last_outcome: null,
      last_interaction_at: null,
    },
  ],
};

const METRICS = {
  leads_considered: 12,
  unassigned_leads: 4,
  avg_retention_hours: 42.6,
  avg_time_to_first_contact_hours: 5.3,
  by_salesperson: [
    {
      salesperson_id: 'u1',
      salesperson: 'María Cedeño',
      active_leads: 8,
      avg_retention_hours: 38.2,
      avg_time_to_first_contact_hours: 3.1,
    },
    {
      salesperson_id: 'u2',
      salesperson: 'Luis Vera',
      active_leads: 4,
      avg_retention_hours: 50.4,
      avg_time_to_first_contact_hours: null,
    },
  ],
};

/** La tarjeta de "Leads sin asignar", para no confundir su valor con el de la tabla. */
async function unassignedCard() {
  return (await screen.findByText('Leads sin asignar')).closest('div');
}

function renderMetrics(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LeadManagementMetrics filters={{}} {...props} />
    </QueryClientProvider>,
  );
}

describe('LeadManagementMetrics (CR-006)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('muestra los promedios globales', async () => {
    getLeadManagementMetrics.mockResolvedValue(METRICS);
    renderMetrics();

    expect(await screen.findByText('42.6 h')).toBeInTheDocument();
    expect(screen.getByText(/12 leads asignados/)).toBeInTheDocument();
  });

  it('no muestra la tarjeta global de tiempo al primer contacto', async () => {
    getLeadManagementMetrics.mockResolvedValue(METRICS);
    renderMetrics();

    await screen.findByText('42.6 h');
    expect(screen.queryByText(/tiempo al primer contacto/i)).not.toBeInTheDocument();
    // El promedio global (5.3 h) desaparece; el detalle por vendedor se mantiene.
    expect(screen.queryByText('5.3 h')).not.toBeInTheDocument();
    expect(screen.getByText('3.1 h')).toBeInTheDocument();
  });

  it('lista una fila por vendedor', async () => {
    getLeadManagementMetrics.mockResolvedValue(METRICS);
    renderMetrics();

    expect(await screen.findByText('María Cedeño')).toBeInTheDocument();
    expect(screen.getByText('Luis Vera')).toBeInTheDocument();
    expect(screen.getByText('38.2 h')).toBeInTheDocument();
  });

  it('muestra "—" cuando una métrica no tiene datos', async () => {
    getLeadManagementMetrics.mockResolvedValue(METRICS);
    renderMetrics();

    // Luis Vera no tiene tiempo de primer contacto.
    await screen.findByText('Luis Vera');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('muestra un estado vacío cuando no hay leads asignados', async () => {
    getLeadManagementMetrics.mockResolvedValue({
      leads_considered: 0,
      unassigned_leads: 0,
      avg_retention_hours: null,
      avg_time_to_first_contact_hours: null,
      by_salesperson: [],
    });
    renderMetrics();

    expect(await screen.findByText(/sin leads asignados/i)).toBeInTheDocument();
  });

  it('muestra la cantidad de leads sin asignar', async () => {
    getLeadManagementMetrics.mockResolvedValue(METRICS);
    renderMetrics();

    // Acotado a la tarjeta: "4" también aparece como leads activos de un vendedor.
    expect(await unassignedCard()).toHaveTextContent('4');
  });

  it('muestra 0 leads sin asignar como cero y no como guion', async () => {
    getLeadManagementMetrics.mockResolvedValue({ ...METRICS, unassigned_leads: 0 });
    renderMetrics();

    const card = await unassignedCard();
    expect(card).toHaveTextContent('0');
    expect(card).not.toHaveTextContent('—');
  });

  it('muestra "—" si el backend no envía el conteo', async () => {
    const { unassigned_leads: _omitido, ...sinConteo } = METRICS;
    getLeadManagementMetrics.mockResolvedValue(sinConteo);
    renderMetrics();

    expect(await unassignedCard()).toHaveTextContent('—');
  });

  it('avisa cuando el backend responde 403', async () => {
    getLeadManagementMetrics.mockRejectedValue({ response: { status: 403 } });
    renderMetrics();

    expect(await screen.findByText(/permisos de administrador/i)).toBeInTheDocument();
  });

  it('propaga los filtros recibidos', async () => {
    getLeadManagementMetrics.mockResolvedValue(METRICS);
    renderMetrics({ filters: { segment: 'INSTAGRAM' } });

    await screen.findByText('María Cedeño');
    expect(getLeadManagementMetrics).toHaveBeenCalledWith({ segment: 'INSTAGRAM' });
  });
});

describe('LeadManagementMetrics — detalle por vendedor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLeadManagementMetrics.mockResolvedValue(METRICS);
    getSalespersonLeads.mockResolvedValue(SALESPERSON_LEADS);
  });

  it('arranca en el resumen y no pide el detalle hasta elegir un vendedor', async () => {
    renderMetrics();

    expect(await screen.findByText('María Cedeño')).toBeInTheDocument();
    expect(getSalespersonLeads).not.toHaveBeenCalled();
  });

  it('ofrece un vendedor por cada fila del resumen', async () => {
    const user = userEvent.setup();
    renderMetrics();

    await screen.findByText('María Cedeño');
    await user.click(screen.getByTestId('analytics-salesperson'));

    expect(screen.getByRole('option', { name: 'Todos los vendedores' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Luis Vera' })).toBeInTheDocument();
  });

  it('al elegir un vendedor reemplaza el resumen por sus leads', async () => {
    const user = userEvent.setup();
    renderMetrics();

    await screen.findByText('María Cedeño');
    await user.click(screen.getByTestId('analytics-salesperson'));
    await user.click(screen.getByRole('option', { name: 'María Cedeño' }));

    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText('Pedro Guerrero')).toBeInTheDocument();
    // La tabla resumen (columna "Leads activos") ya no está.
    expect(screen.queryByText('Leads activos')).not.toBeInTheDocument();
    expect(getSalespersonLeads).toHaveBeenCalledWith(
      expect.objectContaining({ salesperson: 'u1' }),
    );
  });

  it('traduce fuente y estado, y muestra el programa de interés', async () => {
    const user = userEvent.setup();
    renderMetrics();

    await screen.findByText('María Cedeño');
    await user.click(screen.getByTestId('analytics-salesperson'));
    await user.click(screen.getByRole('option', { name: 'María Cedeño' }));

    await screen.findByText('Ana Torres');
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Convertido')).toBeInTheDocument();
    expect(screen.getByText('Data Science')).toBeInTheDocument();
  });

  it('distingue lead sin contactar de contacto inmediato, y marca los liberados', async () => {
    const user = userEvent.setup();
    renderMetrics();

    await screen.findByText('María Cedeño');
    await user.click(screen.getByTestId('analytics-salesperson'));
    await user.click(screen.getByRole('option', { name: 'María Cedeño' }));

    await screen.findByText('Pedro Guerrero');
    // Pedro no tiene interacciones: primer contacto "—", no "0 h".
    expect(screen.getByText('2.5 h')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('liberado')).toBeInTheDocument();
  });

  it('propaga los filtros de la página al detalle', async () => {
    const user = userEvent.setup();
    renderMetrics({ filters: { fecha_desde: '2026-07-01', segment: 'INSTAGRAM' } });

    await screen.findByText('María Cedeño');
    await user.click(screen.getByTestId('analytics-salesperson'));
    await user.click(screen.getByRole('option', { name: 'María Cedeño' }));

    await screen.findByText('Ana Torres');
    expect(getSalespersonLeads).toHaveBeenCalledWith({
      fecha_desde: '2026-07-01',
      segment: 'INSTAGRAM',
      salesperson: 'u1',
    });
  });

  it('avisa cuando el vendedor no tiene leads en el período', async () => {
    getSalespersonLeads.mockResolvedValue({ leads_count: 0, leads: [] });
    const user = userEvent.setup();
    renderMetrics();

    await screen.findByText('María Cedeño');
    await user.click(screen.getByTestId('analytics-salesperson'));
    await user.click(screen.getByRole('option', { name: 'María Cedeño' }));

    expect(await screen.findByText(/no tiene leads asignados en el período/i)).toBeInTheDocument();
  });

  it('muestra un error propio si falla el detalle', async () => {
    getSalespersonLeads.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderMetrics();

    await screen.findByText('María Cedeño');
    await user.click(screen.getByTestId('analytics-salesperson'));
    await user.click(screen.getByRole('option', { name: 'María Cedeño' }));

    expect(await screen.findByText(/no pudimos cargar los leads de este vendedor/i)).toBeInTheDocument();
  });
});
