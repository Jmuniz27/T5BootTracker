import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PaymentsPage from '../PaymentsPage';
import {
  getMyHistory,
  getMyStatus,
  getMyPrograms,
  getPrograms,
  uploadPayment,
  getOCRStatus,
  deleteMyPayment,
} from '../../api/payments.api';

vi.mock('../../api/payments.api', () => ({
  getMyHistory: vi.fn(),
  getMyStatus: vi.fn(),
  getMyPrograms: vi.fn(),
  getPrograms: vi.fn(),
  uploadPayment: vi.fn(),
  getOCRStatus: vi.fn(),
  confirmPayment: vi.fn(),
  updateMyPayment: vi.fn(),
  deleteMyPayment: vi.fn(),
}));

const PROGRAMA = { id: 'prog-1', name: 'Python Full Stack Abril 2026' };

const PAGO_APROBADO = {
  id: 'pay-approved',
  program: 'prog-1',
  program_name: 'Python Full Stack Abril 2026',
  status: 'APPROVED',
  confirmed_amount: '450.00',
  ocr_amount: '450.00',
  ocr_payment_date: '2026-04-15',
  submitted_at: '2026-04-15T10:00:00Z',
  rejection_reason: null,
};

const PAGO_PENDIENTE = {
  id: 'pay-pending',
  program: 'prog-1',
  program_name: 'Data Science Junio 2026',
  status: 'PENDING',
  confirmed_amount: null,
  ocr_amount: '300.00',
  ocr_payment_date: '2026-05-02',
  submitted_at: '2026-05-02T10:00:00Z',
  rejection_reason: null,
};

const PAGO_RECHAZADO = {
  id: 'pay-rejected',
  program: 'prog-1',
  program_name: 'Python Full Stack Abril 2026',
  status: 'REJECTED',
  confirmed_amount: null,
  ocr_amount: '120.00',
  ocr_payment_date: '2026-05-10',
  submitted_at: '2026-05-10T10:00:00Z',
  rejection_reason: 'El monto no coincide con el comprobante.',
};

