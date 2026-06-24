import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import DashboardPage from '../DashboardPage';
import { useAuthStore } from '../../store/auth.store';

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

describe('DashboardPage', () => {
  it('renders welcome message for logged in user', () => {
    useAuthStore.mockReturnValue({
      user: { full_name: 'Juan Perez' },
      logout: vi.fn()
    });
    
    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Juan Perez/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cerrar sesión/i })).toBeInTheDocument();
  });
});
