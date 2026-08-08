import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { CohortRow } from '../lib/types';
import { CohortTable } from '../components/CohortTable';
import { CohortLtvChart } from '../components/charts/CohortLtvChart';
import { EmptyState } from '../components/EmptyState';
import { ChartCardSkeleton } from '../components/Skeleton';

export function Cohorts() {
  const { activeCompanyId, role } = useCompany();
  const [rows, setRows] = useState<CohortRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompanyId) return;
    setRows(null);
    setError(null);
    api.get<CohortRow[]>('/cohorts/retention').then(setRows).catch((e) => setError(e.message));
  }, [activeCompanyId, role]);

  return (
    <motion.div className="flex flex-col gap-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div>
        <h2 className="text-lg font-medium text-runway-text">Cohort Retention</h2>
        <p className="text-sm text-runway-muted">
          Built on seeded demo data (v1) — real customer-level ingestion is planned for v2.
        </p>
      </div>
      {error && <div className="runway-card p-5 text-sm text-runway-negative border-runway-negative/30">{error}</div>}
      {rows === null && !error && <ChartCardSkeleton height={320} />}
      {rows && rows.length > 0 && <CohortTable rows={rows} />}
      {rows && rows.length > 0 && (
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold text-runway-text">Cumulative Revenue per Cohort</h3>
            <p className="text-xs text-runway-muted mt-0.5">
              Running total revenue earned from each cohort (most recent 6 cohorts) across months-since-signup.
            </p>
          </div>
          <div className="relative px-2 pb-3">
            <CohortLtvChart rows={rows} />
          </div>
        </div>
      )}
      {rows && rows.length === 0 && (
        <EmptyState icon={Users} title="No cohort data available yet" description="Cohort retention appears once customer-level data has been seeded for this company." />
      )}
    </motion.div>
  );
}
