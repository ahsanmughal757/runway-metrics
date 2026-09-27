import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
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
  error: string | null;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

interface MeResponse {
  companyId: string;
  role: Role;
  permissions: unknown;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role>('OWNER');
  const [permissions, setPermissions] = useState<readonly Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyIdentity = useCallback((me: MeResponse) => {
    setRoleState(me.role);
    setPermissions(toPermissions(me.permissions));
  }, []);

  useEffect(() => {
    // Companies and identity are fetched together because a company list with
    // no idea what the caller may do in them is not renderable, and fetching
    // them serially would show an empty company switcher for a frame.
    Promise.all([api.get<CompanySummary[]>('/companies'), api.get<MeResponse>('/auth/me')])
      .then(([companyList, me]) => {
        setCompanies(companyList);
        applyIdentity(me);

        // Prefer the company the server resolved the session against, so the
        // first render already shows the tenant the token was issued for.
        const first = companyList.find((c) => c.id === me.companyId)?.id ?? companyList[0]?.id ?? null;
        setActiveCompanyIdState(first);
        if (first) localStorage.setItem('runway_active_company_id', first);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [applyIdentity]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id);
    localStorage.setItem('runway_active_company_id', id);
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
      localStorage.setItem('runway_demo_role', r);
      void api
        .get<MeResponse>('/auth/me')
        .then(applyIdentity)
        .catch(() => undefined);
    },
    [applyIdentity],
  );

  const can = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);

  const value = useMemo<CompanyContextValue>(
    () => ({ companies, activeCompanyId, setActiveCompanyId, role, setRole, permissions, can, loading, error }),
    [companies, activeCompanyId, role, setRole, permissions, can, loading, error],
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
