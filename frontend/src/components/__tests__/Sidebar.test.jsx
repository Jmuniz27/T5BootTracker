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
