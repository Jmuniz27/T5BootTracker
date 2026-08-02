import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalyticsExportButtons from '../AnalyticsExportButtons';
import { exportAnalyticsReport } from '../../../api/analytics.api';

vi.mock('../../../api/analytics.api', () => ({
  exportAnalyticsReport: vi.fn(),
}));

describe('AnalyticsExportButtons (CB-58)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom no implementa las URLs de objeto ni la descarga real.
    global.URL.createObjectURL = vi.fn(() => 'blob:fake');
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('ofrece exportar en Excel y CSV', () => {
    render(<AnalyticsExportButtons filters={{}} />);
    expect(screen.getByRole('button', { name: /exportar excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar csv/i })).toBeInTheDocument();
  });

  it('envía el formato y los filtros activos al backend', async () => {
    const user = userEvent.setup();
    exportAnalyticsReport.mockResolvedValue({ blob: new Blob(['x']), filename: 'reporte.csv' });

    render(<AnalyticsExportButtons filters={{ segment: 'INSTAGRAM', fecha_desde: '2026-06-01' }} />);
    await user.click(screen.getByRole('button', { name: /exportar csv/i }));

    await waitFor(() => {
      expect(exportAnalyticsReport).toHaveBeenCalledWith('csv', {
        segment: 'INSTAGRAM',
        fecha_desde: '2026-06-01',
      });
    });
  });

  it('dispara la descarga con el nombre que envía el backend', async () => {
    const user = userEvent.setup();
    exportAnalyticsReport.mockResolvedValue({
      blob: new Blob(['x']),
      filename: 'analitica-boot-tracker-2026-08-02.xlsx',
    });

    render(<AnalyticsExportButtons filters={{}} />);
    await user.click(screen.getByRole('button', { name: /exportar excel/i }));

    await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalled());
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('muestra un error si la generación falla', async () => {
    const user = userEvent.setup();
    exportAnalyticsReport.mockRejectedValue(new Error('boom'));

    render(<AnalyticsExportButtons filters={{}} />);
    await user.click(screen.getByRole('button', { name: /exportar csv/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos generar el reporte/i);
  });

  it('deshabilita ambos botones mientras se genera el archivo', async () => {
    const user = userEvent.setup();
    let resolveExport;
    exportAnalyticsReport.mockReturnValue(new Promise((resolve) => { resolveExport = resolve; }));

    render(<AnalyticsExportButtons filters={{}} />);
    await user.click(screen.getByRole('button', { name: /exportar excel/i }));

    expect(await screen.findByRole('button', { name: /generando/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /exportar csv/i })).toBeDisabled();

    resolveExport({ blob: new Blob(['x']), filename: 'a.xlsx' });
  });
});
