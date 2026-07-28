import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminRoute from '../AdminRoute';
import { useAuthStore } from '../../store/auth.store';

function renderAt(path = '/admin/users') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <div>Panel de usuarios</div>
            </AdminRoute>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminRoute', () => {
  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('renderiza el contenido cuando el usuario es Administrador', () => {
    useAuthStore.setState({ user: { id: 'u1', role: 'ADMINISTRATOR' } });
    renderAt();
    expect(screen.getByText('Panel de usuarios')).toBeInTheDocument();
  });

  it.each(['SALESPERSON', 'COORDINATOR', 'FINANCE', 'BOOTCAMPER'])(
    'redirige al dashboard cuando el rol es %s',
    (role) => {
      useAuthStore.setState({ user: { id: 'u1', role } });
      renderAt();
      expect(screen.queryByText('Panel de usuarios')).not.toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    },
  );

  it('redirige cuando no hay usuario en el store', () => {
    useAuthStore.setState({ user: null });
    renderAt();
    expect(screen.queryByText('Panel de usuarios')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
