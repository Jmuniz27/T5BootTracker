import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BootcamperAssignmentToggle from '../BootcamperAssignmentToggle';
import { updateBootcamperAssignmentSetting } from '../../../api/payments.api';

vi.mock('../../../api/payments.api', () => ({
  updateBootcamperAssignmentSetting: vi.fn(),
}));

const HABILITADO = {
  self_assign_enabled: true,
  updated_by_name: 'Admin Sistema',
  updated_at: '2026-08-01T10:00:00Z',
};

const DESHABILITADO = { ...HABILITADO, self_assign_enabled: false };

function renderToggle(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BootcamperAssignmentToggle setting={HABILITADO} onResult={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('BootcamperAssignmentToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateBootcamperAssignmentSetting.mockResolvedValue(DESHABILITADO);
  });

  it('refleja el estado habilitado', () => {
    renderToggle();

    expect(screen.getByRole('switch', { name: /auto-asignación de cobro/i })).toBeChecked();
    expect(screen.getByText(/finanzas puede tomar bootcampers del pool/i)).toBeInTheDocument();
  });

  it('refleja el estado deshabilitado y explica la consecuencia', () => {
    renderToggle({ setting: DESHABILITADO });

    expect(screen.getByRole('switch', { name: /auto-asignación de cobro/i })).not.toBeChecked();
    expect(screen.getByText(/solo el administrador reparte el cobro/i)).toBeInTheDocument();
  });

  it('manda el valor contrario al pulsarlo', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('switch', { name: /auto-asignación de cobro/i }));

    // Sólo el primer argumento: TanStack Query añade el contexto de la mutación.
    expect(updateBootcamperAssignmentSetting.mock.calls[0][0]).toBe(false);
  });

  it('avisa al deshabilitar', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderToggle({ onResult });

    await user.click(screen.getByRole('switch', { name: /auto-asignación de cobro/i }));

    expect(onResult).toHaveBeenCalledWith(
      expect.stringContaining('Solo el Administrador reparte'),
    );
  });

  it('avisa al habilitar', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    updateBootcamperAssignmentSetting.mockResolvedValue(HABILITADO);
    renderToggle({ setting: DESHABILITADO, onResult });

    await user.click(screen.getByRole('switch', { name: /auto-asignación de cobro/i }));

    expect(onResult).toHaveBeenCalledWith(
      expect.stringContaining('Finanzas ya puede tomar'),
    );
  });

  it('dice quién hizo el último cambio', () => {
    renderToggle();

    expect(screen.getByText(/admin sistema/i)).toBeInTheDocument();
  });

  it('propaga el error del backend', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    updateBootcamperAssignmentSetting.mockRejectedValue({
      response: { data: { error: 'Solo el Administrador puede cambiar este control.' } },
    });
    renderToggle({ onResult });

    await user.click(screen.getByRole('switch', { name: /auto-asignación de cobro/i }));

    expect(onResult).toHaveBeenCalledWith(
      expect.stringContaining('Solo el Administrador puede cambiar'),
      'error',
    );
  });

  it('no se puede pulsar mientras carga', () => {
    renderToggle({ isLoading: true });

    expect(screen.getByRole('switch', { name: /auto-asignación de cobro/i })).toBeDisabled();
  });
});
