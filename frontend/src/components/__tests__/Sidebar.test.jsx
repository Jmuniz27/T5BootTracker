import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../layout/Sidebar';
import { useAuthStore } from '../../store/auth.store';

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe('Sidebar — visibilidad del enlace de Usuarios', () => {
  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('muestra "Usuarios" al Administrador', () => {
    useAuthStore.setState({ user: { id: 'u1', role: 'ADMINISTRATOR' } });
    renderSidebar();
    expect(screen.getByRole('link', { name: /usuarios/i })).toHaveAttribute('href', '/admin/users');
  });

  it.each(['SALESPERSON', 'COORDINATOR', 'FINANCE', 'BOOTCAMPER'])(
    'oculta "Usuarios" para el rol %s',
    (role) => {
      useAuthStore.setState({ user: { id: 'u1', role } });
      renderSidebar();
      expect(screen.queryByRole('link', { name: /usuarios/i })).not.toBeInTheDocument();
    },
  );
});

describe('Sidebar — visibilidad del enlace de Pagos', () => {
  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it.each(['ADMINISTRATOR', 'FINANCE', 'BOOTCAMPER'])(
    'muestra "Payment" para el rol %s',
    (role) => {
      useAuthStore.setState({ user: { id: 'u1', role } });
      renderSidebar();
      expect(screen.getByRole('link', { name: /payment/i })).toHaveAttribute('href', '/payments');
    },
  );

  it('oculta "Payment" al Vendedor', () => {
    // El cobro es de Finanzas; la API le responde 403 en cada endpoint de pagos.
    useAuthStore.setState({ user: { id: 'u1', role: 'SALESPERSON' } });
    renderSidebar();
    expect(screen.queryByRole('link', { name: /payment/i })).not.toBeInTheDocument();
  });

  it('deja el Dashboard al Vendedor', () => {
    useAuthStore.setState({ user: { id: 'u1', role: 'SALESPERSON' } });
    renderSidebar();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
  });
});

describe('Sidebar — visibilidad del enlace de Analítica (HST-024)', () => {
  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('muestra "Analítica" al Administrador', () => {
    useAuthStore.setState({ user: { id: 'u1', role: 'ADMINISTRATOR' } });
    renderSidebar();
    expect(screen.getByRole('link', { name: /analítica/i })).toHaveAttribute('href', '/analytics');
  });

  it.each(['SALESPERSON', 'COORDINATOR', 'FINANCE', 'BOOTCAMPER'])(
    'oculta "Analítica" para el rol %s',
    (role) => {
      useAuthStore.setState({ user: { id: 'u1', role } });
      renderSidebar();
      expect(screen.queryByRole('link', { name: /analítica/i })).not.toBeInTheDocument();
    },
  );
});
