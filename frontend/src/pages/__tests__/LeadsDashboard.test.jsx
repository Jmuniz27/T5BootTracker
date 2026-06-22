import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadsDashboard from '../LeadsDashboard';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('LeadsDashboard', () => {
  it('renders without crashing', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LeadsDashboard />
        </BrowserRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText(/Filter/i)).toBeInTheDocument();
  });
});
