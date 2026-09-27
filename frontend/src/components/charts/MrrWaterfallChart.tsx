import { useMemo, useState } from 'react';
import { Select, SelectItem } from '@heroui/react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell, LabelList } from 'recharts';
import type { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

interface WaterfallEntry {
  name: string;
  base: number;
  value: number;
  fill: string;
  display: string;
}

/**
 * Single-month MRR waterfall. Each column is a floating segment built from an
 * invisible "base" series (stacked) plus a visible delta bar. Categories are
 * Start -> +New -> +Expansion -> -Contraction -> -Churned -> End.
 */
export function MrrWaterfallChart({ snapshots }: { snapshots: Snapshot[] }) {
  const [month, setMonth] = useState<string | undefined>(
    snapshots.length > 0 ? snapshots[snapshots.length - 1].month : undefined,
  );

  const idx = snapshots.findIndex((s) => s.month === month);
  const current = idx >= 0 ? snapshots[idx] : null;
  const prior = idx > 0 ? snapshots[idx - 1] : null;

  const data = useMemo<WaterfallEntry[]>(() => {
    if (!current) return [];
    const startMrr = prior ? prior.mrr : current.mrr - current.newMrr - current.expansionMrr + current.contractionMrr + current.churnedMrr;
    const endMrr = current.mrr;
    const segs: { name: string; base: number; value: number; fill: string; display: string }[] = [
      { name: 'Start', base: 0, value: startMrr, fill: chartColors.accent, display: `$${startMrr.toLocaleString()}` },
      { name: 'New MRR', base: startMrr, value: current.newMrr, fill: chartColors.positive, display: `+$${current.newMrr.toLocaleString()}` },
      { name: 'Expansion', base: startMrr + current.newMrr, value: current.expansionMrr, fill: chartColors.positive, display: `+$${current.expansionMrr.toLocaleString()}` },
      { name: 'Contraction', base: startMrr + current.newMrr + current.expansionMrr + current.contractionMrr, value: -current.contractionMrr, fill: chartColors.negative, display: `-$${current.contractionMrr.toLocaleString()}` },
      { name: 'Churned', base: startMrr + current.newMrr + current.expansionMrr + current.contractionMrr + current.churnedMrr, value: -current.churnedMrr, fill: chartColors.negative, display: `-$${current.churnedMrr.toLocaleString()}` },
      { name: 'End', base: 0, value: endMrr, fill: chartColors.accent, display: `$${endMrr.toLocaleString()}` },
    ];
    return segs;
  }, [current, prior]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end pr-4">
        <Select
          aria-label="Waterfall month"
          size="sm"
          variant="bordered"
          className="w-40"
          selectedKeys={month ? [month] : []}
          onSelectionChange={(keys) => setMonth(Array.from(keys)[0] as string)}
          classNames={{
            trigger: 'bg-white/[0.02] border-runway-border/70 rounded-xl shadow-soft',
            popoverContent: 'bg-runway-raised border border-runway-borderStrong rounded-xl shadow-raised',
            listbox: 'text-runway-text',
          }}
        >
          {snapshots.map((s) => (
            <SelectItem key={s.month}>{monthLabel(s.month)}</SelectItem>
          ))}
        </Select>
      </div>
      {!current ? (
        <p className="px-5 pb-5 text-sm text-runway-muted">No snapshot selected.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="name" tick={axisTickStyle} axisLine={false} tickLine={false} tickMargin={8} interval={0} />
            <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={52} />
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(v) => `$${Math.abs(Number(v)).toLocaleString()}`}
                  labelFormatter={(l) => String(l)}
                />
              }
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <ReferenceLine y={0} stroke={chartColors.axis} strokeOpacity={0.8} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="w" radius={[3, 3, 3, 3]} barSize={44} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
              <LabelList
                dataKey="display"
                position="top"
                style={{ fill: chartColors.muted, fontSize: 10, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
