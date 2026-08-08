import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Snapshot } from '../../lib/types';
import { axisTickStyle, chartColors, monthLabel } from './chartTheme';

export function BurnCashChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, burn: s.burnRate, cash: s.cash }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={{ stroke: '#334066' }} tickLine={false} />
        <YAxis yAxisId="left" tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
        <YAxis yAxisId="right" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
        <Tooltip
          labelFormatter={monthLabel}
          formatter={(v: number) => `$${v.toLocaleString()}`}
          contentStyle={{ background: '#182142', border: '1px solid #334066', borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: chartColors.muted }} />
        <Bar yAxisId="left" dataKey="burn" name="Burn" fill={chartColors.muted} radius={[4, 4, 0, 0]} barSize={14} />
        <Line yAxisId="right" type="monotone" dataKey="cash" name="Cash balance" stroke={chartColors.accent} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
