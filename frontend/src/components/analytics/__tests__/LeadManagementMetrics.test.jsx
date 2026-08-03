import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadManagementMetrics from '../LeadManagementMetrics';
import { getLeadManagementMetrics } from '../../../api/analytics.api';

vi.mock('../../../api/analytics.api', () => ({
  getLeadManagementMetrics: vi.fn(),
}));

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
    expect(screen.getByText('5.3 h')).toBeInTheDocument();
    expect(screen.getByText(/12 leads asignados/)).toBeInTheDocument();
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
