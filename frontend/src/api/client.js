import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
})

const getToken = () => {
  try {
    const stored = localStorage.getItem('auth')
    return stored ? JSON.parse(stored).state?.accessToken : null
  } catch {
    return null
  }
}

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth')
    }
    return Promise.reject(error)
  },
)

export default client
