import { useState } from 'react';
import { Card, CardBody, CardHeader, Tab, Tabs } from '@heroui/react';
import { CohortRow } from '../lib/types';

function cellColor(pct: number) {
  if (pct >= 90) return 'bg-runway-positive/70';
  if (pct >= 70) return 'bg-runway-positive/40';
  if (pct >= 50) return 'bg-runway-accent/30';
  if (pct >= 30) return 'bg-runway-muted/25';
  return 'bg-runway-negative/25';
}

export function CohortTable({ rows }: { rows: CohortRow[] }) {
  const [mode, setMode] = useState<'logo' | 'revenue'>('revenue');
  const maxOffset = Math.max(0, ...rows.map((r) => (mode === 'logo' ? r.logoRetention.length : r.revenueRetention.length)));

  return (
    <Card className="bg-runway-surface border border-runway-border">
      <CardHeader className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-runway-text">Cohort Retention</h3>
        <Tabs
          aria-label="Retention basis"
          size="sm"
          selectedKey={mode}
          onSelectionChange={(key) => setMode(key as 'logo' | 'revenue')}
          color="primary"
          classNames={{ tabList: 'bg-runway-charcoal border border-runway-border' }}
        >
          <Tab key="revenue" title="Revenue" />
          <Tab key="logo" title="Logo" />
        </Tabs>
      </CardHeader>
      <CardBody>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left text-runway-muted font-normal px-2 py-1.5 sticky left-0 bg-runway-surface">Cohort</th>
                <th className="text-right text-runway-muted font-normal px-2 py-1.5">Size</th>
                {Array.from({ length: maxOffset }).map((_, i) => (
                  <th key={i} className="text-center text-runway-muted font-normal px-2 py-1.5 min-w-[42px]">
                    M{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const series = mode === 'logo' ? r.logoRetention : r.revenueRetention;
                return (
                  <tr key={r.cohortLabel} className="border-t border-runway-border/60">
                    <td className="px-2 py-1.5 text-runway-text sticky left-0 bg-runway-surface whitespace-nowrap">{r.cohortLabel}</td>
                    <td className="px-2 py-1.5 text-right text-runway-muted">{r.size}</td>
                    {series.map((pct, i) => (
                      <td key={i} className={`text-center px-2 py-1.5 text-runway-text ${cellColor(pct)}`}>
                        {pct.toFixed(0)}%
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
