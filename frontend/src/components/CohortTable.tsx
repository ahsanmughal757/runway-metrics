import { useState } from 'react';
import { Tab, Tabs } from '@heroui/react';
import { CohortRow } from '../lib/types';

function cellColor(pct: number) {
  if (pct >= 90) return 'bg-runway-positive/20 text-runway-positive';
  if (pct >= 70) return 'bg-runway-positive/10 text-runway-positive/90';
  if (pct >= 50) return 'bg-runway-accent/10 text-runway-accent';
  if (pct >= 30) return 'bg-runway-muted/10 text-runway-muted';
  return 'bg-runway-negative/10 text-runway-negative/90';
}

export function CohortTable({ rows }: { rows: CohortRow[] }) {
  const [mode, setMode] = useState<'logo' | 'revenue'>('revenue');
  const maxOffset = Math.max(0, ...rows.map((r) => (mode === 'logo' ? r.logoRetention.length : r.revenueRetention.length)));

  return (
    <div className="runway-card overflow-hidden">
      <div className="runway-sheen" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="text-sm font-semibold text-runway-text">Cohort Retention</h3>
        <Tabs
          aria-label="Retention basis"
          size="sm"
          selectedKey={mode}
          onSelectionChange={(key) => setMode(key as 'logo' | 'revenue')}
          color="primary"
          variant="solid"
          classNames={{
            tabList: 'bg-white/[0.03] border border-runway-border/70 rounded-xl p-1',
            tab: 'text-runway-muted data-[selected=true]:text-white rounded-lg',
            cursor: 'bg-accent-gradient',
          }}
        >
          <Tab key="revenue" title="Revenue" />
          <Tab key="logo" title="Logo" />
        </Tabs>
      </div>
      <div className="relative overflow-x-auto px-3 pb-3">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 px-3 py-2 text-left font-medium text-runway-muted bg-runway-charcoal/40">Cohort</th>
              <th className="px-3 py-2 text-right font-medium text-runway-muted">Size</th>
              {Array.from({ length: maxOffset }).map((_, i) => (
                <th key={i} className="px-3 py-2 text-center font-medium text-runway-muted min-w-[44px]">
                  M{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const series = mode === 'logo' ? r.logoRetention : r.revenueRetention;
              return (
                <tr key={r.cohortLabel} className="border-t border-runway-border/50">
                  <td className="sticky left-0 px-3 py-2 text-runway-text font-medium whitespace-nowrap bg-runway-surface">
                    {r.cohortLabel}
                  </td>
                  <td className="px-3 py-2 text-right text-runway-muted tabular-nums">{r.size}</td>
                  {series.map((pct, i) => (
                    <td key={i} className={`px-1 py-1 text-center rounded-lg font-semibold tabular-nums ${cellColor(pct)}`}>
                      {pct.toFixed(0)}%
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
