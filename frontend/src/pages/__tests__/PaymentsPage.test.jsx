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

/** La tabla del historial, que sólo se muestra desde `sm`. */
const tablaHistorial = () => screen.findByRole('table');

/** Abre el menú de acciones de la fila que corresponde a un pago.
 *  Se ancla en la tabla: bajo `sm` los mismos pagos se repiten como tarjetas y
 *  una búsqueda global encontraría dos coincidencias. */
async function abrirAcciones(user, programName = PROGRAMA.name) {
  const tabla = await tablaHistorial();
  const fila = (await within(tabla).findByText(programName)).closest('tr');
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
    // /my-programs/ (Enrollment activa) alimenta la tarjeta de "adeudado".
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

      const tabla = within(await tablaHistorial());
      expect(await tabla.findByText('Aprobado')).toBeInTheDocument();
      expect(tabla.getByText('Pendiente')).toBeInTheDocument();
      expect(tabla.getByText('Rechazado')).toBeInTheDocument();
      expect(tabla.getByText('En revisión')).toBeInTheDocument();
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

      const tabla = await tablaHistorial();
      for (const encabezado of ['Programa', 'Fecha', 'Monto', 'Estado', 'Acciones']) {
        expect(within(tabla).getByRole('columnheader', { name: encabezado })).toBeInTheDocument();
      }
      expect(await within(tabla).findAllByTestId('payment-row')).toHaveLength(2);
    });

    it('pone el estado en su columna, no junto a las acciones', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      renderPage();

      const tabla = await tablaHistorial();
      const fila = (await within(tabla).findByText(PROGRAMA.name)).closest('tr');
      const celdas = within(fila).getAllByRole('cell');
      // Programa · Fecha · Monto · Estado · Acciones
      expect(celdas).toHaveLength(5);
      expect(within(celdas[3]).getByText('Aprobado')).toBeInTheDocument();
    });

    it('avisa cuando el bootcamper no tiene pagos registrados', async () => {
      getMyHistory.mockResolvedValue([]);
      renderPage();

      expect(await screen.findByText('No tienes pagos registrados aún.')).toBeInTheDocument();
      // Izado fuera de la tabla y de la lista de tarjetas: se pinta una vez.
      expect(screen.getAllByText('No tienes pagos registrados aún.')).toHaveLength(1);
    });
  });

  // jsdom no tiene motor de layout: las media queries nunca coinciden y no hay
  // anchos que medir. Estas pruebas afirman sobre las clases que *son* el
  // comportamiento — las que deciden qué se ve en cada tamaño— y sobre la
  // estructura. Lo que se puede medir de verdad vive en la suite móvil de
  // Playwright (e2e/tests/mobile/).
  describe('presentación responsiva', () => {
    it('la tabla y la lista de tarjetas se excluyen por breakpoint', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO]);
      renderPage();

      await screen.findAllByTestId('payment-card');
      // Sin estas dos clases se verían las dos presentaciones a la vez.
      expect(screen.getByTestId('payments-card-list')).toHaveClass('sm:hidden');
      expect(screen.getByTestId('payments-table-wrapper')).toHaveClass('hidden', 'sm:block');
    });

    it('hay una tarjeta por pago', async () => {
      getMyHistory.mockResolvedValue([PAGO_APROBADO, PAGO_RECHAZADO]);
      renderPage();

      expect(await screen.findAllByTestId('payment-card')).toHaveLength(2);
    });

    it('la tarjeta ofrece el mismo menú de acciones que la fila', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      // Si la fila y la tarjeta derivan, este es el test que se entera.
      const [tarjeta] = await screen.findAllByTestId('payment-card');
      await user.click(within(tarjeta).getByRole('button', { name: /^Acciones del pago/ }));

      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver motivo' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    });

    it('la tarjeta tampoco imprime el motivo del rechazo (HST-023)', async () => {
      getMyHistory.mockResolvedValue([PAGO_RECHAZADO]);
      renderPage();

      const [tarjeta] = await screen.findAllByTestId('payment-card');
      expect(
        within(tarjeta).queryByText('El monto no coincide con el comprobante.'),
      ).not.toBeInTheDocument();
    });

    it('la página no impone una altura mínima propia dentro del layout', async () => {
      getMyHistory.mockResolvedValue([]);
      const { container } = renderPage();

      await screen.findByText('No tienes pagos registrados aún.');
      // Ya vive dentro del `h-screen` de AppLayout: repetirlo agregaba una
      // pantalla muerta de scroll que sólo se nota en móvil.
      expect(container.firstChild).not.toHaveClass('min-h-screen');
    });

    it('la ayuda de arrastrar el archivo sólo se muestra en escritorio', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByTestId('upload-button'));

      // En una pantalla táctil no hay nada que arrastrar.
      expect(screen.getByText(/arrastra el archivo/)).toHaveClass('hidden', 'sm:inline');
    });

    it('la ventana de subida acota su alto y sólo desplaza el cuerpo', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByTestId('upload-button'));
      const panel = screen.getByRole('dialog', { name: 'Subir comprobante' });

      // Sin acotar el alto, el panel crece más que la ventana y se recorta por
      // los dos extremos; y como useModalA11y bloquea el scroll del body, lo
      // que se sale queda inalcanzable.
      expect(panel).toHaveClass('max-h-full', 'flex', 'flex-col', 'overflow-hidden');

      // El botón de enviar vive FUERA de la región que se desplaza: en una
      // ventana baja tiene que seguir a la vista sin scrollear. Es la mitad del
      // arreglo que una clase en el panel no puede garantizar.
      expect(screen.getByTestId('upload-submit').closest('.overflow-y-auto')).toBeNull();

      // Y la dropzone sí vive dentro de ella.
      const zona = screen.getByText('PNG, JPG o PDF (máx. 10 MB)').closest('div');
      expect(zona.closest('.overflow-y-auto')).not.toBeNull();
    });

    it('el panel de subida conserva la clase por la que lo encuentran las pruebas', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByTestId('upload-button'));

      // Varias pruebas de este archivo seleccionan el panel con
      // .closest('div.bg-white'). Si un refactor mueve el fondo a un envoltorio
      // interno fallan todas con un mensaje que no explica nada; esta falla
      // diciendo qué pasó.
      expect(screen.getByRole('dialog', { name: 'Subir comprobante' })).toHaveClass('bg-white');
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

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');

      expect(within(modal).queryByText('Programa')).not.toBeInTheDocument();
      expect(screen.queryByText('Selecciona un programa')).not.toBeInTheDocument();
    });

    it('no envía nada si falta el archivo', async () => {
      const user = userEvent.setup();
      getMyHistory.mockResolvedValue([]);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Subir pago' }));
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');
      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(await screen.findByText('Selecciona un comprobante.')).toBeInTheDocument();
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
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');
      const input = modal.querySelector('input[type="file"]');
      await user.upload(input, new File(['x'], 'c.png', { type: 'image/png' }));
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
      const modal = screen.getByRole('heading', { name: 'Subir comprobante' }).closest('div.bg-white');
      const input = modal.querySelector('input[type="file"]');
      await user.upload(input, new File(['x'], 'c.png', { type: 'image/png' }));
      await user.click(within(modal).getByRole('button', { name: 'Subir comprobante' }));

      expect(await screen.findByText('El archivo no puede superar 10 MB.')).toBeInTheDocument();
      expect(screen.queryByText('Error al subir el comprobante.')).not.toBeInTheDocument();
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
