import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import OnboardingPage from '../OnboardingPage';

vi.mock('../../api/auth.api', () => ({
  getOnboardingInfo: vi.fn(),
  activateOnboarding: vi.fn(),
}));

import { getOnboardingInfo, activateOnboarding } from '../../api/auth.api';

/** Credencial de prueba, no un secreto real. */
const CLAVE_PRUEBA = 'password123';

const VALID_INFO = {
  first_name: 'Ana',
  last_name: 'Vera',
  email: 'ana.vera@test.com',
  phone: '0991234567',
  cedula: '1710034065',
  program_name: 'Full Stack',
};

function renderPage(token = 'tok123') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/onboarding/${token}`]}>
        <Routes>
          <Route path="/onboarding/:token" element={<OnboardingPage />} />
          <Route path="/onboarding-success" element={<div>Cuenta activada</div>} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prellena los datos del bootcamper cuando el token es válido', async () => {
    getOnboardingInfo.mockResolvedValue(VALID_INFO);
    renderPage();

    expect(await screen.findByDisplayValue('Ana')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vera')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ana.vera@test.com')).toBeInTheDocument();
  });

  it('muestra el mensaje de token expirado sin formulario', async () => {
    getOnboardingInfo.mockRejectedValue({
      response: { status: 400, data: { error: 'El enlace expiró.', code: 'TOKEN_EXPIRED' } },
    });
    renderPage();

    expect(await screen.findByText(/el enlace expiró/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continuar/i })).not.toBeInTheDocument();
  });

  it('muestra el mensaje de cuenta ya activada con acceso a login', async () => {
    getOnboardingInfo.mockRejectedValue({
      response: { status: 400, data: { error: 'Ya fue activada.', code: 'ALREADY_ACTIVATED' } },
    });
    renderPage();

    expect(await screen.findByText(/tu cuenta ya está activa/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ir al inicio de sesión/i })).toBeInTheDocument();
  });

  it('muestra el mensaje genérico para un token inválido', async () => {
    getOnboardingInfo.mockRejectedValue({
      response: { status: 400, data: { error: 'No es válido.', code: 'TOKEN_INVALID' } },
    });
    renderPage();

    expect(await screen.findByText(/enlace inválido/i)).toBeInTheDocument();
  });

  it('contraseñas que no coinciden muestran el error de Zod', async () => {
    getOnboardingInfo.mockResolvedValue(VALID_INFO);
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue('Ana');
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    const [passwordInput, confirmInput] = await screen.findAllByPlaceholderText('••••••••');
    await user.type(passwordInput, CLAVE_PRUEBA);
    await user.type(confirmInput, 'diferente123');
    await user.click(screen.getByRole('button', { name: /activar mi cuenta/i }));

    expect(await screen.findByText(/las contraseñas no coinciden/i)).toBeInTheDocument();
    expect(activateOnboarding).not.toHaveBeenCalled();
  });

  it('el envío exitoso navega a la pantalla de éxito', async () => {
    getOnboardingInfo.mockResolvedValue(VALID_INFO);
    activateOnboarding.mockResolvedValue({ detail: 'Cuenta activada exitosamente.' });
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue('Ana');
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    const [passwordInput, confirmInput] = await screen.findAllByPlaceholderText('••••••••');
    await user.type(passwordInput, CLAVE_PRUEBA);
    await user.type(confirmInput, CLAVE_PRUEBA);
    await user.click(screen.getByRole('checkbox', { name: /uso de datos|acepto/i }));
    await user.click(screen.getByRole('button', { name: /activar mi cuenta/i }));

    await waitFor(() => expect(screen.getByText('Cuenta activada')).toBeInTheDocument());
    expect(activateOnboarding).toHaveBeenCalledWith(
      'tok123',
      expect.objectContaining({ password: CLAVE_PRUEBA, password_confirm: CLAVE_PRUEBA })
    );
  });
});

describe('OnboardingPage — consentimiento de uso de datos (#329)', () => {
  async function llegarAlPaso2(user) {
    getOnboardingInfo.mockResolvedValue(VALID_INFO);
    renderPage();
    await screen.findByDisplayValue('Ana');
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    return screen.findAllByPlaceholderText('••••••••');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    activateOnboarding.mockResolvedValue({ detail: 'Cuenta activada exitosamente.' });
  });

  it('la casilla arranca sin marcar', async () => {
    const user = userEvent.setup();
    await llegarAlPaso2(user);

    expect(screen.getByRole('checkbox', { name: /acepto/i })).not.toBeChecked();
  });

  it('sin aceptar no se activa la cuenta', async () => {
    const user = userEvent.setup();
    const [passwordInput, confirmInput] = await llegarAlPaso2(user);

    await user.type(passwordInput, CLAVE_PRUEBA);
    await user.type(confirmInput, CLAVE_PRUEBA);
    await user.click(screen.getByRole('button', { name: /activar mi cuenta/i }));

    expect(await screen.findByText(/hay que aceptar el uso de datos/i)).toBeInTheDocument();
    expect(activateOnboarding).not.toHaveBeenCalled();
  });

  it('al aceptar, el consentimiento viaja al backend', async () => {
    const user = userEvent.setup();
    const [passwordInput, confirmInput] = await llegarAlPaso2(user);

    await user.type(passwordInput, CLAVE_PRUEBA);
    await user.type(confirmInput, CLAVE_PRUEBA);
    await user.click(screen.getByRole('checkbox', { name: /acepto/i }));
    await user.click(screen.getByRole('button', { name: /activar mi cuenta/i }));

    await waitFor(() => expect(activateOnboarding).toHaveBeenCalled());
    expect(activateOnboarding.mock.calls[0][1]).toEqual(
      expect.objectContaining({ data_consent: true }),
    );
  });

  it('dice para qué se usan los datos', async () => {
    const user = userEvent.setup();
    await llegarAlPaso2(user);

    expect(screen.getByText(/fines internos de seguimiento de Coding Bootcamps ESPOL/i)).toBeInTheDocument();
  });
});
