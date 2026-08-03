import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import App from '../App';
import { useAuthStore } from '../store/auth.store';

vi.mock('../pages/LoginPage', () => ({ default: () => <div>LoginPage</div> }));
vi.mock('../pages/ForgotPasswordPage', () => ({ default: () => <div>ForgotPasswordPage</div> }));
vi.mock('../pages/CheckEmailPage', () => ({ default: () => <div>CheckEmailPage</div> }));
vi.mock('../pages/ResetPasswordPage', () => ({ default: () => <div>ResetPasswordPage</div> }));
vi.mock('../pages/ResetSuccessPage', () => ({ default: () => <div>ResetSuccessPage</div> }));
vi.mock('../pages/LeadsDashboard', () => ({ default: () => <div>LeadsDashboard</div> }));
vi.mock('../pages/UsersPage', () => ({ default: () => <div>UsersPage</div> }));
vi.mock('../pages/AnalyticsPage', () => ({ default: () => <div>AnalyticsPage</div> }));
vi.mock('../pages/AgendaPage', () => ({ default: () => <div>AgendaPage</div> }));
vi.mock('../pages/PaymentsPage', () => ({ default: () => <div>PaymentsPage</div> }));
vi.mock('../pages/FinancePaymentsPage', () => ({ default: () => <div>FinancePaymentsPage</div> }));
vi.mock('../pages/BootcamperPaymentDetailPage', () => ({ default: () => <div>BootcamperPaymentDetailPage</div> }));
vi.mock('../pages/AdminPortfoliosPage', () => ({ default: () => <div>AdminPortfoliosPage</div> }));
vi.mock('../pages/AdminSalespersonActivityPage', () => ({ default: () => <div>AdminSalespersonActivityPage</div> }));
vi.mock('../pages/AdminFinanceDetailPage', () => ({ default: () => <div>AdminFinanceDetailPage</div> }));
vi.mock('../pages/ProgramsPage', () => ({ default: () => <div>ProgramsPage</div> }));
vi.mock('../pages/ProgramDetailPage', () => ({ default: () => <div>ProgramDetailPage</div> }));
vi.mock('../components/layout/AppLayout', () => ({
  default: () => {
    const { Outlet } = require('react-router-dom');
    return <Outlet />;
  },
}));

function renderAt(role, path = '/payments') {
  useAuthStore.setState({ accessToken: 'token', user: role ? { id: 'u1', role } : null });
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('PaymentsRoute dispatch', () => {
  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('BOOTCAMPER ve PaymentsPage', () => {
    renderAt('BOOTCAMPER');
    expect(screen.getByText('PaymentsPage')).toBeInTheDocument();
  });

  it('ADMINISTRATOR ve AdminPortfoliosPage', () => {
    renderAt('ADMINISTRATOR');
    expect(screen.getByText('AdminPortfoliosPage')).toBeInTheDocument();
  });

  it('FINANCE ve FinancePaymentsPage', () => {
    renderAt('FINANCE');
    expect(screen.getByText('FinancePaymentsPage')).toBeInTheDocument();
  });

  it('SALESPERSON es redirigido a /dashboard, no ve pantalla de pagos', () => {
    renderAt('SALESPERSON');
    expect(screen.getByText('LeadsDashboard')).toBeInTheDocument();
    expect(screen.queryByText('FinancePaymentsPage')).not.toBeInTheDocument();
  });

  it('COORDINATOR es redirigido a /dashboard, no cae en Finanzas por descarte', () => {
    renderAt('COORDINATOR');
    expect(screen.getByText('LeadsDashboard')).toBeInTheDocument();
    expect(screen.queryByText('FinancePaymentsPage')).not.toBeInTheDocument();
  });

  it('un vendedor que navega directo al detalle de pago es redirigido a /dashboard', () => {
    renderAt('SALESPERSON', '/payments/boot-1/prog-1');
    expect(screen.getByText('LeadsDashboard')).toBeInTheDocument();
    expect(screen.queryByText('BootcamperPaymentDetailPage')).not.toBeInTheDocument();
  });

  it('FINANCE puede ver el detalle de pago de un bootcamper', () => {
    renderAt('FINANCE', '/payments/boot-1/prog-1');
    expect(screen.getByText('BootcamperPaymentDetailPage')).toBeInTheDocument();
  });

  it('/my-leads ya no existe: cae en el catch-all', () => {
    renderAt('SALESPERSON', '/my-leads');
    expect(screen.getByText('LoginPage')).toBeInTheDocument();
  });
});
