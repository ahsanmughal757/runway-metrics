import { useEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@heroui/react';
import { DollarSign, TrendingDown, Flame, Gauge, Upload, PlusCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { DashboardResponse } from '../lib/types';
import { KpiCard } from '../components/KpiCard';
import { CountUp } from '../components/CountUp';
import { KpiCardSkeleton, ChartCardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { MrrTrendChart } from '../components/charts/MrrTrendChart';
import { ChurnTrendChart } from '../components/charts/ChurnTrendChart';
import { BurnCashChart } from '../components/charts/BurnCashChart';
import { NrrChart } from '../components/charts/NrrChart';
import { MomGrowthChart } from '../components/charts/MomGrowthChart';
import { monthLabel } from '../components/charts/chartTheme';

function fmtCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const sectionIds = { mrr: 'chart-mrr', churn: 'chart-churn', burn: 'chart-burn', nrr: 'chart-nrr', mom: 'chart-mom' };

export function Dashboard() {
  const { activeCompanyId, role } = useCompany();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    api
      .get<DashboardResponse>('/metrics/dashboard')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeCompanyId, role]);

  function jumpTo(id: string) {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(id);
    setTimeout(() => setHighlighted(null), 1400);
  }

  if (loading) return <DashboardSkeleton />;
  if (error)
    return (
      <div className="runway-card p-5 text-sm text-runway-negative border-runway-negative/30">{error}</div>
    );
  if (!data || data.snapshots.length === 0) return <EmptyDashboard />;

  const { latest, snapshots } = data;
  if (!latest) return <EmptyDashboard />;

  const zone = latest.derived.runwayZone;

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-runway-text">Overview</h2>
            <p className="text-sm text-runway-muted mt-0.5">
              Your company at a glance — last snapshot {monthLabel(data.snapshots[data.snapshots.length - 1].month)}.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-runway-border/70 bg-white/[0.02] px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-runway-positive animate-pulse-dot" />
            <span className="text-xs text-runway-muted">Live data</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      >
        <KpiCard
          icon={DollarSign}
          label="MRR"
          value={<CountUp value={latest.mrr} format={fmtCurrency} />}
          secondary={`${latest.derived.momGrowthRate ?? 0}% vs prior month`}
          trend={(latest.derived.momGrowthRate ?? 0) >= 0 ? 'up' : 'down'}
          onPress={() => jumpTo(sectionIds.mrr)}
        />
        <KpiCard
          icon={TrendingDown}
          label="Churn"
          value={<CountUp value={latest.derived.revenueChurnPct ?? 0} format={(n) => `${n.toFixed(1)}%`} />}
          secondary={`${latest.derived.logoChurnPct ?? 0}% logo churn`}
          trend={(latest.derived.revenueChurnPct ?? 0) > 3 ? 'up' : 'flat'}
          trendIsGood={false}
          onPress={() => jumpTo(sectionIds.churn)}
        />
        <KpiCard
          icon={Flame}
          label="Burn Rate"
          value={<CountUp value={latest.derived.threeMoAvgBurn ?? latest.burnRate} format={fmtCurrency} />}
          secondary={`3-mo avg · ${fmtCurrency(latest.burnRate)} actual`}
          onPress={() => jumpTo(sectionIds.burn)}
        />
        <KpiCard
          icon={Gauge}
          label="Runway"
          value={<><CountUp value={latest.derived.runwayMonths ?? 0} format={(n) => n.toFixed(0)} /> mo</>}
          secondary={fmtCurrency(latest.cash)}
          zone={zone}
          onPress={() => jumpTo(sectionIds.mrr)}
        />
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <ChartCard id={sectionIds.mrr} title="MRR Trend" refs={refs} highlighted={highlighted}>
          <MrrTrendChart snapshots={snapshots} />
        </ChartCard>
      </motion.div>

      {/* Bento layout: asymmetric widths instead of a uniform 2-up grid */}
      <motion.div className="grid md:grid-cols-12 gap-6" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="md:col-span-7">
          <ChartCard id={sectionIds.burn} title="Burn vs. Cash Balance" refs={refs} highlighted={highlighted}>
            <BurnCashChart snapshots={snapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-5">
          <ChartCard id={sectionIds.churn} title="Churn % Trend" refs={refs} highlighted={highlighted}>
            <ChurnTrendChart snapshots={snapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-5">
          <ChartCard id={sectionIds.nrr} title="Net Revenue Retention" refs={refs} highlighted={highlighted}>
            <NrrChart snapshots={snapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-7">
          <ChartCard id={sectionIds.mom} title="MoM Growth Rate" refs={refs} highlighted={highlighted}>
            <MomGrowthChart snapshots={snapshots} />
          </ChartCard>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChartCard({
  id, title, children, refs, highlighted,
}: { id: string; title: string; children: ReactNode; refs: MutableRefObject<Record<string, HTMLDivElement | null>>; highlighted: string | null }) {
  return (
    <div ref={(el) => (refs.current[id] = el)}>
      <div
        className={`runway-card transition-all duration-300 ${
          highlighted === id ? 'border-runway-accent/50 shadow-glow' : ''
        }`}
      >
        <div className="runway-sheen" />
        <div className="relative flex items-center gap-2.5 px-5 pt-5 pb-1">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
              highlighted === id ? 'bg-runway-accent animate-pulse-dot' : 'bg-runway-borderStrong'
            }`}
          />
          <h3 className="text-sm font-semibold text-runway-text">{title}</h3>
        </div>
        <div className="relative px-2 pb-3">{children}</div>
      </div>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <EmptyState
      icon={PlusCircle}
      title="No metric data yet"
      description="Add your first monthly snapshot or import a CSV to see MRR, churn, burn, and runway here."
      action={
        <div className="flex gap-3">
          <Button as="a" href="/metrics" color="primary" size="sm" startContent={<PlusCircle size={14} />}>
            Add snapshot
          </Button>
          <Button as="a" href="/import" variant="bordered" size="sm" startContent={<Upload size={14} />} className="border-runway-border text-runway-text">
            Import CSV
          </Button>
        </div>
      }
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
      <ChartCardSkeleton height={260} />
      <div className="grid md:grid-cols-12 gap-6">
        <div className="md:col-span-7"><ChartCardSkeleton /></div>
        <div className="md:col-span-5"><ChartCardSkeleton /></div>
        <div className="md:col-span-5"><ChartCardSkeleton /></div>
        <div className="md:col-span-7"><ChartCardSkeleton /></div>
      </div>
    </div>
  );
}
