import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button, Select, SelectItem } from '@heroui/react';
import { DollarSign, TrendingDown, Flame, Gauge, Upload, PlusCircle } from 'lucide-react';
import { api } from '../lib/api';
import { companyKeys } from '../lib/queryKeys';
import { useCompany } from '../lib/CompanyContext';
import type { DashboardResponse } from '../lib/types';
import { KpiCard } from '../components/KpiCard';
import { CountUp } from '../components/CountUp';
import { KpiCardSkeleton, ChartCardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { MrrTrendChart } from '../components/charts/MrrTrendChart';
import { MrrWaterfallChart } from '../components/charts/MrrWaterfallChart';
import { ChurnTrendChart } from '../components/charts/ChurnTrendChart';
import { BurnCashChart } from '../components/charts/BurnCashChart';
import { NrrChart } from '../components/charts/NrrChart';
import { MomGrowthChart } from '../components/charts/MomGrowthChart';
import { BurnMultipleChart } from '../components/charts/BurnMultipleChart';
import { RuleOf40Chart } from '../components/charts/RuleOf40Chart';
import { QuickRatioChart } from '../components/charts/QuickRatioChart';
import { BenchmarkChart } from '../components/charts/BenchmarkChart';
import { ChartExportButton } from '../components/charts/ChartExportButton';
import { monthLabel } from '../components/charts/chartTheme';

function fmtCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const sectionIds = { mrr: 'chart-mrr', churn: 'chart-churn', burn: 'chart-burn', nrr: 'chart-nrr', mom: 'chart-mom' };

export function Dashboard() {
  const { activeCompanyId } = useCompany();
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [range, setRange] = useState<'6' | '12' | '24' | 'all'>('12');
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  // Passed to ChartCard instead of the ref object itself: registering a node is
  // a side effect, and a child writing into a prop during render re-renders the
  // parent on every ref callback.
  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    refs.current[id] = el;
  }, []);

  // Shared with `Metrics.tsx` and `Scenarios.tsx`, which read the same endpoint,
  // so a snapshot imported on one of them updates all three without a second
  // request. The company is the first element of the key, so switching company
  // cannot serve the previous tenant's numbers under the new name.
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: companyKeys.dashboard(activeCompanyId),
    queryFn: ({ signal }) => api.get<DashboardResponse>('/metrics/dashboard', signal),
    enabled: activeCompanyId !== null,
  });

  function jumpTo(id: string) {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(id);
    setTimeout(() => setHighlighted(null), 1400);
  }

  // The company is checked before `isPending` because a query disabled by
  // `enabled` is permanently pending: testing `isPending` alone would show a
  // skeleton that never resolves once the bootstrap had not yet produced a
  // company. Checking first also narrows the id for the chart's own reads.
  if (activeCompanyId === null || isPending) return <DashboardSkeleton />;
  // The previous error branch was a red border around the message and nothing
  // else, which left no way to try again short of reloading the page. It also
  // could not tell a server that was down from one that refused.
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || data.snapshots.length === 0 || !data.latest) return <EmptyDashboard />;

  const { latest, snapshots } = data;

  const chartSnapshots = range === 'all' ? snapshots : snapshots.slice(-Number(range));

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
          <Select
            aria-label="Date range"
            size="sm"
            variant="bordered"
            className="w-32"
            selectedKeys={[range]}
            onSelectionChange={(keys) => setRange(Array.from(keys)[0] as typeof range)}
            classNames={{
              trigger: 'bg-white/[0.02] border-runway-border/70 rounded-xl shadow-soft',
              popoverContent: 'bg-runway-raised border border-runway-borderStrong rounded-xl shadow-raised',
              listbox: 'text-runway-text',
            }}
          >
            <SelectItem key="6">6 months</SelectItem>
            <SelectItem key="12">12 months</SelectItem>
            <SelectItem key="24">24 months</SelectItem>
            <SelectItem key="all">All time</SelectItem>
          </Select>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
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
          value={
            <>
              <CountUp value={latest.derived.runwayMonths ?? 0} format={(n) => n.toFixed(0)} /> mo
            </>
          }
          secondary={fmtCurrency(latest.cash)}
          zone={zone}
          onPress={() => jumpTo(sectionIds.mrr)}
        />
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <ChartCard id={sectionIds.mrr} title="MRR Trend" registerRef={registerRef} highlighted={highlighted}>
          <MrrTrendChart snapshots={chartSnapshots} />
        </ChartCard>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <ChartCard id="chart-waterfall" title="MRR Waterfall" registerRef={registerRef} highlighted={highlighted}>
          <MrrWaterfallChart snapshots={chartSnapshots} />
        </ChartCard>
      </motion.div>

      {/* Bento layout: asymmetric widths instead of a uniform 2-up grid */}
      <motion.div className="grid md:grid-cols-12 gap-6" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="md:col-span-7">
          <ChartCard id={sectionIds.burn} title="Burn vs. Cash Balance" registerRef={registerRef} highlighted={highlighted}>
            <BurnCashChart snapshots={chartSnapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-5">
          <ChartCard id="chart-burn-multiple" title="Burn Multiple" registerRef={registerRef} highlighted={highlighted}>
            <BurnMultipleChart snapshots={chartSnapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-7">
          <ChartCard id="chart-rule-of-40" title="Rule of 40" registerRef={registerRef} highlighted={highlighted}>
            <RuleOf40Chart snapshots={chartSnapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-5">
          <ChartCard id="chart-quick-ratio" title="Quick Ratio" registerRef={registerRef} highlighted={highlighted}>
            <QuickRatioChart snapshots={chartSnapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-5">
          <ChartCard id={sectionIds.churn} title="Churn % Trend" registerRef={registerRef} highlighted={highlighted}>
            <ChurnTrendChart snapshots={chartSnapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-7">
          <ChartCard id={sectionIds.nrr} title="Net Revenue Retention" registerRef={registerRef} highlighted={highlighted}>
            <NrrChart snapshots={chartSnapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-7">
          <ChartCard id={sectionIds.mom} title="MoM Growth Rate" registerRef={registerRef} highlighted={highlighted}>
            <MomGrowthChart snapshots={chartSnapshots} />
          </ChartCard>
        </div>
        <div className="md:col-span-5">
          <ChartCard id="chart-benchmarks" title="Benchmarks" registerRef={registerRef} highlighted={highlighted}>
            <BenchmarkChart />
          </ChartCard>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChartCard({
  id,
  title,
  children,
  registerRef,
  highlighted,
}: {
  id: string;
  title: string;
  children: ReactNode;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  highlighted: string | null;
}) {
  // Target for the PNG export button; unrelated to the scroll-to refs.
  const chartRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={(el) => registerRef(id, el)}>
      <div className={`runway-card transition-all duration-300 ${highlighted === id ? 'border-runway-accent/50 shadow-glow' : ''}`}>
        <div className="runway-sheen" />
        <div className="relative flex items-center gap-2.5 px-5 pt-5 pb-1">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
              highlighted === id ? 'bg-runway-accent animate-pulse-dot' : 'bg-runway-borderStrong'
            }`}
          />
          <h3 className="text-sm font-semibold text-runway-text">{title}</h3>
          <div className="ml-auto">
            <ChartExportButton targetRef={chartRef} />
          </div>
        </div>
        <div ref={chartRef} className="relative px-2 pb-3">
          {children}
        </div>
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
          <Button
            as="a"
            href="/import"
            variant="bordered"
            size="sm"
            startContent={<Upload size={14} />}
            className="border-runway-border text-runway-text"
          >
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
        <div className="md:col-span-7">
          <ChartCardSkeleton />
        </div>
        <div className="md:col-span-5">
          <ChartCardSkeleton />
        </div>
        <div className="md:col-span-5">
          <ChartCardSkeleton />
        </div>
        <div className="md:col-span-7">
          <ChartCardSkeleton />
        </div>
      </div>
    </div>
  );
}
