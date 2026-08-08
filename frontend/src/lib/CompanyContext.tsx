import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { CompanySummary } from './types';

interface CompanyContextValue {
  companies: CompanySummary[];
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string) => void;
  role: 'FOUNDER' | 'INVESTOR';
  setRole: (r: 'FOUNDER' | 'INVESTOR') => void;
  loading: boolean;
  error: string | null;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  // Demo-only client-side role toggle so reviewers can see both experiences.
  // Real enforcement always happens server-side via RolesGuard regardless of this value.
  const [role, setRole] = useState<'FOUNDER' | 'INVESTOR'>('FOUNDER');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CompanySummary[]>('/companies')
      .then((data) => {
        setCompanies(data);
        const first = data[0]?.id ?? null;
        setActiveCompanyId(first);
        if (first) localStorage.setItem('runway_demo_company_id', first);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const updateActiveCompanyId = (id: string) => {
    setActiveCompanyId(id);
    localStorage.setItem('runway_demo_company_id', id);
  };

  const updateRole = (r: 'FOUNDER' | 'INVESTOR') => {
    setRole(r);
    localStorage.setItem('runway_demo_role', r);
  };

  return (
    <CompanyContext.Provider
      value={{ companies, activeCompanyId, setActiveCompanyId: updateActiveCompanyId, role, setRole: updateRole, loading, error }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
