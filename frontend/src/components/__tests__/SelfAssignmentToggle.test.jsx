import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SelfAssignmentToggle from '../leads/SelfAssignmentToggle';
import { updateSelfAssignmentSetting } from '../../api/leads.api';

vi.mock('../../api/leads.api', () => ({
  updateSelfAssignmentSetting: vi.fn(),
}));

function renderToggle(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onResult = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SelfAssignmentToggle
        setting={{ self_assign_enabled: true, updated_by_name: null, updated_at: null }}
        isLoading={false}
        onResult={onResult}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onResult };
}

describe('SelfAssignmentToggle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refleja el estado habilitado', () => {
    renderToggle();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/pueden asignarse leads disponibles/i)).toBeInTheDocument();
  });

  it('refleja el estado deshabilitado y explica quién asigna', () => {
    renderToggle({ setting: { self_assign_enabled: false } });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/solo el administrador puede asignar leads/i)).toBeInTheDocument();
  });

  it('muestra la trazabilidad del último cambio', () => {
    renderToggle({
      setting: {
        self_assign_enabled: false,
        updated_by_name: 'Carmen Vaca',
        updated_at: '2026-07-20T15:30:00Z',
      },
    });
    expect(screen.getByText(/último cambio: Carmen Vaca/i)).toBeInTheDocument();
  });

  it('envía el valor invertido al hacer clic y avisa del resultado', async () => {
    const user = userEvent.setup();
    updateSelfAssignmentSetting.mockResolvedValue({ self_assign_enabled: false });
    const { onResult } = renderToggle();

    await user.click(screen.getByRole('switch'));

    expect(updateSelfAssignmentSetting.mock.calls[0][0]).toBe(false);
    await vi.waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(expect.stringMatching(/deshabilitada/i)),
    );
  });

  it('reporta el error del backend si el cambio falla', async () => {
    const user = userEvent.setup();
    updateSelfAssignmentSetting.mockRejectedValue({
      response: { data: { error: 'Solo el Administrador puede cambiar este control.' } },
    });
    const { onResult } = renderToggle();

    await user.click(screen.getByRole('switch'));

    await vi.waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        'Solo el Administrador puede cambiar este control.',
        'error',
      ),
    );
  });

  it('deshabilita el switch mientras carga', () => {
    renderToggle({ isLoading: true });
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
