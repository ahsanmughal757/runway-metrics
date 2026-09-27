import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import type { DashboardResponse } from '../lib/types';

/**
 * "Data as of {latest month}" pill pulled from the dashboard response.
 * Lightweight — reuses the same endpoint the Dashboard itself fetches.
 */
export function DataAsOf() {
  const { activeCompanyId, role } = useCompany();
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompanyId) return;
    api
      .get<DashboardResponse>('/metrics/dashboard')
      .then((d) => setMonth(d.latest?.month ?? null))
      .catch(() => setMonth(null));
  }, [activeCompanyId, role]);

  if (!month) return null;

  return (
    <span className="hidden xl:flex items-center gap-1.5 text-[11px] text-runway-muted border border-runway-border/70 bg-white/[0.02] rounded-full px-2.5 py-1">
      <Clock size={11} />
      Data as of{' '}
      <span className="text-runway-text font-medium">
        {new Date(month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
      </span>
    </span>
  );
}
