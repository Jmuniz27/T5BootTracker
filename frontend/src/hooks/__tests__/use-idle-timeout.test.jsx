import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { useIdleTimeout, IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from '../use-idle-timeout';

function Probe({ onTimeout, enabled = true }) {
  const { showWarning } = useIdleTimeout({ onTimeout, enabled });
  return <div>{showWarning ? 'aviso' : 'sin-aviso'}</div>;
}

describe('useIdleTimeout (HST-003)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

  it('cierra la sesión tras 2 horas de inactividad', () => {
    const onTimeout = vi.fn();
    render(<Probe onTimeout={onTimeout} />);

    advance(IDLE_TIMEOUT_MS - 1000);
    expect(onTimeout).not.toHaveBeenCalled();

    advance(2000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('avisa antes de expirar', () => {
    render(<Probe onTimeout={vi.fn()} />);
    expect(screen.getByText('sin-aviso')).toBeInTheDocument();

    advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS + 100);
    expect(screen.getByText('aviso')).toBeInTheDocument();
  });

  it('la actividad reinicia el temporizador', () => {
    const onTimeout = vi.fn();
    render(<Probe onTimeout={onTimeout} />);

    advance(IDLE_TIMEOUT_MS - 5000);
    act(() => { window.dispatchEvent(new Event('keydown')); });

    // Sin el reinicio, estos 10s habrían superado el límite.
    advance(10000);
    expect(onTimeout).not.toHaveBeenCalled();

    advance(IDLE_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('la actividad oculta el aviso', () => {
    render(<Probe onTimeout={vi.fn()} />);
    advance(IDLE_TIMEOUT_MS - IDLE_WARNING_MS + 100);
    expect(screen.getByText('aviso')).toBeInTheDocument();

    act(() => { window.dispatchEvent(new Event('mousedown')); });
    expect(screen.getByText('sin-aviso')).toBeInTheDocument();
  });

  it('no hace nada si está deshabilitado', () => {
    const onTimeout = vi.fn();
    render(<Probe onTimeout={onTimeout} enabled={false} />);

    advance(IDLE_TIMEOUT_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('limpia los timers al desmontar', () => {
    const onTimeout = vi.fn();
    const { unmount } = render(<Probe onTimeout={onTimeout} />);

    unmount();
    advance(IDLE_TIMEOUT_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
