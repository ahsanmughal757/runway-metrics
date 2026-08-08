import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardBody } from '@heroui/react';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { CohortRow } from '../lib/types';
import { CohortTable } from '../components/CohortTable';
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
      {error && (
        <Card className="bg-runway-surface border border-runway-border">
          <CardBody className="text-runway-negative text-sm">{error}</CardBody>
        </Card>
      )}
      {rows === null && !error && <ChartCardSkeleton height={320} />}
      {rows && rows.length > 0 && <CohortTable rows={rows} />}
      {rows && rows.length === 0 && (
        <EmptyState icon={Users} title="No cohort data available yet" description="Cohort retention appears once customer-level data has been seeded for this company." />
      )}
    </motion.div>
  );
}