const PAGO_BORRADOR = {
  id: 'pay-draft',
  program: 'prog-1',
  program_name: 'Python Full Stack Abril 2026',
  status: 'DRAFT',
  confirmed_amount: null,
  ocr_amount: null,
  ocr_payment_date: null,
  submitted_at: '2026-05-12T10:00:00Z',
  rejection_reason: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PaymentsPage />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('PaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // /my-programs/ (Enrollment activa) es la fuente primaria del selector.
    getMyPrograms.mockResolvedValue([PROGRAMA]);
    // Los bootcampers reciben 403 en /programs/; se deja como red de seguridad.
    getPrograms.mockResolvedValue([]);
    getMyHistory.mockResolvedValue([]);
    getMyStatus.mockResolvedValue({ deficit: '0.00' });
  });

  describe('estados de pago', () => {
    it('muestra cada estado con su etiqueta en español', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO, PAGO_PENDIENTE, PAGO_RECHAZADO, PAGO_BORRADOR]);
      renderPage();

      expect(await screen.findByText('Aprobado')).toBeInTheDocument();
      expect(screen.getByText('Pendiente')).toBeInTheDocument();
      expect(screen.getByText('Rechazado')).toBeInTheDocument();
      expect(screen.getByText('En revisión')).toBeInTheDocument();
    });

    it('acumula en "total pagado" sólo los pagos aprobados', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO, PAGO_PENDIENTE, PAGO_RECHAZADO]);
      renderPage();

      // Sólo PAGO_APROBADO (450) cuenta: pendientes y rechazados no suman.
      // El importe aparece dos veces —en la tarjeta de resumen y en la fila—,
      // así que se afirma sobre la tarjeta, que es la que hace la suma.
      const tarjeta = (await screen.findByText('Total pagado')).closest('div');
      expect(within(tarjeta).getByText('$450')).toBeInTheDocument();
      expect(within(tarjeta).getByText('1 pago aprobado')).toBeInTheDocument();
    });

    it('muestra el motivo del rechazo al bootcamper (HST-023)', async () => {
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      expect(
        await screen.findByText('El monto no coincide con el comprobante.'),
      ).toBeInTheDocument();
    });

    it('ofrece editar un pago rechazado y revisar uno en borrador', async () => {
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO, PAGO_BORRADOR]);
      renderPage();

      expect(await screen.findByRole('button', { name: 'Editar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Revisar' })).toBeInTheDocument();
    });

    it('no permite eliminar un pago aprobado', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      renderPage();

      await screen.findByText('Aprobado');
      // Sólo los pagos en revisión o rechazados son subsanables.
      expect(screen.queryByRole('button', { name: 'Eliminar pago' })).not.toBeInTheDocument();
    });

    it('avisa cuando el bootcamper no tiene pagos registrados', async () => {
      getMyHistory.mockResolvedValue([]);
      renderPage();

      expect(await screen.findByText('No tienes pagos registrados aún.')).toBeInTheDocument();
    });
  });

  describe('tarjeta de adeudado', () => {
    const tarjetaAdeudado = async () =>
      (await screen.findByText('Adeudado')).closest('div');

    it('muestra lo que falta pagar del precio acordado', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      getMyStatus.mockResolvedValue({ deficit: '750.00' });
      renderPage();

      expect(within(await tarjetaAdeudado()).getByText('$750')).toBeInTheDocument();
      expect(getMyStatus).toHaveBeenCalledWith(PROGRAMA.id);
    });

    it('suma el adeudado de todos los programas del bootcamper', async () => {
      getMyPrograms.mockResolvedValue([PROGRAMA, { id: 'prog-2', name: 'Data Science Junio 2026' }]);
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      getMyStatus.mockImplementation((id) =>
        Promise.resolve({ deficit: id === PROGRAMA.id ? '750.00' : '250.00' }),
      );
      renderPage();

      expect(within(await tarjetaAdeudado()).getByText('$1,000')).toBeInTheDocument();
    });

    it('dice "Sin deuda" cuando ya pagó todo', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      getMyStatus.mockResolvedValue({ deficit: '0.00' });
      renderPage();

      expect(within(await tarjetaAdeudado()).getByText('Sin deuda')).toBeInTheDocument();
    });

    it('aclara que los pagos en revisión no descuentan', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO, PAGO_PENDIENTE]);
      getMyStatus.mockResolvedValue({ deficit: '750.00' });
      renderPage();

      expect(
        within(await tarjetaAdeudado()).getByText('No incluye tus pagos en revisión'),
      ).toBeInTheDocument();
    });

    it('no inventa un cero cuando todavía no hay programa que consultar', async () => {
      // Sin pagos y sin ningún programa disponible (ni /my-programs/ ni /programs/):
      // un "$0" diría que no debe nada, que es lo contrario de su situación.
      getMyPrograms.mockResolvedValue([]);
      getPrograms.mockRejectedValue(new Error('403'));
      getMyHistory.mockResolvedValue([]);
      renderPage();

      expect(within(await tarjetaAdeudado()).getByText('—')).toBeInTheDocument();
      expect(getMyStatus).not.toHaveBeenCalled();
    });
  });

  describe('subida de comprobante', () => {
    it('envía el archivo y el programa seleccionados (HST-016)', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      uploadPayment.mockResolvedValue({ ...PAGO_BORRADOR });
      getOCRStatus.mockResolvedValue({ ocr_confidence: {} });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));

      const archivo = new File(['comprobante'], 'comprobante.png', { type: 'image/png' });
      const modal = screen.getByText('📄 Subir comprobante').closest('div.bg-white');
      const input = modal.querySelector('input[type="file"]');
      await user.upload(input, archivo);

      // CustomSelect no es un <select> nativo: se abre y se elige la opción.
      await user.click(screen.getByText('Selecciona un programa'));
      await user.click(screen.getByText(PROGRAMA.name));

      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(uploadPayment).toHaveBeenCalledTimes(1);
      const enviado = uploadPayment.mock.calls[0][0];
      expect(enviado).toBeInstanceOf(FormData);
      expect(enviado.get('receipt_file')).toBe(archivo);
      expect(enviado.get('program_id')).toBe(PROGRAMA.id);
    });

    it('no envía nada si falta el archivo o el programa', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));
      const modal = screen.getByText('📄 Subir comprobante').closest('div.bg-white');
      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(await screen.findByText('Selecciona un programa.')).toBeInTheDocument();
      expect(screen.getByText('Selecciona un comprobante.')).toBeInTheDocument();
      expect(uploadPayment).not.toHaveBeenCalled();
    });

    it('rechaza archivos de tipo no permitido', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));
      const zona = screen.getByText('PNG, JPG o PDF (máx. 10 MB)').closest('div');

      // Se prueba por arrastre y no por el input: el input declara
      // accept=".jpg,.jpeg,.png,.pdf" y userEvent respeta ese filtro, así que
      // el archivo nunca llegaría a la validación del componente. Al soltarlo
      // no hay filtro previo, que es justo el caso que debe cubrir.
      fireEvent.drop(zona, {
        dataTransfer: { files: [new File(['x'], 'notas.txt', { type: 'text/plain' })] },
      });

      expect(await screen.findByText('Solo PNG, JPG o PDF.')).toBeInTheDocument();
      expect(uploadPayment).not.toHaveBeenCalled();
    });

    it('rechaza archivos de más de 10 MB', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));
      const zona = screen.getByText('PNG, JPG o PDF (máx. 10 MB)').closest('div');

      const pesado = new File(['x'], 'grande.png', { type: 'image/png' });
      Object.defineProperty(pesado, 'size', { value: 11 * 1024 * 1024 });
      fireEvent.drop(zona, { dataTransfer: { files: [pesado] } });

      expect(await screen.findByText('Máximo 10 MB.')).toBeInTheDocument();
      expect(uploadPayment).not.toHaveBeenCalled();
    });

    it('informa al bootcamper si la subida falla', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      uploadPayment.mockRejectedValue({ response: { data: { error: 'Comprobante duplicado.' } } });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));
      const modal = screen.getByText('📄 Subir comprobante').closest('div.bg-white');
      const input = modal.querySelector('input[type="file"]');
      await user.upload(input, new File(['x'], 'c.png', { type: 'image/png' }));
      await user.click(screen.getByText('Selecciona un programa'));
      await user.click(screen.getByText(PROGRAMA.name));
      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(await screen.findByText('Comprobante duplicado.')).toBeInTheDocument();
    });

    it('muestra el detalle de un error de validación DRF en vez del mensaje genérico', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      uploadPayment.mockRejectedValue({
        response: { data: { receipt_file: ['El archivo no puede superar 10 MB.'] } },
      });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));
      const modal = screen.getByText('📄 Subir comprobante').closest('div.bg-white');
      const input = modal.querySelector('input[type="file"]');
      await user.upload(input, new File(['x'], 'c.png', { type: 'image/png' }));
      await user.click(screen.getByText('Selecciona un programa'));
      await user.click(screen.getByText(PROGRAMA.name));
      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(await screen.findByText('El archivo no puede superar 10 MB.')).toBeInTheDocument();
      expect(screen.queryByText('Error al subir el comprobante.')).not.toBeInTheDocument();
    });

    it('un bootcamper recién convertido sin pagos previos ve su programa inscrito (issue #293)', async () => {
      const user = userEvent.setup();
      // Sin pagos previos: el fallback por historial daría lista vacía.
      // /my-programs/ debe alimentar el selector igual.
      getMyHistory.mockResolvedValue([]);
      getMyPrograms.mockResolvedValue([PROGRAMA]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));

      expect(screen.getByText('Selecciona un programa')).toBeInTheDocument();
      await user.click(screen.getByText('Selecciona un programa'));
      expect(screen.getByText(PROGRAMA.name)).toBeInTheDocument();
    });

    it('muestra un estado vacío explícito si no tiene ninguna inscripción', async () => {
      getMyHistory.mockResolvedValue([]);
      getMyPrograms.mockResolvedValue([]);
      getPrograms.mockResolvedValue([]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));

      expect(await screen.findByTestId('upload-no-programs')).toBeInTheDocument();
      expect(screen.queryByText('Selecciona un programa')).not.toBeInTheDocument();
      expect(within(screen.getByText('📄 Subir comprobante').closest('div.bg-white')).getByRole('button', { name: 'Subir comprobante' })).toBeDisabled();
    });
  });

  describe('eliminación de un pago', () => {
    it('pide confirmación antes de eliminar', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Eliminar pago' }));

      expect(screen.getByRole('heading', { name: 'Eliminar pago' })).toBeInTheDocument();
      // Todavía no se llamó a la API: la confirmación es un paso aparte.
      expect(deleteMyPayment).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Eliminar' }));
      // TanStack Query pasa su propio contexto como segundo argumento del
      // mutationFn, así que sólo se afirma sobre el id.
      expect(deleteMyPayment).toHaveBeenCalledTimes(1);
      expect(deleteMyPayment.mock.calls[0][0]).toBe(PAGO_RECHAZADO.id);
    });

    it('no elimina si el bootcamper cancela', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Eliminar pago' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(deleteMyPayment).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Eliminar pago' })).not.toBeInTheDocument();
    });
  });
});
