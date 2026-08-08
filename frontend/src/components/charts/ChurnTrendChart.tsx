import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceDot } from 'recharts';
import { Snapshot } from '../../lib/types';
import { axisTickStyle, chartColors, monthLabel, tooltipStyle } from './chartTheme';

/** Flags months where revenue churn spikes >1.5x the trailing 3-month average — usually a pricing-change or incident month worth annotating rather than leaving unexplained. */
function detectSpikes(data: { month: string; revenueChurn: number | null }[]) {
  return data
    .map((d, i) => {
      const window = data.slice(Math.max(0, i - 3), i).map((w) => w.revenueChurn ?? 0);
      const avg = window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : 0;
      const isSpike = avg > 0 && (d.revenueChurn ?? 0) > avg * 1.5;
      return isSpike ? d : null;
    })
    .filter((d): d is { month: string; revenueChurn: number | null } => d !== null);
}

export function ChurnTrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({
    month: s.month,
    revenueChurn: s.derived.revenueChurnPct,
    logoChurn: s.derived.logoChurnPct,
  }));
  const spikes = detectSpikes(data);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisTickStyle} axisLine={{ stroke: '#334066' }} tickLine={false} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={40} />
        <Tooltip labelFormatter={monthLabel} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, color: chartColors.muted }} />
        <Line type="monotone" dataKey="revenueChurn" name="Revenue churn" stroke={chartColors.negative} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="logoChurn" name="Logo churn" stroke={chartColors.muted} strokeWidth={2} dot={false} strokeDasharray="4 3" />
        {spikes.map((s) => (
          <ReferenceDot
            key={s.month}
            x={s.month}
            y={s.revenueChurn ?? 0}
            r={4}
            fill={chartColors.amber}
            stroke="none"
            label={{ value: 'spike', position: 'top', fill: chartColors.amber, fontSize: 10 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
