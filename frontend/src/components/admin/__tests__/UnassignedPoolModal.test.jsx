import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UnassignedPoolModal from '../UnassignedPoolModal';
import { getBootcamperPool, assignBootcamper, bulkAssignBootcampers } from '../../../api/payments.api';

vi.mock('../../../api/payments.api', () => ({
  getBootcamperPool: vi.fn(),
  assignBootcamper: vi.fn(),
  bulkAssignBootcampers: vi.fn(),
}));

const FINANZAS = [
  { finance_id: 'fin-1', finance_name: 'Finanzas Uno' },
  { finance_id: 'fin-2', finance_name: 'Finanzas Dos' },
];

const EN_POOL = {
  bootcamper_id: 'bc-1',
  bootcamper_name: 'Ana Torres',
  email: 'ana@test.com',
  program_id: 'prog-1',
  program_name: 'Python Full Stack',
  total_paid: '400.00',
  total_cost: '1200.00',
};

function renderModal(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UnassignedPoolModal
        financePeople={FINANZAS}
        onClose={vi.fn()}
        onDone={vi.fn()}
        onError={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('UnassignedPoolModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // El endpoint devuelve el pool dentro de available_bootcampers.
    getBootcamperPool.mockResolvedValue({
      my_bootcampers: [], available_bootcampers: [EN_POOL], pagination: {},
    });
    assignBootcamper.mockResolvedValue([]);
    bulkAssignBootcampers.mockResolvedValue({ assigned: [], failed: [] });
  });

  it('lista a quienes están en el pool', async () => {
    renderModal();

    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText(/python full stack/i)).toBeInTheDocument();
  });

  it('no permite asignar hasta elegir a quién', async () => {
    renderModal();
    await screen.findByText('Ana Torres');

    expect(screen.getByRole('button', { name: /^asignar$/i })).toBeDisabled();
  });

  it('asigna al responsable elegido', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ana Torres');

    await user.click(screen.getByRole('button', { name: /responsable de cobro de ana torres/i }));
    await user.click(screen.getByText('Finanzas Dos'));
    await user.click(screen.getByRole('button', { name: /^asignar$/i }));

    expect(assignBootcamper).toHaveBeenCalledWith('bc-1', 'fin-2');
  });

  it('avisa al terminar', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderModal({ onDone });
    await screen.findByText('Ana Torres');

    await user.click(screen.getByRole('button', { name: /responsable de cobro de ana torres/i }));
    await user.click(screen.getByText('Finanzas Uno'));
    await user.click(screen.getByRole('button', { name: /^asignar$/i }));

    // El mensaje nombra a la persona para que se vea a quién se asignó.
    expect(onDone).toHaveBeenCalledWith(expect.stringContaining('Ana Torres'));
  });

  it('propaga el mensaje del backend cuando falla', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    assignBootcamper.mockRejectedValue({
      response: { data: { error: 'Este bootcamper ya lo está monitoreando otra persona.' } },
    });
    renderModal({ onError });
    await screen.findByText('Ana Torres');

    await user.click(screen.getByRole('button', { name: /responsable de cobro de ana torres/i }));
    await user.click(screen.getByText('Finanzas Uno'));
    await user.click(screen.getByRole('button', { name: /^asignar$/i }));

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('ya lo está monitoreando'),
    );
  });

  it('avisa cuando el pool está vacío', async () => {
    getBootcamperPool.mockResolvedValue({
      my_bootcampers: [], available_bootcampers: [], pagination: {},
    });
    renderModal();

    expect(await screen.findByText(/todos tienen responsable de cobro/i)).toBeInTheDocument();
  });

  it('avisa cuando no hay personas de Finanzas a quienes asignar', async () => {
    renderModal({ financePeople: [] });

    expect(await screen.findByText(/no hay personas de finanzas activas/i)).toBeInTheDocument();
  });

  it('avisa si la carga falla', async () => {
    getBootcamperPool.mockRejectedValue(new Error('boom'));
    renderModal();

    expect(await screen.findByText(/no pudimos cargar el pool/i)).toBeInTheDocument();
  });

  it('se cierra con la X', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });
    await screen.findByText('Ana Torres');

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cerrar/i }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('UnassignedPoolModal — reparto en lote (#326)', () => {
  const OTRO = {
    ...EN_POOL,
    bootcamper_id: 'bc-2',
    bootcamper_name: 'Luis Vera',
    email: 'luis@test.com',
    program_id: 'prog-2',
    program_name: 'Data Science',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getBootcamperPool.mockResolvedValue({
      my_bootcampers: [], available_bootcampers: [EN_POOL, OTRO], pagination: {},
    });
    bulkAssignBootcampers.mockResolvedValue({
      assigned: [{ bootcamper_id: 'bc-1' }, { bootcamper_id: 'bc-2' }], failed: [],
    });
  });

  it('la barra de lote sólo aparece con algo seleccionado', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ana Torres');

    expect(screen.queryByRole('button', { name: /asignar seleccionados/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /seleccionar a ana torres/i }));

    expect(screen.getByRole('button', { name: /asignar seleccionados/i })).toBeInTheDocument();
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument();
  });

  it('seleccionar todos marca a los dos', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ana Torres');

    await user.click(screen.getByRole('checkbox', { name: /seleccionar todos/i }));

    expect(screen.getByText('2 seleccionados')).toBeInTheDocument();
  });

  it('manda la tanda con el destino elegido', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderModal({ onDone });
    await screen.findByText('Ana Torres');

    await user.click(screen.getByRole('checkbox', { name: /seleccionar todos/i }));
    await user.click(screen.getByRole('button', { name: /responsable de cobro de la selección/i }));
    await user.click(screen.getByText('Finanzas Uno'));
    await user.click(screen.getByRole('button', { name: /asignar seleccionados/i }));

    expect(bulkAssignBootcampers.mock.calls[0][0]).toEqual(['bc-1', 'bc-2']);
    expect(bulkAssignBootcampers.mock.calls[0][1]).toBe('fin-1');
  });

  it('sin destino no deja mandar la tanda', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByText('Ana Torres');

    await user.click(screen.getByRole('checkbox', { name: /seleccionar a ana torres/i }));

    expect(screen.getByRole('button', { name: /asignar seleccionados/i })).toBeDisabled();
    expect(bulkAssignBootcampers).not.toHaveBeenCalled();
  });

  it('avisa cuando la tanda falla a medias', async () => {
    // No dar por asignado lo que no se asignó: si no, quedan bootcampers sin
    // responsable y nadie se entera.
    const user = userEvent.setup();
    const onError = vi.fn();
    bulkAssignBootcampers.mockResolvedValue({
      assigned: [{ bootcamper_id: 'bc-1' }],
      failed: [{ bootcamper_id: 'bc-2', code: 'BOOTCAMPER_ALREADY_ASSIGNED', error: 'Luis Vera ya lo está monitoreando otra persona.' }],
    });
    renderModal({ onError });
    await screen.findByText('Ana Torres');

    await user.click(screen.getByRole('checkbox', { name: /seleccionar todos/i }));
    await user.click(screen.getByRole('button', { name: /responsable de cobro de la selección/i }));
    await user.click(screen.getByText('Finanzas Uno'));
    await user.click(screen.getByRole('button', { name: /asignar seleccionados/i }));

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toMatch(/1 asignado/);
    expect(onError.mock.calls[0][0]).toMatch(/ya lo está monitoreando/);
  });

  it('una persona con dos programas cuenta una sola vez', async () => {
    // El responsable de cobro es de la persona, no de su inscripción.
    const user = userEvent.setup();
    getBootcamperPool.mockResolvedValue({
      my_bootcampers: [],
      available_bootcampers: [EN_POOL, { ...EN_POOL, program_id: 'prog-9', program_name: 'Otro' }],
      pagination: {},
    });
    renderModal();
    await screen.findAllByText('Ana Torres');

    await user.click(screen.getByRole('checkbox', { name: /seleccionar todos/i }));

    expect(screen.getByText('1 seleccionado')).toBeInTheDocument();
  });
});
