import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid } from 'recharts';
import type { Snapshot } from '../../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle, monthLabel } from './chartTheme';

// The metric investors scan for first: >100% = expansion outpacing churn.
export function NrrChart({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({ month: s.month, nrr: s.derived.nrr ?? 0 }));
  const last = data[data.length - 1]?.nrr ?? 0;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nrrGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.positive} stopOpacity={0.38} />
            <stop offset="100%" stopColor={chartColors.positive} stopOpacity={0.03} />
          </linearGradient>
        </defs>
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
        <YAxis
          tick={axisTickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={44}
          domain={['dataMin - 8', 'dataMax + 8']}
        />
        {/* 100% = neutral expansion/churn */}
        <ReferenceLine
          y={100}
          stroke={chartColors.grid}
          strokeDasharray="4 4"
          strokeOpacity={0.9}
          label={{ value: '100% · break-even', position: 'insideBottomRight', fill: chartColors.muted, fontSize: 10 }}
        />
        <Tooltip
          content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />}
          cursor={{ stroke: chartColors.axis, strokeDasharray: '3 6' }}
        />
        <Area
          type="monotone"
          dataKey="nrr"
          stroke={chartColors.positive}
          strokeWidth={2.5}
          fill="url(#nrrGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.positive, strokeWidth: 2.5 }}
        />
        <ReferenceDot x={data[data.length - 1]?.month} y={last} r={4} fill="#ffffff" stroke={chartColors.positive} strokeWidth={2.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
