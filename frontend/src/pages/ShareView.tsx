import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Flame, Gauge, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@heroui/react';
import { ApiError, api } from '../lib/api';
import { publicKeys } from '../lib/queryKeys';
import type { DashboardResponse } from '../lib/types';
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
 *
 * The only page in the app with no session, so it is also the only one whose cache
 * key has no company in it (`publicKeys`, not `companyKeys`). That is not an
 * oversight: there is no company to name, and the token *is* the credential.
 */
export function ShareView() {
  const { token } = useParams<{ token: string }>();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: publicKeys.sharedDashboard(token ?? ''),
    queryFn: ({ signal }) => api.get<DashboardResponse>(`/public/dashboard/${token}`, signal),
    enabled: token !== undefined,
  });

  // A dead token is not worth a retry button. The server answers unknown, expired
  // and revoked identically — one message on purpose, so the response cannot be
  // used to tell which of those it was — and trying again will produce exactly
  // the same answer. A network failure is the other case: that one might succeed.
  const offline = error instanceof ApiError && error.isNetwork;

  if (isError) {
    return (
      <div className="min-h-screen bg-runway-bg flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-runway-negative/30 bg-runway-surface p-6 text-center">
          <Lock className="mx-auto text-runway-negative mb-3" size={22} />
          <h1 className="text-sm font-semibold text-runway-text">Link unavailable</h1>
          {/* The message is derived here rather than through `ErrorState`, which is
              app-shell chrome. The network-versus-refusal split is still the point
              of that component, so it is kept: "we could not reach the server" and
              "this link is no longer valid" need different actions from the reader. */}
          <p className="text-xs text-runway-muted mt-1.5">
            {offline
              ? 'The server did not respond. Check your connection and try again.'
              : error instanceof Error
                ? error.message
                : 'Something went wrong.'}
          </p>
          {offline && (
            <Button
              size="sm"
              variant="flat"
              className="mt-4"
              startContent={<RefreshCw size={14} />}
              onPress={() => void refetch()}
            >
              Try again
            </Button>
          )}
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

        {isPending && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
            </div>
            <div className="mt-6">
              <ChartCardSkeleton height={260} />
            </div>
          </>
        )}

        {/*
          The empty case is the reason this branch is written as it is. Every
          other state of this page is `data && data.latest && <...>`, and a company
          with no recorded metrics has a response but no `latest` — so the previous
          version rendered neither the cards nor the skeletons and left a blank
          space below the header. A share link to a company that has not entered a
          month of data is a working link showing nothing, which reads as broken
          rather than empty.
        */}
        {data && !data.latest && (
          <div className="rounded-2xl border border-runway-border/60 bg-runway-surface p-10 text-center">
            <p className="text-sm font-medium text-runway-text">No metrics recorded yet</p>
            <p className="mt-1.5 text-xs text-runway-muted">
              This link is valid, but the company has not entered a month of data.
            </p>
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

        <footer className="mt-10 text-center text-[11px] text-runway-muted">
          Shared via Runway — investor-grade metrics for founders.
        </footer>
      </div>
    </div>
  );
}
