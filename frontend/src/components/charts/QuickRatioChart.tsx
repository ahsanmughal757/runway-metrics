import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import type { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

/**
 * Quick ratio: (new + expansion MRR) / (churned + contraction MRR).
 * >=4 is the healthy SaaS benchmark.
 */
export function QuickRatioChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, quickRatio: s.derived.quickRatio ?? null }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
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
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={42} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => v.toFixed(2) + 'x'} />}
          cursor={{ stroke: chartColors.axis, strokeDasharray: '3 6' }}
        />
        <ReferenceLine
          y={4}
          stroke={chartColors.positive}
          strokeDasharray="4 4"
          strokeOpacity={0.7}
          label={{ value: 'healthy ≥4x', position: 'insideTopRight', fill: chartColors.positive, fontSize: 10, fontWeight: 600 }}
        />
        <Line
          type="monotone"
          dataKey="quickRatio"
          name="Quick ratio"
          stroke={chartColors.accent2}
          strokeWidth={2.5}
          connectNulls
          dot={false}
          activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.accent2, strokeWidth: 2.5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
