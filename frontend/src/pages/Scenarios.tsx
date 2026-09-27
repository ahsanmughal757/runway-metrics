import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import type { DashboardResponse } from '../lib/types';
import { RunwayScenarioSlider } from '../components/RunwayScenarioSlider';
import { ChartCardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

export function Scenarios() {
  const { activeCompanyId, role } = useCompany();
  const [data, setData] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    if (!activeCompanyId) return;
    api.get<DashboardResponse>('/metrics/dashboard').then(setData);
  }, [activeCompanyId, role]);

  if (!data) return <ChartCardSkeleton height={360} />;

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
          Model how growth and burn changes would shift your cash runway from the latest snapshot
          ({new Date(latest.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}).
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
