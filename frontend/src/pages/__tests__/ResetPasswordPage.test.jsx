import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResetPasswordPage from '../ResetPasswordPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPage(initialEntries) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ResetPasswordPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ResetPasswordPage', () => {
  it('shows an invalid link message when there is no token', () => {
    renderPage(['/reset-password']);
    expect(screen.getByText(/Enlace inválido/i)).toBeInTheDocument();
  });

  it('renders password fields with a visibility toggle when a token is present', () => {
    renderPage(['/reset-password?token=abc']);

    const [passwordInput] = screen.getAllByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'password');

    const [toggleButton] = screen.getAllByRole('button', { name: /mostrar contraseña/i });
    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('el título baja un escalón en móvil', () => {
    renderPage(['/reset-password?token=abc']);
    expect(screen.getByRole('heading')).toHaveClass('text-2xl', 'sm:text-3xl');
  });
});
