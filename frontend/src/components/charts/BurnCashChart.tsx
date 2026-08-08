import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

export function BurnCashChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, burn: s.burnRate, cash: s.cash }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="burnGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.negative} stopOpacity={0.55} />
            <stop offset="100%" stopColor={chartColors.negative} stopOpacity={0.18} />
          </linearGradient>
          <linearGradient id="cashGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={chartColors.accent} />
            <stop offset="100%" stopColor={chartColors.accent2} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
        <YAxis yAxisId="left" tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={52} />
        <YAxis yAxisId="right" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={52} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => `$${v.toLocaleString()}`} />}
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
        />
        <Bar yAxisId="left" dataKey="burn" name="Burn" fill="url(#burnGradient)" radius={[4, 4, 0, 0]} barSize={14} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cash"
          name="Cash balance"
          stroke="url(#cashGradient)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.accent, strokeWidth: 2.5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
