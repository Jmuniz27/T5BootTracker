import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Queue of requests waiting for a token refresh to complete
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function flushQueue(error: unknown, token: string | null = null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refresh = await SecureStore.getItemAsync('refresh_token');
      if (!refresh) throw new Error('no_refresh');

      const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });

      await SecureStore.setItemAsync('access_token', data.access);
      if (data.refresh) await SecureStore.setItemAsync('refresh_token', data.refresh);

      api.defaults.headers.common.Authorization = `Bearer ${data.access}`;
      original.headers.Authorization = `Bearer ${data.access}`;

      flushQueue(null, data.access);
      return api(original);
    } catch (refreshError) {
      flushQueue(refreshError, null);
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      router.replace('/(auth)/login');
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
