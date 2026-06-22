import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CheckEmailPage from '../CheckEmailPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('CheckEmailPage', () => {
  it('renders without crashing', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CheckEmailPage />
        </BrowserRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText(/Check your email/i)).toBeInTheDocument();
  });
});
