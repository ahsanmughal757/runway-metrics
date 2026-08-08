import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceDot } from 'recharts';
import { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

export function MrrTrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, mrr: s.mrr, note: s.notes ?? null }));
  const last = data[data.length - 1]?.mrr ?? 0;
  const noted = data.filter((d) => d.note);

  function NoteAwareTooltip(props: {
    active?: boolean;
    payload?: { dataKey?: string | number; name?: string; color?: string; value?: number }[];
    label?: string;
  }) {
    const point = data.find((d) => d.month === props.label);
    return (
      <ChartTooltip
        active={props.active}
        payload={props.payload}
        label={props.label}
        formatter={(v) => `$${v.toLocaleString()}`}
        note={props.active ? point?.note ?? undefined : undefined}
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.4} />
            <stop offset="55%" stopColor={chartColors.accent2} stopOpacity={0.16} />
            <stop offset="100%" stopColor={chartColors.accent2} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
        <YAxis
          tick={axisTickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          width={52}
          domain={['dataMin * 0.92', 'dataMax * 1.04']}
        />
        <Tooltip content={<NoteAwareTooltip />} cursor={{ stroke: chartColors.axis, strokeDasharray: '3 6' }} />
        {/* Glow pass under the main line */}
        <Area type="monotone" dataKey="mrr" stroke={chartColors.accent} strokeWidth={7} strokeOpacity={0.18} fill="none" dot={false} activeDot={false} isAnimationActive={false} />
        <Area
          type="monotone"
          dataKey="mrr"
          stroke={chartColors.accent}
          strokeWidth={2.5}
          fill="url(#mrrGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.accent, strokeWidth: 2.5 }}
        />
        <ReferenceDot x={data[data.length - 1]?.month} y={last} r={4} fill="#ffffff" stroke={chartColors.accent} strokeWidth={2.5} />
        <ReferenceLine
          y={last}
          stroke={chartColors.accent}
          strokeOpacity={0.35}
          strokeDasharray="2 4"
          label={{ value: `$${(last / 1000).toFixed(0)}k`, position: 'insideTopRight', fill: chartColors.accent, fontSize: 11, fontWeight: 600 }}
        />
        {noted.map((d) => (
          <ReferenceDot
            key={d.month}
            x={d.month}
            y={d.mrr}
            r={4}
            fill={chartColors.amber}
            stroke="#0a0c12"
            strokeWidth={1.5}
            label={{ value: 'note', position: 'bottom', fill: chartColors.amber, fontSize: 9, fontWeight: 600 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
