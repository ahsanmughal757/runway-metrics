import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectItem } from '@heroui/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { GitCompare } from 'lucide-react';
import { api } from '../lib/api';
import { companyKeys } from '../lib/queryKeys';
import { useCompany } from '../lib/CompanyContext';
import type { DashboardResponse } from '../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from '../components/charts/chartTheme';
import { ChartCardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';

const OTHER_PERSONAS: Record<string, { key: string; label: string }[]> = {
  'demo-company-steady': [
    { key: 'hypergrowth', label: 'Fathom Metrics (hypergrowth)' },
    { key: 'struggling', label: 'Ledger & Vine (struggling)' },
  ],
  'demo-company-hypergrowth': [
    { key: 'steady', label: 'Northlane Analytics (steady)' },
    { key: 'struggling', label: 'Ledger & Vine (struggling)' },
  ],
  'demo-company-struggling': [
    { key: 'steady', label: 'Northlane Analytics (steady)' },
    { key: 'hypergrowth', label: 'Fathom Metrics (hypergrowth)' },
  ],
};

interface ComparePoint { month: string; ownMrr: number; compareMrr?: number }

interface CompareResponse {
  available: boolean;
  companyName?: string;
  snapshots?: { month: string; mrr: number }[];
  reason?: string;
}

export function Compare() {
  const { activeCompanyId } = useCompany();
  const [chosen, setChosen] = useState<string | null>(null);

  const options = activeCompanyId ? OTHER_PERSONAS[activeCompanyId] ?? [] : [];

  /**
   * The selected peer, resolved from `options` on every render rather than
   * stored.
   *
   * The stored version was the page's worst bug. It was seeded inside an effect
   * (`if (options.length > 0 && !comparePersona) setComparePersona(...)`) that
   * deliberately omitted `comparePersona` from its dependency list, so the
   * default was chosen once and never again: switch to a company whose peer list
   * does not contain the remembered persona and the chart kept comparing against
   * a company the reader is no longer looking at, with the dropdown naming
   * nothing they had chosen.
   *
   * Deriving it means a selection that is not on offer simply is not the
   * selection. The state is kept — a user's explicit choice should survive a
   * re-render — but it cannot outlive the list it was drawn from.
   */
  const comparePersona = chosen && options.some((o) => o.key === chosen) ? chosen : (options[0]?.key ?? null);

  const { data: own, isPending: ownPending, isError: ownFailed, error: ownError, refetch: refetchOwn } = useQuery({
    queryKey: companyKeys.dashboard(activeCompanyId),
    queryFn: ({ signal }) => api.get<DashboardResponse>('/metrics/dashboard', signal),
    enabled: activeCompanyId !== null,
  });

  // Persona in the key as well as the tenant: switching the dropdown is a
  // different question, and a shared key would show the old peer's line while
  // the selector reads the new one.
  const {
    data: comparison,
    isPending: comparePending,
    isError: compareFailed,
    error: compareError,
    refetch: refetchCompare,
  } = useQuery({
    queryKey: companyKeys.compare(activeCompanyId, comparePersona ?? ''),
    queryFn: ({ signal }) => api.get<CompareResponse>(`/metrics/compare/${comparePersona ?? ''}`, signal),
    // No peer to ask about means no request, rather than a request for the empty
    // string. The `options.length === 0` branch below renders the explanation.
    enabled: comparePersona !== null,
  });

  /**
   * The peer's display name, straight off the response.
   *
   * It used to be a second `useState` set in a `.then`, which is the same value
   * the response already carried and therefore a second thing that could
   * disagree with it — a stale name from a previous persona painted onto the
   * current persona's line.
   */
  const compareLabel = comparison?.available === true ? (comparison.companyName ?? comparePersona ?? '') : '';
  const unavailable = comparison?.available === false;

  // The company check comes before `isPending`: a query disabled by `enabled` is
  // permanently pending, so testing `isPending` alone would leave the skeleton up
  // until bootstrap finished rather than only until this request did.
  if (activeCompanyId === null || ownPending) return <ChartCardSkeleton height={360} />;
  if (ownFailed) return <ErrorState error={ownError} onRetry={() => void refetchOwn()} />;
  // An empty `own` is not a reason to keep showing a skeleton. The skeleton is
  // the claim "we have asked and are waiting"; rendering it for a failed or
  // absent response is the lie the shared `!own` branch used to tell, and it is
  // why a dead API looked identical to a slow one here.
  if (!own) return <ErrorState error={ownError ?? new Error('No comparison data for this company.')} />;

  if (options.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title="Comparison unavailable"
        description="This company has no configured comparison peers in the demo dataset."
      />
    );
  }

  const merged: ComparePoint[] = own.snapshots.map((s, i) => ({
    month: s.month,
    ownMrr: s.mrr,
    // `undefined` while the peer is loading or after it failed, which is what
    // makes the chart draw only this company's line rather than a gap that
    // reads as zero revenue for the peer.
    compareMrr: comparison?.available ? comparison.snapshots?.[i]?.mrr : undefined,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-runway-text">Compare Companies</h2>
          <p className="text-sm text-runway-muted">Overlay MRR against another persona in the demo dataset.</p>
        </div>
        <Select
          aria-label="Compare against"
          size="sm"
          variant="bordered"
          className="w-64"
          selectedKeys={comparePersona ? [comparePersona] : []}
          onSelectionChange={(keys) => setChosen(Array.from(keys)[0] as string)}
          classNames={{
            trigger: 'bg-white/[0.02] border-runway-border/70 rounded-xl shadow-soft',
            popoverContent: 'bg-runway-raised border border-runway-borderStrong rounded-xl shadow-raised',
            listbox: 'text-runway-text',
          }}
        >
          {options.map((o) => (
            <SelectItem key={o.key}>{o.label}</SelectItem>
          ))}
        </Select>
      </div>

      {compareFailed && <ErrorState error={compareError} onRetry={() => void refetchCompare()} />}

      {unavailable && (
        <EmptyState
          icon={GitCompare}
          title="Comparison is demo-mode only"
          description="Cross-company comparison intentionally isn't available when ENABLE_DATABASE=true - real mode never allows one tenant to read another's data."
        />
      )}

      {!unavailable && !compareFailed && (
        <div className="runway-card overflow-hidden">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold text-runway-text">MRR — this company vs. {compareLabel || '…'}</h3>
            <div className="flex items-center gap-4 text-[11px] text-runway-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-runway-accent" /> This company
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-runway-amber" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f6b93b 0 4px, transparent 4px 7px)' }} /> {compareLabel}
              </span>
            </div>
          </div>
          <div className="relative px-2 pb-3">
            {/* The card's frame and the peer's name come from the previous
                response, so the chart area alone is replaced while this persona's
                line is in flight. Replacing the whole card instead would hide
                the very control that changes the persona. */}
            {comparePending ? (
              <ChartCardSkeleton height={340} />
            ) : (
              <ResponsiveContainer width="100%" height={340}>
              <LineChart data={merged} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={52} />
                <Tooltip content={<ChartTooltip formatter={(v) => `$${v.toLocaleString()}`} />} cursor={{ stroke: chartColors.axis, strokeDasharray: '3 6' }} />
                <Line
                  type="monotone"
                  dataKey="ownMrr"
                  name="This company"
                  stroke={chartColors.accent}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.accent, strokeWidth: 2.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="compareMrr"
                  name={compareLabel}
                  stroke={chartColors.amber}
                  strokeWidth={2.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.amber, strokeWidth: 2.5 }}
                />
              </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
