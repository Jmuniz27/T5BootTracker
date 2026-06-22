import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResetPasswordPage from '../ResetPasswordPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('ResetPasswordPage', () => {
  it('renders without crashing', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ResetPasswordPage />
        </BrowserRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText(/Enlace inválido/i)).toBeInTheDocument();
  });
});
