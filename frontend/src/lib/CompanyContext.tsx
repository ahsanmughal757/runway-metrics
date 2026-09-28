import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { ACTIVE_COMPANY_KEY, DEMO_ROLE_KEY, writeKey } from './storage';
import { useAuth } from './AuthContext';
import type { CompanySummary } from './types';
import { toPermissions, type Permission, type Role } from './permissions';

interface CompanyContextValue {
  companies: CompanySummary[];
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string) => void;
  role: Role;
  setRole: (r: Role) => void;
  /** The caller's real capabilities, as reported by the server. */
  permissions: readonly Permission[];
  can: (permission: Permission) => boolean;
  loading: boolean;
  /** Human-readable bootstrap failure, or null. */
  error: string | null;
  /**
   * The bootstrap failed with 401: this browser has no usable session.
   *
   * This is what the route guard keys off, and it deliberately is *not*
   * `!isAuthenticated`. Demo mode (`BYPASS_AUTH=true`) has no token at all and
   * is fully usable, so guarding on the presence of a localStorage token would
   * lock the demo out of every page. The server's answer is the only honest
   * signal: in demo mode `/auth/me` succeeds without a token, in real mode it
   * does not.
   */
  unauthorized: boolean;
  /** The request never reached the server. A different problem, a different message. */
  offline: boolean;
  /**
   * The server reports this session's identity is a demo one.
   *
   * It exists so the top bar can show only the controls that can actually do
   * something. That cuts both ways, which is why the client cannot substitute a
   * guess:
   *
   * - the viewpoint switcher works *only* in demo mode, because `X-Demo-Role` is
   *   read by BypassAuthGuard alone. In a real deployment the server ignores the
   *   header and hands the real role back, so the tab snaps to where it started
   *   and a reviewer could conclude the wrong thing about what each role sees.
   * - the sign-out control works *only* against a real session. Demo mode has no
   *   refresh cookie to revoke, so signing out there clears nothing and leaves
   *   the app fully populated - a control that looks like it worked.
   *
   * Guessing from a missing local token is the 3c-2 mistake again: it cannot tell
   * demo from signed-out, which is precisely the distinction needed here.
   */
  demo: boolean;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

interface MeResponse {
  companyId: string;
  role: Role;
  permissions: unknown;
  demo?: boolean;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role>('OWNER');
  const [permissions, setPermissions] = useState<readonly Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [offline, setOffline] = useState(false);
  const [demo, setDemo] = useState(false);

  // Distinguishes "was signed in a moment ago" from "has never been signed in",
  // which `isAuthenticated === false` alone cannot express. See the sign-out
  // effect below for why the two must not be treated the same way.
  const wasAuthenticated = useRef(false);

  const applyIdentity = useCallback((me: MeResponse) => {
    setRoleState(me.role);
    setPermissions(toPermissions(me.permissions));
    setDemo(me.demo === true);
  }, []);

