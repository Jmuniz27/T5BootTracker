import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ForgotPasswordPage from '../ForgotPasswordPage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('ForgotPasswordPage', () => {
  it('renders without crashing', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ForgotPasswordPage />
        </BrowserRouter>
      </QueryClientProvider>
    );
    // Adjust text based on component actual title, common default:
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
});
