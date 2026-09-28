import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

interface Bootstrap {
  companies: CompanySummary[];
  me: MeResponse;
}

/**
 * Both bootstrap requests, or neither.
 *
 * They were separate effects, and a `null` tenant read as "still loading" here as
 * much as it did on a page, so a companies-list failure looked exactly like a
 * slow one. One request that can only answer completely is also the only version
 * that cannot leave a company list on screen next to an identity that failed.
 */
const bootstrapQuery = async (signal: AbortSignal): Promise<Bootstrap> => {
  const [companies, me] = await Promise.all([api.get<CompanySummary[]>('/companies', signal), api.get<MeResponse>('/auth/me', signal)]);
  return { companies, me };
};

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  /**
   * Cache key, or nothing.
   *
   * A data layer, so this is not spelled by hand. The value of the session is
   * part of it because the cache has to answer "is there a session" — without it
   * a warm entry survives a sign-out, and a signed-out shell would keep the
   * previous tenant's id and numbers, which is what the next person to open the
   * app on a shared machine would see.
   */
  const sessionKey = useMemo(() => ['bootstrap', isAuthenticated] as const, [isAuthenticated]);

  /**
   * Everything the shell knows about who is signed in.
   *
   * One piece of state, not five, because the values are written together by the
   * same event — a bootstrap resolving — and splitting them is what allowed a
   * frame in which the new tenant was paired with the previous role.
   *
   * `source` is the `companyId` of the bootstrap these values came from, which is
   * what makes the adoption below idempotent: a background refetch resolves to a
   * new object every time, and guarding on the object's identity would re-apply
   * it on each one. It is stored rather than kept in a ref because a ref written
   * during render is exactly what the `refs` lint rule exists to prevent, and
   * because the value is part of what the next render has to compare against.
   */
  /**
   * Which company the caller picked, or null for "whichever this session
   * resolves to".
   *
   * This is the *only* piece of state in the file, and it is user intent rather
   * than a fetch result. The tenant itself is derived below, which is what removed
   * the two effects this component used to need: there is no longer anything to
   * copy out of a response, and so nothing to copy it in.
   *
   * It survives a sign-out on purpose, and is validated against the incoming
   * session's company list before it is believed — `runway_active_company_id` is
   * likewise left in storage across a sign-out so the next request can name a
   * company, and treating a remembered company as a remembered *person* is the
   * 3c-2 mistake.
   */
  const [preferredCompanyId, setPreferredCompanyId] = useState<string | null>(null);

  const { data: bootstrap, isPending, isError, error } = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => bootstrapQuery(signal),
    // Unconditional, and *not* gated on `isAuthenticated`. The absence of a local
    // token is not evidence of a signed-out user: it is precisely what demo mode
    // looks like from the browser. Only the server can tell those two apart, so
    // this has to ask. Gating it on the token is what would lock the demo out of
    // every page, and it previously did.
    //
    // The session is part of the *key* instead, which is what re-runs this on
    // sign-in. The previous version of this effect depended on a `useCallback`
    // alone, which is stable, so it ran once per page load and never again —
    // `activeCompanyId` stayed null, every page's guard short-circuited, and the
    // only way out was a hard refresh. Invisible in `BYPASS_AUTH` demo mode, which
    // is why it shipped.
    //
    // Signing out needs no matching effect either. A false session is a different
    // key, so it holds no entry, so there is nothing to carry over: a signed-out
    // shell derives a null tenant and an empty company list from the absence of
    // data rather than from being told to forget something. That was the whole job
    // of the `wasAuthenticated` ref, and it was a ref read in an effect only
    // because the tenant was stored instead of derived.
    enabled: true,
  });

  const permissions = useMemo(() => (bootstrap ? toPermissions(bootstrap.me.permissions) : []), [bootstrap]);

  /**
   * The tenant, derived.
   *
   * `null` whenever there is no session, because no data means no tenant. That is
   * the fail-closed property, and it now falls out of the shape rather than being
   * enforced: there is no branch in which a stored company outlives the response
   * that established it, so the frame where a login screen sits on top of the
   * previous tenant's numbers cannot be reached.
   */
  const activeCompanyId = bootstrap
    ? (bootstrap.companies.some((c) => c.id === preferredCompanyId)
        ? preferredCompanyId
        : (bootstrap.companies.find((c) => c.id === bootstrap.me.companyId)?.id ?? bootstrap.companies[0]?.id ?? null))
    : null;

  /**
   * The header every request carries, so it is kept in step with the derived
   * tenant.
   *
   * An effect because writing to storage is a side effect and this runs during
   * render. It sets no state, so it is the shape the lint rules leave alone — and
   * it no longer has to clear anything on the way out, because the value it writes
   * is derived rather than remembered.
   */
  useEffect(() => {
    if (activeCompanyId) writeKey(ACTIVE_COMPANY_KEY, activeCompanyId);
  }, [activeCompanyId]);

  const setActiveCompanyId = useCallback((id: string) => {
    setPreferredCompanyId(id);
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
   *
   * A mutation rather than a bare `api.get` in a click handler, because it is a
   * write: the response replaces the cached bootstrap outright, which is both
   * faster than invalidating and the one outcome that cannot leave the new role
   * paired with the old tenant. The cached entry is updated optimistically so the
   * tab snaps at once and corrected by the response moments later — an optimistic
   * guess at the *label* is not a guess about permissions, which is why the
   * permissions are only ever read off a server answer.
   */
  const readIdentity = useMutation({
    mutationFn: (role: Role) => {
      writeKey(DEMO_ROLE_KEY, role);
      return api.get<MeResponse>('/auth/me');
    },
    onMutate: (role) => {
      queryClient.setQueryData<Bootstrap>(sessionKey, (prev) => (prev ? { ...prev, me: { ...prev.me, role } } : prev));
    },
    onSuccess: (me) => {
      queryClient.setQueryData<Bootstrap>(sessionKey, (prev) => (prev ? { ...prev, me } : prev));
    },
    // Fire and forget by design: the tab still switched, the header is still
    // sent, and the next request re-reads the identity anyway. Surfacing this in
    // the chrome would report a failed permissions refresh as a failed role
    // switch, and a reviewer who cannot tell the two apart would distrust the
    // demo rather than the demo mode.
    onError: () => undefined,
  });

  const setRole = useCallback(
    (r: Role) => {
      readIdentity.mutate(r);
    },
    [readIdentity],
  );

  const can = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies: bootstrap?.companies ?? [],
      activeCompanyId,
      setActiveCompanyId,
      role: bootstrap?.me.role ?? 'OWNER',
      setRole,
      permissions,
      can,
      loading: isPending,
      // The three failure kinds get different treatment downstream, and lumping
      // them together is what made the app lie: a 401 was reported as "check that
      // the backend is running", and a dead network was reported the same way.
      // `Sessions.tsx` had the same problem, telling anyone whose session merely
      // expired to go and enable the database.
      error: isError ? (error instanceof Error ? error.message : 'Could not load your companies') : null,
      unauthorized: isError && error instanceof ApiError && error.isUnauthorized,
      offline: isError && error instanceof ApiError && error.isNetwork,
      demo: bootstrap?.me.demo === true,
    }),
    [bootstrap, activeCompanyId, setActiveCompanyId, setRole, permissions, can, isPending, isError, error],
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
