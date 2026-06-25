import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import LoginPage from '../LoginPage';

const queryClient = new QueryClient();

describe('LoginPage', () => {
  const setup = () => render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    </QueryClientProvider>
  );

  it('renders login form elements correctly', () => {
    setup();
    expect(screen.getByText(/Inicia sesión para/i)).toBeInTheDocument();

    // Labels
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Contraseña')).toBeInTheDocument();

    // Button
    expect(screen.getByRole('button', { name: /Ingresar/i })).toBeInTheDocument();
  });

  it('shows validation errors when submitting an empty form', async () => {
    setup();
    const submitBtn = screen.getByRole('button', { name: /Ingresar/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ingresa un email válido/i)).toBeInTheDocument();
      expect(screen.getByText(/La contraseña es requerida/i)).toBeInTheDocument();
    });
  });
});
