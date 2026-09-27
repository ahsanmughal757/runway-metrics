import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api } from './api';
import type { Role } from './permissions';

interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Membership {
  companyId: string;
  companyName: string;
  companySlug: string;
  role: Role;
}

/** Both credential endpoints answer with this shape. */
interface AuthResponse {
  accessToken: string;
  user: SessionUser;
  memberships: Membership[];
}

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string; companyName: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('runway_token'));

  /**
   * Stores the session.
   *
   * The company is written to storage here rather than being left for the next
   * request to work out, because every authenticated call needs an
   * `X-Company-Id`. Without it the very first request after login is rejected
   * for having no company context, which reads to the user as a random failure.
   * With more than one membership the first is chosen; the switcher can change
   * it, and the server re-validates the choice on every request either way.
   */
  const acceptSession = useCallback((res: AuthResponse) => {
    localStorage.setItem('runway_token', res.accessToken);
    const first = res.memberships[0];
    if (first) localStorage.setItem('runway_active_company_id', first.companyId);
    setIsAuthenticated(true);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      acceptSession(res);
    },
    [acceptSession],
  );

  const register = useCallback(
    async (input: { email: string; password: string; name?: string; companyName: string }) => {
      // One request, not register-then-login: the endpoint already issues a
      // token, and asking for a second would hash the password twice.
      const res = await api.post<AuthResponse>('/auth/register', input);
      acceptSession(res);
    },
    [acceptSession],
  );

  const logout = useCallback(() => {
    // Client-side only. There is deliberately no `/auth/logout` endpoint yet:
    // revoking a token server-side means a session table, and until that exists
    // a "logout" that only clears the browser would be a promise the server
    // does not keep. The token stays valid until it expires, so this is a
    // convenience for the person at the keyboard, not a security boundary.
    localStorage.removeItem('runway_token');
    localStorage.removeItem('runway_active_company_id');
    setIsAuthenticated(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated, login, register, logout }),
    [isAuthenticated, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
