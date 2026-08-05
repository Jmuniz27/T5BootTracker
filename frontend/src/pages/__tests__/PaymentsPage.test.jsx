import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PaymentsPage from '../PaymentsPage';
import {
  getMyHistory,
  uploadPayment,
  getOCRStatus,
  deleteMyPayment,
} from '../../api/payments.api';

vi.mock('../../api/payments.api', () => ({
  getMyHistory: vi.fn(),
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

/** Abre el menú de acciones de la fila que corresponde a un pago. */
async function abrirAcciones(user, programName = PROGRAMA.name) {
  const fila = (await screen.findByText(programName)).closest('tr');
  await user.click(within(fila).getByRole('button', { name: /^Acciones del pago/ }));
  return fila;
}

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
    getMyHistory.mockResolvedValue([]);
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
      const tarjeta = (await screen.findByText('Total Paid')).closest('div');
      expect(within(tarjeta).getByText('$450')).toBeInTheDocument();
      expect(within(tarjeta).getByText('1 approved payment')).toBeInTheDocument();
    });

    it('muestra el motivo del rechazo en su propia ventana (HST-023)', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      // Ya no se imprime en la fila: compite por espacio y se corta.
      expect(
        screen.queryByText('El monto no coincide con el comprobante.'),
      ).not.toBeInTheDocument();

      await abrirAcciones(user);
      await user.click(screen.getByRole('button', { name: 'Ver motivo' }));

      expect(screen.getByRole('heading', { name: 'Motivo del rechazo' })).toBeInTheDocument();
      expect(
        screen.getByText('El monto no coincide con el comprobante.'),
      ).toBeInTheDocument();
    });

    it('ofrece editar, ver motivo y eliminar en un pago rechazado', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      await abrirAcciones(user);

      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver motivo' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    });

    it('ofrece revisar y eliminar un borrador', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_BORRADOR]);
      renderPage();

      await abrirAcciones(user);

      expect(screen.getByRole('button', { name: 'Revisar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    });

    it('en un pago aprobado sólo ofrece consultarlo', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      renderPage();

      await abrirAcciones(user);

      expect(screen.getByRole('button', { name: 'Ver información' })).toBeInTheDocument();
      // Sólo los pagos en revisión o rechazados son subsanables.
      expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    });

    it('un pago pendiente también se puede consultar', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_PENDIENTE]);
      renderPage();

      await abrirAcciones(user, PAGO_PENDIENTE.program_name);

      expect(screen.getByRole('button', { name: 'Ver información' })).toBeInTheDocument();
    });

    it('la ventana de consulta muestra los datos sin permitir editarlos', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      renderPage();

      await abrirAcciones(user);
      await user.click(screen.getByRole('button', { name: 'Ver información' }));

      expect(screen.getByRole('heading', { name: 'Detalle del pago' })).toBeInTheDocument();
      // Sin envío posible: la ventana es sólo de lectura.
      expect(screen.queryByTestId('confirm-payment-submit')).not.toBeInTheDocument();
      const monto = screen.getByDisplayValue(PAGO_APROBADO.confirmed_amount);
      expect(monto).toHaveAttribute('readonly');
    });

    it('presenta el historial como tabla, con una fila por pago', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO, PAGO_RECHAZADO]);
      renderPage();

      await screen.findByText('Aprobado');
      const tabla = screen.getByRole('table');
      for (const encabezado of ['Programa', 'Fecha', 'Monto', 'Estado', 'Acciones']) {
        expect(within(tabla).getByRole('columnheader', { name: encabezado })).toBeInTheDocument();
      }
      expect(screen.getAllByTestId('payment-row')).toHaveLength(2);
    });

    it('pone el estado en su columna, no junto a las acciones', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      renderPage();

      const fila = (await screen.findByText(PROGRAMA.name)).closest('tr');
      const celdas = within(fila).getAllByRole('cell');
      // Programa · Fecha · Monto · Estado · Acciones
      expect(celdas).toHaveLength(5);
      expect(within(celdas[3]).getByText('Aprobado')).toBeInTheDocument();
    });

    it('avisa cuando el bootcamper no tiene pagos registrados', async () => {
      getMyHistory.mockResolvedValue([]);
      renderPage();

      expect(await screen.findByText('No tienes pagos registrados aún.')).toBeInTheDocument();
    });
  });

  describe('subida de comprobante', () => {
    it('envía el archivo y el programa seleccionados (HST-016)', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      uploadPayment.mockResolvedValue({ ...PAGO_BORRADOR });
      getOCRStatus.mockResolvedValue({ ocr_confidence: {} });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Upload payment' }));

      const archivo = new File(['comprobante'], 'comprobante.png', { type: 'image/png' });
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');
      const input = modal.querySelector('input[type="file"]');
      await user.upload(input, archivo);

      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(uploadPayment).toHaveBeenCalledTimes(1);
      const enviado = uploadPayment.mock.calls[0][0];
      expect(enviado).toBeInstanceOf(FormData);
      expect(enviado.get('receipt_file')).toBe(archivo);
      // El programa lo deduce el backend de la inscripción activa: el bootcamper
      // ya no lo elige, y sin esto no podía subir su primer comprobante.
      expect(enviado.get('program_id')).toBeNull();
    });

    it('no pide elegir programa', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Upload payment' }));
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');

      expect(within(modal).queryByText('Programa')).not.toBeInTheDocument();
      expect(screen.queryByText('Selecciona un programa')).not.toBeInTheDocument();
    });

    it('no envía nada si falta el archivo', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Upload payment' }));
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');
      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(await screen.findByText('Selecciona un comprobante.')).toBeInTheDocument();
      expect(uploadPayment).not.toHaveBeenCalled();
    });

    it('rechaza archivos de tipo no permitido', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Upload payment' }));
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

      await user.click(await screen.findByRole('button', { name: 'Upload payment' }));
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

      await user.click(await screen.findByRole('button', { name: 'Upload payment' }));
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');
      const input = modal.querySelector('input[type="file"]');
      await user.upload(input, new File(['x'], 'c.png', { type: 'image/png' }));
      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(await screen.findByText('Comprobante duplicado.')).toBeInTheDocument();
    });
  });

  describe('eliminación de un pago', () => {
    it('pide confirmación antes de eliminar', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      await abrirAcciones(user);
      await user.click(screen.getByRole('button', { name: 'Eliminar' }));

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

      await abrirAcciones(user);
      await user.click(screen.getByRole('button', { name: 'Eliminar' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(deleteMyPayment).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Eliminar pago' })).not.toBeInTheDocument();
    });
  });
});
