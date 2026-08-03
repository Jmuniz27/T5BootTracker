import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RoleRoute from '../RoleRoute';
import { useAuthStore } from '../../store/auth.store';

function renderAt(allow, path = '/finance') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/finance"
          element={
            <RoleRoute allow={allow}>
              <div>Contenido restringido</div>
            </RoleRoute>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleRoute', () => {
  afterEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it('renderiza el contenido cuando el rol está permitido', () => {
    useAuthStore.setState({ user: { id: 'u1', role: 'FINANCE' } });
    renderAt(['FINANCE', 'ADMINISTRATOR']);
    expect(screen.getByText('Contenido restringido')).toBeInTheDocument();
  });

  it.each(['SALESPERSON', 'COORDINATOR', 'BOOTCAMPER'])(
    'redirige al dashboard cuando el rol %s no está en la lista permitida',
    (role) => {
      useAuthStore.setState({ user: { id: 'u1', role } });
      renderAt(['FINANCE', 'ADMINISTRATOR']);
      expect(screen.queryByText('Contenido restringido')).not.toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    },
  );

  it('redirige cuando no hay usuario en el store', () => {
    useAuthStore.setState({ user: null });
    renderAt(['FINANCE']);
    expect(screen.queryByText('Contenido restringido')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