  useEffect(() => {
    // Signing out has to clear the tenant, not just stop fetching. Leaving the
    // previous company's id in state would let a signed-out shell keep rendering
    // one tenant's cached numbers, and the next person to sign in on a shared
    // machine would see them before their own bootstrap resolved.
    //
    // Scoped deliberately to the true -> false *transition*. On the first render
    // `isAuthenticated` is false in two situations that must not be conflated: a
    // real signed-out session, and a perfectly healthy demo session
    // (`BYPASS_AUTH=true`), which by design has no token to find. Clearing
    // unconditionally would wipe the demo's tenant on every page load. So the
    // initial mount is left to the probe below to resolve.
    if (wasAuthenticated.current && !isAuthenticated) {
      setCompanies([]);
      setActiveCompanyIdState(null);
      setPermissions([]);
      setError(null);
      setUnauthorized(false);
      setOffline(false);
      setLoading(false);
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    setOffline(false);
    setDemo(false);

    // Unconditional, and *not* gated on `isAuthenticated`. The absence of a local
    // token is not evidence of a signed-out user: it is precisely what demo mode
    // looks like from the browser. Only the server can tell those two apart, so
    // this has to ask. Gating it on the token is what would lock the demo out of
    // every page, and it previously did.
    //
    // Companies and identity are fetched together because a company list with
    // no idea what the caller may do in them is not renderable, and fetching
    // them serially would show an empty company switcher for a frame.
    //
    // `isAuthenticated` is in the dependency list and that is a fix in its own
    // right. This effect previously depended on `applyIdentity` alone, which is a
    // stable `useCallback` - so it ran exactly once per page load and never
    // again. It is the only writer of `activeCompanyId`, so signing in from
    // inside the app left that null, every page's `if (!activeCompanyId) return`
    // guard short-circuited, and the user saw a skeleton that never resolved. The
    // only way out was a hard refresh, which is not something a user is meant to
    // have to know. In `BYPASS_AUTH` demo mode the `X-Demo-Company-Id` header
    // supplies the company, so the demo path always looked fine.
    let cancelled = false;
    Promise.all([api.get<CompanySummary[]>('/companies'), api.get<MeResponse>('/auth/me')])
      .then(([companyList, me]) => {
        // The company may have changed while this was in flight - a sign-out, or
        // a sign-in as someone else. Setting state then would resurrect a
        // tenant the current session has no claim to.
        if (cancelled) return;
        setCompanies(companyList);
        applyIdentity(me);

        // Prefer the company the server resolved the session against, so the
        // first render already shows the tenant the token was issued for.
        const first = companyList.find((c) => c.id === me.companyId)?.id ?? companyList[0]?.id ?? null;
        setActiveCompanyIdState(first);
        if (first) writeKey(ACTIVE_COMPANY_KEY, first);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // The three failure kinds get different treatment downstream, and
        // lumping them together is what made the app lie: a 401 was reported as
        // "check that the backend is running", and a dead network was reported
        // the same way. `Sessions.tsx` had the same problem, telling anyone whose
        // session merely expired to go and enable the database.
        const denied = e instanceof ApiError && e.isUnauthorized;
        setOffline(e instanceof ApiError && e.isNetwork);
        setUnauthorized(denied);
        setError(e instanceof Error ? e.message : 'Could not load your companies');
        // Fail closed. An expired or revoked session must not leave the previous
        // tenant rendered behind a login screen, and this is the only place that
        // can clear it before the redirect lands.
        if (denied) {
          setCompanies([]);
          setActiveCompanyIdState(null);
          setPermissions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, applyIdentity]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id);
    writeKey(ACTIVE_COMPANY_KEY, id);
  }, []);

  /**
   * Demo-only role switch. Reviewers can look at each experience without four
   * accounts. It changes what the *server* is told to assume in demo mode, and
   * the permissions are then re-read from the server, so the demo cannot show a
   * capability the real product would refuse.
   *
   * The re-read is the whole point. Optimistically recomputing permissions
   * client-side from the new role would make the demo *look* right while
   * disagreeing with the server about what the user may do, which is precisely
   * the class of bug this is supposed to catch.
   */
  const setRole = useCallback(
    (r: Role) => {
      setRoleState(r);
      writeKey(DEMO_ROLE_KEY, r);
      void api
        .get<MeResponse>('/auth/me')
        .then(applyIdentity)
        .catch(() => undefined);
    },
    [applyIdentity],
  );

  const can = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      activeCompanyId,
      setActiveCompanyId,
      role,
      setRole,
      permissions,
      can,
      loading,
      error,
      unauthorized,
      offline,
      demo,
    }),
    [companies, activeCompanyId, setActiveCompanyId, role, setRole, permissions, can, loading, error, unauthorized, offline, demo],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}

/** Convenience for the many pages whose only question is "may I edit?". */
export function useCan() {
  return useCompany().can;
}
