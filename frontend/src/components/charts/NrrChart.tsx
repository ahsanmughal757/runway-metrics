import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Snapshot } from '../../lib/types';
import { axisTickStyle, chartColors, monthLabel } from './chartTheme';

// The metric investors scan for first: >100% = expansion outpacing churn.
export function NrrChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, nrr: s.derived.nrr }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={{ stroke: '#334066' }} tickLine={false} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} domain={['dataMin - 10', 'dataMax + 10']} />
        <ReferenceLine y={100} stroke={chartColors.muted} strokeDasharray="3 3" />
        <Tooltip
          labelFormatter={monthLabel}
          formatter={(v: number) => [`${v}%`, 'NRR']}
          contentStyle={{ background: '#182142', border: '1px solid #334066', borderRadius: 8, fontSize: 12 }}
        />
        <Line type="monotone" dataKey="nrr" stroke={chartColors.positive} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
