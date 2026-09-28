import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { companyKeys } from '../lib/queryKeys';
import type { DashboardResponse } from '../lib/types';
import { RunwayScenarioSlider } from '../components/RunwayScenarioSlider';
import { ChartCardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';

export function Scenarios() {
  const { activeCompanyId } = useCompany();
  const { data, isPending, isError, error, refetch } = useQuery({
    // The same resource the dashboard and metrics pages read, so the key is
    // deliberately theirs rather than a page-specific one: a snapshot imported
    // on Metrics then re-renders here with no second request, because there is
    // one cache entry for one company rather than one per page that asked.
    queryKey: companyKeys.dashboard(activeCompanyId),
    queryFn: ({ signal }) => api.get<DashboardResponse>('/metrics/dashboard', signal),
    // No company, no request. See the rule in `queryKeys.ts`.
    enabled: activeCompanyId !== null,
  });

  // No company yet is a pending state, not a failure: the query is disabled
  // rather than fired, so it sits at `isPending` forever and would be
  // indistinguishable from a slow server. The company is checked first.
  if (activeCompanyId === null || isPending) return <ChartCardSkeleton height={360} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return <ErrorState error={new Error('This company has no dashboard yet.')} />;

  // A company with no snapshots has a dashboard, just no `latest` to model from.
  // That is an empty state rather than a failure, and the slider has nothing to
  // be seeded from, so it must not be rendered.
  const latest = data.latest;
  if (!latest) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="No snapshot to model"
        description="Add a snapshot on the Metrics page first, then come back to explore runway scenarios."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Runway Scenarios</h2>
        <p className="text-sm text-runway-muted mt-0.5">
          Model how growth and burn changes would shift your cash runway from the latest snapshot (
          {new Date(latest.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}).
        </p>
      </div>
      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative p-5">
          <RunwayScenarioSlider snapshot={latest} />
        </div>
      </div>
    </div>
  );
}
