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

describe('PaymentDetailModal — pestañas según el estado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMonitoring.mockResolvedValue([]);
  });

  it('un pago pendiente sí ofrece aprobar o rechazar', async () => {
    getPayment.mockResolvedValue(PENDIENTE);
    renderModal();

    expect(await screen.findByTestId('payment-tab-details')).toBeInTheDocument();
    expect(screen.getByTestId('payment-tab-raw')).toBeInTheDocument();
    expect(screen.getByTestId('payment-tab-action')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-tab-reason')).not.toBeInTheDocument();
  });

  it('un pago aprobado sólo muestra campos OCR y texto crudo', async () => {
    getPayment.mockResolvedValue(APROBADO);
    renderModal();

    expect(await screen.findByTestId('payment-tab-details')).toBeInTheDocument();
    expect(screen.getByTestId('payment-tab-raw')).toBeInTheDocument();
    // Es historial: la solicitud ya fue resuelta y el backend rechazaría aprobarla otra vez.
    expect(screen.queryByTestId('payment-tab-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-tab-reason')).not.toBeInTheDocument();
  });

  it('un pago rechazado agrega el motivo y tampoco ofrece aprobar', async () => {
    getPayment.mockResolvedValue(RECHAZADO);
    renderModal();

    expect(await screen.findByTestId('payment-tab-reason')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-tab-action')).not.toBeInTheDocument();
  });

  it('el motivo del rechazo se lee en su pestaña', async () => {
    const user = userEvent.setup();
    getPayment.mockResolvedValue(RECHAZADO);
    renderModal();

    // No se ve hasta abrir la pestaña.
    expect(await screen.findByTestId('payment-tab-reason')).toBeInTheDocument();
    expect(screen.queryByText('El comprobante no es legible.')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('payment-tab-reason'));

    expect(screen.getByTestId('payment-rejection-reason')).toHaveTextContent(
      'El comprobante no es legible.',
    );
    expect(screen.getByText(/rechazado por finanzas uno/i)).toBeInTheDocument();
  });

  it('arranca en campos OCR y no en la pestaña del motivo', async () => {
    getPayment.mockResolvedValue(RECHAZADO);
    renderModal();

    expect(await screen.findByText('Banco Pichincha')).toBeInTheDocument();
  });

  it('un rechazo sin motivo registrado lo dice en vez de quedar vacío', async () => {
    const user = userEvent.setup();
    getPayment.mockResolvedValue({ ...RECHAZADO, rejection_reason: '' });
    renderModal();

    await user.click(await screen.findByTestId('payment-tab-reason'));

    expect(screen.getByTestId('payment-rejection-reason')).toHaveTextContent(
      'No se registró un motivo.',
    );
  });
});
