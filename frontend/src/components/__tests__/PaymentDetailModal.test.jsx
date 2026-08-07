import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PaymentDetailModal from '../PaymentDetailModal';
import { getPayment, getMonitoring } from '../../api/payments.api';

vi.mock('../../api/payments.api', () => ({
  getPayment: vi.fn(),
  approvePayment: vi.fn(),
  rejectPayment: vi.fn(),
  notifyCoordinator: vi.fn(),
  getMonitoring: vi.fn(),
}));

const BASE = {
  id: 'pay-1',
  bootcamper: 'bc-1',
  bootcamper_name: 'Ana Torres',
  program: 'prog-1',
  program_name: 'Python Full Stack',
  receipt_file: '/api/payments/receipt/?st=token-firmado',
  receipt_file_type: 'image',
  ocr_bank_name: 'Banco Pichincha',
  ocr_account_last_digits: '4321',
  ocr_amount: '200.00',
  ocr_transaction_id: 'TX-9',
  ocr_payment_date: '2026-07-01',
  ocr_raw_text: 'TRANSFERENCIA EXITOSA 200.00',
  ocr_confidence: { bank_name: 0.9, amount: 0.95 },
  rejection_reason: '',
  validated_by_name: null,
  validated_at: null,
};

const PENDIENTE = { ...BASE, status: 'PENDING' };

const APROBADO = {
  ...BASE,
  status: 'APPROVED',
  confirmed_amount: '200.00',
  validated_by_name: 'Finanzas Uno',
  validated_at: '2026-07-02T09:00:00Z',
};

const RECHAZADO = {
  ...BASE,
  status: 'REJECTED',
  rejection_reason: 'El comprobante no es legible.',
  validated_by_name: 'Finanzas Uno',
  validated_at: '2026-07-02T09:00:00Z',
};

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentDetailModal
        paymentId="pay-1"
        bootcamperId="bc-1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMonitoring.mockResolvedValue([]);
});

describe('PaymentDetailModal — el comprobante es la validación oficial', () => {
  it('muestra el comprobante junto a los datos', async () => {
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    expect(await screen.findByTestId('receipt-preview')).toBeInTheDocument();
    expect(screen.getByAltText('Comprobante')).toHaveAttribute(
      'src',
      '/api/payments/receipt/?st=token-firmado',
    );
  });

  it('permite abrirlo o descargarlo aparte, para leer uno ilegible en pequeño', async () => {
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    const link = await screen.findByTestId('receipt-open');
    expect(link).toHaveAttribute('href', '/api/payments/receipt/?st=token-firmado');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('avisa cuando no hay comprobante en vez de dejar el hueco vacío', async () => {
    getPayment.mockResolvedValue({ ...PENDIENTE, receipt_file: null });
    renderModal();

    expect(await screen.findByText('Comprobante no disponible')).toBeInTheDocument();
    expect(screen.queryByTestId('receipt-open')).not.toBeInTheDocument();
  });
});

describe('PaymentDetailModal — campos precargados y editables', () => {
  it('precarga lo que leyó el escaneo en vez de pedir que se reescriba', async () => {
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    expect(await screen.findByTestId('approve-amount')).toHaveValue('200.00');
    expect(screen.getByTestId('confirmed_bank_name')).toHaveValue('Banco Pichincha');
    expect(screen.getByTestId('confirmed_transaction_id')).toHaveValue('TX-9');
  });

  it('Finanzas puede corregir lo que el escaneo leyó mal', async () => {
    const user = userEvent.setup();
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    const amount = await screen.findByTestId('approve-amount');
    await user.clear(amount);
    await user.type(amount, '250.50');

    expect(amount).toHaveValue('250.50');
  });

  it('el monto no admite letras ni más de dos decimales', async () => {
    const user = userEvent.setup();
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    const amount = await screen.findByTestId('approve-amount');
    await user.clear(amount);
    await user.type(amount, '12a3,4567');

    expect(amount).toHaveValue('123.45');
  });

  it('un pago ya resuelto muestra sus datos, pero no deja editarlos', async () => {
    getPayment.mockResolvedValue(APROBADO);
    renderModal();

    expect(await screen.findByTestId('approve-amount')).toBeDisabled();
  });

  it('muestra la confianza del escaneo con las claves que emite el backend', async () => {
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    expect(await screen.findByText('95%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });
});

describe('PaymentDetailModal — acciones según el estado', () => {
  it('un pago pendiente ofrece aprobar y rechazar en la misma vista', async () => {
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    expect(await screen.findByTestId('approve-submit')).toBeInTheDocument();
    expect(screen.getByTestId('reject-open')).toBeInTheDocument();
  });

  it('un pago aprobado no ofrece resolverlo otra vez', async () => {
    getPayment.mockResolvedValue(APROBADO);
    renderModal();

    // Es historial: el backend rechazaría aprobarlo de nuevo.
    await screen.findByTestId('receipt-preview');
    expect(screen.queryByTestId('approve-submit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reject-open')).not.toBeInTheDocument();
  });

  it('el motivo del rechazo se lee sin tener que buscarlo', async () => {
    getPayment.mockResolvedValue(RECHAZADO);
    renderModal();

    expect(await screen.findByTestId('payment-rejection-reason')).toHaveTextContent(
      'El comprobante no es legible.',
    );
    expect(screen.getByText(/rechazado por finanzas uno/i)).toBeInTheDocument();
    expect(screen.queryByTestId('approve-submit')).not.toBeInTheDocument();
  });

  it('un rechazo sin motivo registrado lo dice en vez de quedar vacío', async () => {
    getPayment.mockResolvedValue({ ...RECHAZADO, rejection_reason: '' });
    renderModal();

    expect(await screen.findByTestId('payment-rejection-reason')).toHaveTextContent(
      'No se registró un motivo.',
    );
  });

  it('el motivo de rechazo se pide antes de poder confirmarlo', async () => {
    const user = userEvent.setup();
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    await user.click(await screen.findByTestId('reject-open'));

    expect(screen.getByTestId('reject-submit')).toBeDisabled();

    await user.type(screen.getByTestId('reject-reason'), 'Monto no coincide.');
    expect(screen.getByTestId('reject-submit')).toBeEnabled();
  });
});

describe('PaymentDetailModal — texto crudo del escaneo', () => {
  it('viene colapsado: es diagnóstico, no algo que se mire siempre', async () => {
    const user = userEvent.setup();
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    await screen.findByTestId('toggle-raw-text');
    expect(screen.queryByText('TRANSFERENCIA EXITOSA 200.00')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-raw-text'));
    expect(screen.getByText('TRANSFERENCIA EXITOSA 200.00')).toBeInTheDocument();
  });
});
