import { Chip } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useCompany } from '../../lib/CompanyContext';
import { companyKeys } from '../../lib/queryKeys';
import { chartColors } from './chartTheme';

interface BenchmarkMetric {
  key: string;
  label: string;
  band: number[]; // p10, p25, p50, p75, p90
  you: number | null;
  percentile: number | null;
}

interface BenchmarkResponse {
  disclosure: string;
  metrics: BenchmarkMetric[];
}

function fmtValue(v: number): string {
  return Math.abs(v) < 10 ? `${v.toFixed(1)}%` : v.toFixed(1);
}

/** Horizontal percentile band: ticks at p25/p50/p75, marker at the company's percentile. */
function BandRow({ m }: { m: BenchmarkMetric }) {
  const ticks = [25, 50, 75];
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-36 shrink-0 text-runway-muted">{m.label}</span>
      <div className="relative flex-1 h-2.5 rounded-full bg-runway-border/60">
        {ticks.map((p) => (
          <span key={p} className="absolute top-0 bottom-0 w-px bg-runway-borderStrong/70" style={{ left: `${p}%` }} />
        ))}
        <span
          className="absolute -top-[3px] h-4 w-[5px] rounded-full shadow-glow transition-all duration-500"
          style={{ left: `${m.percentile ?? 0}%`, background: chartColors.accent }}
          title={`You: ${m.percentile}th percentile`}
        />
      </div>
      <span className="w-20 shrink-0 text-right tabular-nums text-runway-muted">{m.you !== null ? fmtValue(m.you) : '—'}</span>
      <Chip
        size="sm"
        variant="flat"
        color={m.percentile !== null && m.percentile >= 50 ? 'success' : 'warning'}
        className="w-32 shrink-0 justify-center"
      >
        {m.percentile !== null ? `You: ${m.percentile}th pct` : 'No data'}
      </Chip>
    </div>
  );
}

/**
 * Static illustrative benchmark overlay. Bands are invented seed-stage
 * percentiles — the disclosure caption must stay visible per the v3 plan.
 */
export function BenchmarkChart() {
  const { activeCompanyId } = useCompany();

  const { data, isPending, isError, error } = useQuery({
    queryKey: companyKeys.benchmarks(activeCompanyId),
    queryFn: ({ signal }) => api.get<BenchmarkResponse>('/metrics/benchmarks', signal),
    enabled: activeCompanyId !== null,
  });

  if (activeCompanyId === null || isPending) return <p className="px-5 pb-5 text-sm text-runway-muted">Loading benchmarks…</p>;

  /**
   * A failure is not a loading state.
   *
   * This read used to `.catch(() => setData(null))`, which made a dead server
   * indistinguishable from a slow one — the `!data` guard above then showed
   * "Loading benchmarks…" indefinitely, so a reader whose API was down was told
   * the app was still working. `ErrorState` is the app-shell component, so the
   * message is inlined here to match the card it sits in.
   */
  if (isError) {
    return (
      <p className="px-5 pb-5 text-sm text-danger">
        Could not load benchmarks. {error instanceof Error ? error.message : 'Please try again.'}
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex flex-col gap-3">
        {data.metrics.map((m) => (
          <BandRow key={m.key} m={m} />
        ))}
      </div>
      <p className="text-[11px] text-runway-muted">{data.disclosure}.</p>
    </div>
  );
}
