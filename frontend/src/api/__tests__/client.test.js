import client from '../client';
import { requestTokenRefresh } from '../refresh';
import { useAuthStore } from '../../store/auth.store';

vi.mock('../refresh', () => ({ requestTokenRefresh: vi.fn() }));

const refreshSpy = requestTokenRefresh;

const USER = { id: 'u1', email: 'admin@test.com', role: 'ADMINISTRATOR' };

/** Simula un 401 pasando por el interceptor de respuesta del cliente. */
function reject401(config = {}) {
  const handler = client.interceptors.response.handlers[0].rejected;
  return handler({ response: { status: 401 }, config: { headers: {}, ...config } });
}

// El interceptor reintenta con client(original), que no pasa por client.request.
// Sustituimos el adapter para que el reintento no haga una petición real.
let adapter;

describe('client — refresh flow (WEB-1 / HST-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapter = vi.fn().mockResolvedValue({ data: 'ok', status: 200, headers: {}, config: {} });
    client.defaults.adapter = adapter;
    useAuthStore.setState({ accessToken: 'viejo', refreshToken: 'refresh-1', user: USER });
    delete window.location;
    window.location = { pathname: '/dashboard', assign: vi.fn() };
  });

  it('renueva el token y reintenta la petición original', async () => {
    refreshSpy.mockResolvedValue({ access: 'nuevo' });

    await reject401();

    expect(refreshSpy).toHaveBeenCalledWith('refresh-1');
    expect(useAuthStore.getState().accessToken).toBe('nuevo');
    expect(adapter).toHaveBeenCalled();
  });

  it('guarda el refresh rotado que devuelve el backend', async () => {
    // ROTATE_REFRESH_TOKENS=True: si no se guarda, la siguiente renovación falla.
    refreshSpy.mockResolvedValue({ access: 'nuevo', refresh: 'refresh-2' });

    await reject401();

    expect(useAuthStore.getState().refreshToken).toBe('refresh-2');
  });

  it('conserva el refresh anterior si el backend no envía uno nuevo', async () => {
    refreshSpy.mockResolvedValue({ access: 'nuevo' });

    await reject401();

    expect(useAuthStore.getState().refreshToken).toBe('refresh-1');
  });

  it('cierra la sesión si el refresh es inválido', async () => {
    refreshSpy.mockRejectedValue(new Error('token_not_valid'));

    await expect(reject401()).rejects.toBeTruthy();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(window.location.assign).toHaveBeenCalledWith('/login');
  });

  it('cierra la sesión si no hay refresh token guardado', async () => {
    useAuthStore.setState({ accessToken: 'viejo', refreshToken: null, user: USER });

    await expect(reject401()).rejects.toBeTruthy();

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('no reintenta dos veces la misma petición', async () => {
    await expect(reject401({ _retry: true })).rejects.toBeTruthy();
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
