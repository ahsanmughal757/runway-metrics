import { createContext, ReactNode, useContext, useState } from 'react';
import { api } from './api';

interface AuthUser { userId: string; email: string; companyId: string; role: string }
interface LoginResponse { accessToken: string; user: AuthUser }

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('runway_token'));

  async function login(email: string, password: string) {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    localStorage.setItem('runway_token', res.accessToken);
    setIsAuthenticated(true);
  }

  async function register(email: string, password: string, name?: string) {
    await api.post('/auth/register', { email, password, name });
    await login(email, password);
  }

  function logout() {
    localStorage.removeItem('runway_token');
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
