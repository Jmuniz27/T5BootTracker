import axios from 'axios'
import { useAuthStore } from '../store/auth.store'
import { requestTokenRefresh } from './refresh'

const client = axios.create({
  baseURL: '/api',
})

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Cola de peticiones que esperan a que termine un refresh en curso, para que N
// respuestas 401 simultáneas disparen una sola renovación.
let isRefreshing = false
let pendingQueue = []

function flushQueue(error, token = null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  pendingQueue = []
}

/** Cierra la sesión y manda al login (sesión expirada o refresh inválido). */
export function forceLogout() {
  useAuthStore.getState().logout()
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return client(original)
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const { refreshToken, user } = useAuthStore.getState()
      if (!refreshToken) throw new Error('no_refresh')

      const data = await requestTokenRefresh(refreshToken)

      // ROTATE_REFRESH_TOKENS=True: el backend devuelve un refresh nuevo y
      // blacklistea el anterior. Si no guardamos el nuevo, el siguiente falla.
      useAuthStore.getState().setAuth({
        access: data.access,
        refresh: data.refresh ?? refreshToken,
        user,
      })

      original.headers.Authorization = `Bearer ${data.access}`
      flushQueue(null, data.access)
      return client(original)
    } catch (refreshError) {
      flushQueue(refreshError, null)
      forceLogout()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default client
