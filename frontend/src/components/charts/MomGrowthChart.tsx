import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid } from 'recharts';
import type { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

export function MomGrowthChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, growth: s.derived.momGrowthRate ?? 0 }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="growthPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5eead4" stopOpacity={0.95} />
            <stop offset="100%" stopColor={chartColors.positive} stopOpacity={0.7} />
          </linearGradient>
          <linearGradient id="growthNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.negative} stopOpacity={0.95} />
            <stop offset="100%" stopColor="#fda4af" stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridStyle} />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          tick={axisTickStyle}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={42} />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine y={0} stroke={chartColors.axis} strokeOpacity={0.8} />
        <Bar dataKey="growth" radius={[5, 5, 5, 5]} barSize={10} maxBarSize={16}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.growth >= 0 ? 'url(#growthPos)' : 'url(#growthNeg)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
