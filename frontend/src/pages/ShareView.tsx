import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DollarSign, Flame, Gauge, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { DashboardResponse } from '../lib/types';
import { KpiCard } from '../components/KpiCard';
import { CountUp } from '../components/CountUp';
import { MrrTrendChart } from '../components/charts/MrrTrendChart';
import { KpiCardSkeleton, ChartCardSkeleton } from '../components/Skeleton';

function fmtCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Read-only, token-gated view for investors who don't have app credentials.
 * Rendered outside the AppShell on purpose — no sidebar, no company context.
 */
export function ShareView() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<DashboardResponse>(`/public/dashboard/${token}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-runway-bg flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-runway-negative/30 bg-runway-surface p-6 text-center">
          <Lock className="mx-auto text-runway-negative mb-3" size={22} />
          <h1 className="text-sm font-semibold text-runway-text">Link unavailable</h1>
          <p className="text-xs text-runway-muted mt-1.5">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-runway-bg relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -top-32 left-[12%] w-[34rem] h-[34rem] rounded-full bg-runway-accent/[0.07] blur-[120px]" />
      </div>
      <div className="relative max-w-5xl mx-auto px-6 py-10">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-condensed text-lg font-bold tracking-wide text-runway-text">RUNWAY</h1>
            <p className="text-xs text-runway-muted">Shared dashboard</p>
          </div>
          {data?.latest && (
            <span className="text-xs text-runway-muted">
              Data as of {new Date(data.latest.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          )}
        </header>

        {!data && !error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
          </div>
        )}

        {data && data.latest && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon={DollarSign} label="MRR" value={<CountUp value={data.latest.mrr} format={fmtCurrency} />} secondary={`${data.latest.derived.momGrowthRate ?? 0}% vs prior month`} trend="up" />
              <KpiCard icon={Flame} label="Burn Rate" value={<CountUp value={data.latest.derived.threeMoAvgBurn ?? data.latest.burnRate} format={fmtCurrency} />} secondary={`3-mo avg · ${fmtCurrency(data.latest.burnRate)} actual`} />
              <KpiCard icon={Gauge} label="Runway" value={<><CountUp value={data.latest.derived.runwayMonths ?? 0} format={(n) => n.toFixed(0)} /> mo</>} secondary={fmtCurrency(data.latest.cash)} zone={data.latest.derived.runwayZone} />
              <KpiCard icon={DollarSign} label="Net Revenue Retention" value={<><CountUp value={data.latest.derived.nrr ?? 0} format={(n) => n.toFixed(1)} />%</>} secondary="12-mo basis" />
            </div>

            <div className="mt-6 runway-card overflow-hidden">
              <div className="runway-sheen" />
              <div className="relative px-5 pt-5 pb-1">
                <h3 className="text-sm font-semibold text-runway-text">MRR Trend</h3>
              </div>
              <div className="relative px-2 pb-3">
                <MrrTrendChart snapshots={data.snapshots} />
              </div>
            </div>
          </>
        )}

        {!data && !error && <div className="mt-6"><ChartCardSkeleton height={260} /></div>}

        <footer className="mt-10 text-center text-[11px] text-runway-muted">
          Shared via Runway — investor-grade metrics for founders.
        </footer>
      </div>
    </div>
  );
}
