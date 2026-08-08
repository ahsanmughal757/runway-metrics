import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Snapshot } from '../../lib/types';
import { axisTickStyle, chartColors, monthLabel } from './chartTheme';

export function MrrTrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, mrr: s.mrr }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={chartColors.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={{ stroke: '#334066' }} tickLine={false} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
        <Tooltip
          formatter={(v: number) => [`$${v.toLocaleString()}`, 'MRR']}
          labelFormatter={monthLabel}
          contentStyle={{ background: '#182142', border: '1px solid #334066', borderRadius: 8, fontSize: 12 }}
        />
        <Area type="monotone" dataKey="mrr" stroke={chartColors.accent} strokeWidth={2} fill="url(#mrrGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
