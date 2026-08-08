import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { CohortRow } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle } from './chartTheme';

const PALETTE = [chartColors.accent, chartColors.accent2, chartColors.positive, chartColors.amber, '#38bdf8', '#e879f9'];

/**
 * Cumulative revenue earned per cohort over months-since-signup. Plots the 6
 * most recent cohorts so the chart stays legible as history accumulates.
 */
export function CohortLtvChart({ rows }: { rows: CohortRow[] }) {
  const recent = rows.slice(-6);
  const maxOffset = Math.max(0, ...recent.map((r) => r.cumulativeRevenue.length));

  const data = Array.from({ length: maxOffset }, (_, t) => {
    const point: Record<string, number | string> = { offset: `M${t}` };
    recent.forEach((r) => {
      point[r.cohortLabel] = r.cumulativeRevenue[t] ?? null;
    });
    return point;
  });

  if (recent.length === 0 || data.length === 0) {
    return <p className="px-5 pb-5 text-sm text-runway-muted">No cohort revenue data available.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridStyle} />
        <XAxis dataKey="offset" tick={axisTickStyle} axisLine={false} tickLine={false} tickMargin={8} />
        <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={52} />
        <Tooltip content={<ChartTooltip formatter={(v) => `$${v.toLocaleString()}`} labelFormatter={(l) => `Month ${l}`} />} cursor={{ stroke: chartColors.axis, strokeDasharray: '3 6' }} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: chartColors.muted }}
          iconType="plainline"
        />
        {recent.map((r, i) => (
          <Line
            key={r.cohortLabel}
            type="monotone"
            dataKey={r.cohortLabel}
            name={r.cohortLabel}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2.2}
            connectNulls
            dot={false}
            activeDot={{ r: 3.5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
