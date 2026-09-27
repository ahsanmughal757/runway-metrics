import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, CartesianGrid } from 'recharts';
import type { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

/**
 * Rule of 40: annualized growth + profit margin. Bars >=40 are healthy.
 * Cell coloring pattern mirrors MomGrowthChart.
 */
export function RuleOf40Chart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, ruleOf40: s.derived.ruleOf40 ?? 0 }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={42} />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine
          y={40}
          stroke={chartColors.amber}
          strokeDasharray="4 4"
          label={{ value: 'Rule of 40', position: 'insideTopRight', fill: chartColors.amber, fontSize: 10, fontWeight: 600 }}
        />
        <Bar dataKey="ruleOf40" radius={[5, 5, 5, 5]} barSize={10} maxBarSize={16}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.ruleOf40 >= 40 ? chartColors.positive : chartColors.negative} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
