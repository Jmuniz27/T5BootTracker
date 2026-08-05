import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentHistory from '../PaymentHistory';

const APROBADO = {
  id: 'p-1',
  status: 'APPROVED',
  confirmed_amount: '200.00',
  ocr_amount: '200.00',
  submitted_at: '2026-07-01T10:00:00Z',
  validated_at: '2026-07-02T09:00:00Z',
  validated_by_name: 'Finanzas Uno',
  rejection_reason: '',
};

const RECHAZADO = {
  id: 'p-2',
  status: 'REJECTED',
  confirmed_amount: null,
  ocr_amount: '150.00',
  submitted_at: '2026-06-01T10:00:00Z',
  validated_at: '2026-06-02T09:00:00Z',
  validated_by_name: 'Finanzas Uno',
  rejection_reason: 'El comprobante no es legible.',
};

const PENDIENTE = {
  id: 'p-3',
  status: 'PENDING',
  confirmed_amount: null,
  ocr_amount: '80.00',
  submitted_at: '2026-08-01T10:00:00Z',
  validated_at: null,
  validated_by_name: null,
  rejection_reason: '',
};

describe('PaymentHistory', () => {
  it('muestra aprobadas, rechazadas y pendientes', () => {
    render(<PaymentHistory items={[PENDIENTE, APROBADO, RECHAZADO]} onViewDetail={vi.fn()} />);

    expect(screen.getByText('Aprobado')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('muestra el motivo del rechazo', () => {
    // Es el dato que se perdía al salir de la cola de pendientes.
    render(<PaymentHistory items={[RECHAZADO]} onViewDetail={vi.fn()} />);

    expect(screen.getByText(/el comprobante no es legible/i)).toBeInTheDocument();
  });

  it('no muestra motivo en las aprobadas', () => {
    render(<PaymentHistory items={[APROBADO]} onViewDetail={vi.fn()} />);

    expect(screen.queryByText(/motivo del rechazo/i)).not.toBeInTheDocument();
  });

  it('dice quién revisó y cuándo', () => {
    render(<PaymentHistory items={[APROBADO]} onViewDetail={vi.fn()} />);

    expect(screen.getByText(/revisado por finanzas uno/i)).toBeInTheDocument();
  });

  it('aclara cuando el monto es el del comprobante y no el confirmado', () => {
    render(<PaymentHistory items={[PENDIENTE]} onViewDetail={vi.fn()} />);

    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getByText(/según el comprobante/i)).toBeInTheDocument();
  });

  it('usa el monto confirmado cuando existe', () => {
    render(<PaymentHistory items={[APROBADO]} onViewDetail={vi.fn()} />);

    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.queryByText(/según el comprobante/i)).not.toBeInTheDocument();
  });

  it('avisa cuando no hay solicitudes', () => {
    render(<PaymentHistory items={[]} onViewDetail={vi.fn()} />);

    expect(screen.getByText(/todavía no hay solicitudes/i)).toBeInTheDocument();
  });

  it('esconde el excedente tras un botón y lo despliega', async () => {
    const user = userEvent.setup();
    const muchas = Array.from({ length: 8 }, (_, i) => ({ ...APROBADO, id: `p-${i}` }));

    render(<PaymentHistory items={muchas} onViewDetail={vi.fn()} />);

    expect(screen.getAllByText('Aprobado')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: /ver 3 solicitudes más/i }));
    expect(screen.getAllByText('Aprobado')).toHaveLength(8);
  });

  it('deja abrir el detalle de una solicitud', async () => {
    const user = userEvent.setup();
    const onViewDetail = vi.fn();
    render(<PaymentHistory items={[APROBADO]} onViewDetail={onViewDetail} />);

    await user.click(screen.getByRole('button', { name: /^ver$/i }));

    expect(onViewDetail).toHaveBeenCalledWith(APROBADO);
  });

  it('muestra esqueletos mientras carga', () => {
    render(<PaymentHistory items={[]} isLoading onViewDetail={vi.fn()} />);

    expect(screen.queryByText(/todavía no hay solicitudes/i)).not.toBeInTheDocument();
  });
});
