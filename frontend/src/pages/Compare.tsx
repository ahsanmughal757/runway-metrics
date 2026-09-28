import { useEffect, useState } from 'react';
import { Select, SelectItem } from '@heroui/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { GitCompare } from 'lucide-react';
import { api } from '../lib/api';
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

export function Compare() {
  const { activeCompanyId, role } = useCompany();
  const [own, setOwn] = useState<DashboardResponse | null>(null);
  const [comparePersona, setComparePersona] = useState<string | null>(null);
  const [compareLabel, setCompareLabel] = useState('');
  const [compareData, setCompareData] = useState<{ month: string; mrr: number }[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [compareError, setCompareError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  const options = activeCompanyId ? OTHER_PERSONAS[activeCompanyId] ?? [] : [];

  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    setOwn(null);
    setError(null);
    api
      .get<DashboardResponse>('/metrics/dashboard')
      .then((d) => {
        if (!cancelled) setOwn(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      });
    if (options.length > 0 && !comparePersona) setComparePersona(options[0].key);
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!comparePersona) return;
    let cancelled = false;
    setUnavailable(false);
    setCompareError(null);
    // Cleared on every switch, not just on success. Without this a failed fetch
    // left the *previous* persona's series in state while the selector showed
    // the *new* persona, so the chart confidently attributed another company's
    // MRR to the company the reader had just selected.
    setCompareData(null);
    api
      .get<{ available: boolean; companyName?: string; snapshots?: { month: string; mrr: number }[]; reason?: string }>(
        `/metrics/compare/${comparePersona}`,
      )
      .then((res) => {
        if (cancelled) return;
        if (!res.available) {
          setUnavailable(true);
          return;
        }
        setCompareLabel(res.companyName ?? comparePersona);
        setCompareData(res.snapshots ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setCompareError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [comparePersona, attempt]);

  if (error) return <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!own) return <ChartCardSkeleton height={360} />;

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
    compareMrr: compareData?.[i]?.mrr,
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
          onSelectionChange={(keys) => setComparePersona(Array.from(keys)[0] as string)}
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

      {compareError !== null && <ErrorState error={compareError} onRetry={() => setAttempt((n) => n + 1)} />}

      {unavailable && (
        <EmptyState
          icon={GitCompare}
          title="Comparison is demo-mode only"
          description="Cross-company comparison intentionally isn't available when ENABLE_DATABASE=true - real mode never allows one tenant to read another's data."
        />
      )}

      {!unavailable && !compareError && (
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
          </div>
        </div>
      )}
    </div>
  );
}
