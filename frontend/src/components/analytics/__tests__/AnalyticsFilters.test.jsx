import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalyticsFilters, { EMPTY_ANALYTICS_FILTERS } from '../AnalyticsFilters';

function renderFilters(filters = EMPTY_ANALYTICS_FILTERS) {
  const onChange = vi.fn();
  const utils = render(<AnalyticsFilters filters={filters} onChange={onChange} />);
  return { ...utils, onChange };
}

describe('AnalyticsFilters', () => {
  it('emite el filtro de fecha desde', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();

    await user.type(screen.getByLabelText('Desde'), '2026-01-15');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ fecha_desde: '2026-01-15' }),
    );
  });

  it('emite el segmento seleccionado', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters();

    await user.click(screen.getByRole('button', { name: /todos los segmentos/i }));
    await user.click(screen.getByText('WhatsApp'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ segment: 'WHATSAPP' }));
  });

  it('preserva los demás filtros al cambiar uno', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      ...EMPTY_ANALYTICS_FILTERS,
      segment: 'INSTAGRAM',
    });

    await user.type(screen.getByLabelText('Desde'), '2026-01-15');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ segment: 'INSTAGRAM', fecha_desde: '2026-01-15' }),
    );
  });

  it('avisa cuando el rango de fechas está invertido', () => {
    renderFilters({
      ...EMPTY_ANALYTICS_FILTERS,
      fecha_desde: '2026-06-01',
      fecha_hasta: '2026-01-01',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/no puede ser posterior/i);
  });

  it('no muestra "Limpiar filtros" si no hay ninguno activo', () => {
    renderFilters();
    expect(screen.queryByRole('button', { name: /limpiar filtros/i })).not.toBeInTheDocument();
  });

  it('limpia todos los filtros', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({
      ...EMPTY_ANALYTICS_FILTERS,
      segment: 'MANUAL',
    });

    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_ANALYTICS_FILTERS);
  });
});
