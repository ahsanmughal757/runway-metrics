import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { companyKeys } from '../lib/queryKeys';
import type { CohortRow } from '../lib/types';
import { CohortTable } from '../components/CohortTable';
import { CohortLtvChart } from '../components/charts/CohortLtvChart';
import { EmptyState } from '../components/EmptyState';
import { ChartCardSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

export function Cohorts() {
  const { activeCompanyId } = useCompany();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: companyKeys.cohorts(activeCompanyId),
    queryFn: ({ signal }) => api.get<CohortRow[]>('/cohorts/retention', signal),
    // No company, no request. See the rule in `queryKeys.ts`.
    enabled: activeCompanyId !== null,
  });

  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h2 className="text-lg font-medium text-runway-text">Cohort Retention</h2>
        <p className="text-sm text-runway-muted">Built on seeded demo data (v1) — real customer-level ingestion is planned for v2.</p>
      </div>
      {/* Conditional rather than an early return, because the page heading and the
          two "nothing to show" branches below are one screen: returning early
          would render a bare card with no way to tell an empty company from a
          failed request. */}
      {(activeCompanyId === null || isPending) && <ChartCardSkeleton height={320} />}
      {/* The rejection itself, not `e.message`. A network failure and a 403 both
          arrived here as bare text, and "Could not load" was the whole advice a
          user whose session had expired got; `ErrorState` tells the two apart and
          offers the retry this branch had no way to express. */}
      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data && data.length > 0 && <CohortTable rows={data} />}
      {data && data.length > 0 && (
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold text-runway-text">Cumulative Revenue per Cohort</h3>
            <p className="text-xs text-runway-muted mt-0.5">
              Running total revenue earned from each cohort (most recent 6 cohorts) across months-since-signup.
            </p>
          </div>
          <div className="relative px-2 pb-3">
            <CohortLtvChart rows={data} />
          </div>
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState
          icon={Users}
          title="No cohort data available yet"
          description="Cohort retention appears once customer-level data has been seeded for this company."
        />
      )}
    </motion.div>
  );
}
