import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import type { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

/**
 * Burn multiple: annualized net-new MRR / net burn. <1 means growth can't
 * outpace spend; >3 is strong for seed-stage.
 */
export function BurnMultipleChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, burnMultiple: s.derived.burnMultiple ?? null }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={42} />
        <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(2) + 'x'} />} cursor={{ stroke: chartColors.axis, strokeDasharray: '3 6' }} />
        <ReferenceLine
          y={1}
          stroke={chartColors.muted}
          strokeDasharray="4 4"
          strokeOpacity={0.7}
          label={{ value: 'efficient', position: 'insideTopLeft', fill: chartColors.muted, fontSize: 10, fontWeight: 600 }}
        />
        <ReferenceLine
          y={2}
          stroke={chartColors.muted}
          strokeDasharray="4 4"
          strokeOpacity={0.4}
          label={{ value: 'watch', position: 'insideTopRight', fill: chartColors.muted, fontSize: 10, fontWeight: 600 }}
        />
        <Line
          type="monotone"
          dataKey="burnMultiple"
          name="Burn multiple"
          stroke={chartColors.accent}
          strokeWidth={2.5}
          connectNulls
          dot={false}
          activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.accent, strokeWidth: 2.5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
