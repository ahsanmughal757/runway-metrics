import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, Select, SelectItem } from '@heroui/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { GitCompare } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { DashboardResponse } from '../lib/types';
import { axisTickStyle, chartColors, monthLabel } from '../components/charts/chartTheme';
import { ChartCardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

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

  const options = activeCompanyId ? OTHER_PERSONAS[activeCompanyId] ?? [] : [];

  useEffect(() => {
    if (!activeCompanyId) return;
    api.get<DashboardResponse>('/metrics/dashboard').then(setOwn);
    if (options.length > 0 && !comparePersona) setComparePersona(options[0].key);
  }, [activeCompanyId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!comparePersona) return;
    setUnavailable(false);
    api
      .get<{ available: boolean; companyName?: string; snapshots?: { month: string; mrr: number }[]; reason?: string }>(
        `/metrics/compare/${comparePersona}`,
      )
      .then((res) => {
        if (!res.available) {
          setUnavailable(true);
          return;
        }
        setCompareLabel(res.companyName ?? comparePersona);
        setCompareData(res.snapshots ?? []);
      });
  }, [comparePersona]);

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
          classNames={{ trigger: 'border-runway-border bg-runway-surface' }}
        >
          {options.map((o) => (
            <SelectItem key={o.key}>{o.label}</SelectItem>
          ))}
        </Select>
      </div>

      {unavailable && (
        <EmptyState
          icon={GitCompare}
          title="Comparison is demo-mode only"
          description="Cross-company comparison intentionally isn't available when ENABLE_DATABASE=true — real mode never allows one tenant to read another's data."
        />
      )}

      {!unavailable && (
        <Card className="bg-runway-surface border border-runway-border">
          <CardHeader className="text-sm font-medium text-runway-text">MRR — this company vs. {compareLabel || '…'}</CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={merged} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={{ stroke: '#242f4d' }} tickLine={false} />
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
                <Tooltip
                  labelFormatter={monthLabel}
                  formatter={(v: number) => `$${v.toLocaleString()}`}
                  contentStyle={{ background: '#182142', border: '1px solid #334066', borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: chartColors.muted }} />
                <Line type="monotone" dataKey="ownMrr" name="This company" stroke={chartColors.accent} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="compareMrr" name={compareLabel} stroke="#f2b84b" strokeWidth={2} strokeDasharray="5 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
