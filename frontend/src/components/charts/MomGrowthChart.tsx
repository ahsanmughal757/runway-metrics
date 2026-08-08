import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Snapshot } from '../../lib/types';
import { axisTickStyle, chartColors, monthLabel } from './chartTheme';

export function MomGrowthChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, growth: s.derived.momGrowthRate ?? 0 }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={{ stroke: '#334066' }} tickLine={false} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={40} />
        <Tooltip
          labelFormatter={monthLabel}
          formatter={(v: number) => [`${v}%`, 'MoM growth']}
          contentStyle={{ background: '#182142', border: '1px solid #334066', borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="growth" radius={[4, 4, 4, 4]} barSize={10}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.growth >= 0 ? chartColors.positive : chartColors.negative} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
