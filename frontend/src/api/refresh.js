import axios from 'axios'

/**
 * Pide un access token nuevo (HST-003 / WEB-1).
 *
 * Vive fuera de `client.js` y usa axios "pelado" a propósito: si la renovación
 * pasara por `client`, un 401 aquí volvería a entrar en su interceptor y haría
 * un bucle infinito.
 */
export function requestTokenRefresh(refresh) {
  return axios.post('/api/auth/token/refresh/', { refresh }).then((r) => r.data)
}
