import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { api } from '../lib/api';
import { companyKeys } from '../lib/queryKeys';
import { useCompany } from '../lib/CompanyContext';
import type { DashboardResponse } from '../lib/types';

/**
 * "Data as of {latest month}" pill.
 *
 * Sits in the top bar, so it mounts on every route. It used to issue a request
 * of its own against `/metrics/dashboard` on each of them; reading the shared
 * `companyKeys.dashboard` entry means the dashboard, metrics and scenarios pages
 * now get this byline from the response they had already asked for, and the
 * other routes make one request instead of two.
 */
export function DataAsOf() {
  const { activeCompanyId } = useCompany();
  const { data } = useQuery({
    queryKey: companyKeys.dashboard(activeCompanyId),
    queryFn: ({ signal }) => api.get<DashboardResponse>('/metrics/dashboard', signal),
    enabled: activeCompanyId !== null,
  });

  // No month, no pill — which covers the request still being in flight, a company
  // with no snapshots, and a failure. Collapsing those three into nothing is
  // deliberate rather than a swallowed error: the pill is a byline on data some
  // page already owns, and that page reports its own failure with a retry. A
  // "Data as of …" pill driven by a stale month would be a false claim about how
  // current the numbers are, which is the one thing a byline must not be, and an
  // error badge in the chrome for a decoration would send people looking for a
  // problem in the app rather than in their connection.
  const month = data?.latest?.month;
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
