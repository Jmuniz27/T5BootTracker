import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UnassignedPoolModal from '../UnassignedPoolModal';
import { getBootcamperPool, assignBootcamper } from '../../../api/payments.api';

vi.mock('../../../api/payments.api', () => ({
  getBootcamperPool: vi.fn(),
  assignBootcamper: vi.fn(),
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
