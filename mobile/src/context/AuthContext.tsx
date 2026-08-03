import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../lib/api';

// La app mobile es para el equipo comercial: vendedores y finanzas.
export const MOBILE_ALLOWED_ROLES = ['SALESPERSON', 'FINANCE'] as const;

export function isMobileRole(role: string): boolean {
  return (MOBILE_ALLOWED_ROLES as readonly string[]).includes(role);
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_display: string;
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('access_token').then(async (t) => {
      if (t) {
        setToken(t);
        try {
          const { data } = await api.get<AuthUser>('/auth/me/');
          setUser(data);
        } catch {
          // token expired — leave user null, router will redirect to login
        }
      }
    });
  }, []);

  async function login(email: string, password: string) {
    await SecureStore.deleteItemAsync('access_token');
    const { data } = await api.post('/auth/login/', { email, password });
    await SecureStore.setItemAsync('access_token', data.access);
    await SecureStore.setItemAsync('refresh_token', data.refresh);
    const { data: me } = await api.get<AuthUser>('/auth/me/');

    // La app mobile es para el equipo comercial: vendedores y finanzas.
    if (!isMobileRole(me.role)) {
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      const err = new Error('Esta aplicación es solo para vendedores y finanzas.');
      (err as { code?: string }).code = 'ROLE_NOT_ALLOWED';
      throw err;
    }

    setToken(data.access);
    setUser(me);
  }

  async function logout() {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
