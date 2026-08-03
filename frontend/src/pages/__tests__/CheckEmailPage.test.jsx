import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import CheckEmailPage from '../CheckEmailPage';

vi.mock('../../api/auth.api', () => ({
  requestPasswordReset: vi.fn(() => Promise.resolve({})),
}));

import { requestPasswordReset } from '../../api/auth.api';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CheckEmailPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('CheckEmailPage', () => {
  it('renders without crashing', () => {
    renderPage();
    expect(screen.getByText(/Revisa tu correo/i)).toBeInTheDocument();
  });

  it('does not render an OTP code input or a verify button', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /verify code/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('resends the reset email via the API', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /reenviar correo/i }));
    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith(
        { email: '' },
        expect.anything()
      )
    );
  });
});
