import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, endLocalSession, SIGNED_OUT_EVENT } from './api';
import { clearQueryCache } from './queryClient';
import { ACTIVE_COMPANY_KEY, TOKEN_KEY, readKey, writeKey } from './storage';
import type { Role } from './permissions';

export interface SessionUser {
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
  /** The signed-in user, or null. Drives the identity in the sidebar and top bar. */
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string; companyName: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!readKey(TOKEN_KEY));
  // Null on a restored session until something re-reads it, because the user
  // record is deliberately not persisted: it is fetched from the server, which
  // is the only copy that can be trusted not to be stale. The chrome falls back
  // to the email-free placeholder while this is null rather than inventing one.
  const [user, setUser] = useState<SessionUser | null>(null);

  /**
   * Stores the session.
   *
   * The company is written to storage here rather than being left for the next
   * request to work out, because every authenticated call needs an
   * `X-Company-Id`. Without it the very first request after login is rejected
   * for having no company context, which reads to the user as a random failure.
   * With more than one membership the first is chosen; the switcher can change
   * it, and the server re-validates the choice on every request either way.
   *
   * `setIsAuthenticated(true)` is what the rest of the app keys off, and it is
   * what unblocks `CompanyProvider`: its bootstrap used to depend only on a
   * stable callback, so it ran exactly once per page load and never again, and
   * every page's `if (!activeCompanyId) return` guard then short-circuited
   * forever. Signing in inside the app left the user staring at a permanent
   * skeleton with only a hard refresh to recover. Invisible in demo mode, which
   * is why it survived.
   */
  const acceptSession = useCallback((res: AuthResponse) => {
    writeKey(TOKEN_KEY, res.accessToken);
    const first = res.memberships[0];
    if (first) writeKey(ACTIVE_COMPANY_KEY, first.companyId);
    setUser(res.user);
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

  const logout = useCallback(async () => {
    // The server first. The refresh token is a cookie the page cannot see, so
    // clearing localStorage would leave a working credential sitting in the
    // browser's cookie jar - "log out" would close the app without ending the
    // session, and anyone who reopened it would be signed straight back in.
    try {
      await api.post('/auth/logout');
    } catch {
      // Already signed out, or the network is gone. Either way the local
      // session is cleared below; there is nothing useful to report here.
    } finally {
      endLocalSession();
      // Before the state updates, and unconditionally. A signed-out shell with a
      // warm cache never makes a request, so nothing downstream has anything
      // left to fail closed on - the previous session's numbers would simply be
      // sitting in memory, and the next person to sign in on a shared machine
      // would see them render before their own bootstrap resolved. Clearing the
      // token is not enough; the data it unlocked has to go with it.
      clearQueryCache();
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated, user, login, register, logout }),
    [isAuthenticated, user, login, register, logout],
  );

  // A refresh that fails means the session is genuinely over, wherever it is
  // noticed. Without this the UI keeps rendering as signed in with a token that
  // can no longer be used, and only the next manual navigation would reveal it.
  useEffect(() => {
    const onSignedOut = () => {
      // Same reason as the explicit logout above: a session that ended because
      // the server said so still leaves a populated cache behind, and this path
      // fires from a 401 inside a request rather than from the user.
      clearQueryCache();
      setUser(null);
      setIsAuthenticated(false);
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
