import { useMemo, useState } from 'react';
import { Slider, Chip } from '@heroui/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { Snapshot } from '../lib/types';
import { axisTickStyle, ChartTooltip, chartColors, gridStyle } from './charts/chartTheme';

interface ProjectionPoint {
  month: number;
  cash: number;
}

/**
 * Client-side runway projection. Mirrors the backend's deriveForIndex burn
 * math: net burn = burnRate (with burn adjustment) less ~15% of the revenue
 * delta implied by the growth adjustment (same ratio the fake-data generator
 * uses). Purely illustrative for scenario exploration.
 */
function projectCashToZero(cash: number, adjustedNetBurn: number, maxMonths = 60): ProjectionPoint[] {
  const points: ProjectionPoint[] = [];
  let c = cash;
  for (let m = 0; m <= maxMonths; m++) {
    points.push({ month: m, cash: Math.max(0, c) });
    c -= adjustedNetBurn;
    if (c <= 0) break;
  }
  return points;
}

function runwayMonthsOf(points: ProjectionPoint[]): number {
  const zeroAt = points.findIndex((p) => p.cash <= 0);
  return zeroAt >= 0 ? zeroAt : points.length;
}

export function RunwayScenarioSlider({ snapshot, greenMonths = 12 }: { snapshot: Snapshot; greenMonths?: number }) {
  const [growthAdj, setGrowthAdj] = useState(0); // -0.2..+0.2
  const [burnAdj, setBurnAdj] = useState(0); // -0.2..+0.2

  const { baseline, scenario, scenarioRunway, baselineRunway } = useMemo(() => {
    const baselineNetBurn = snapshot.burnRate;
    const adjustedNetBurn = Math.max(0, snapshot.burnRate * (1 + burnAdj) - snapshot.mrr * growthAdj * 0.15);

    const baselinePoints = projectCashToZero(snapshot.cash, baselineNetBurn);
    const scenarioPoints = projectCashToZero(snapshot.cash, adjustedNetBurn);
    return {
      baseline: baselinePoints,
      scenario: scenarioPoints,
      baselineRunway: runwayMonthsOf(baselinePoints),
      scenarioRunway: runwayMonthsOf(scenarioPoints),
    };
  }, [snapshot, growthAdj, burnAdj]);

  const combined = useMemo(() => {
    const maxLen = Math.max(baseline.length, scenario.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      month: i,
      baseline: baseline[i]?.cash ?? 0,
      scenario: scenario[i]?.cash ?? 0,
    }));
  }, [baseline, scenario]);

  const zone = scenarioRunway >= greenMonths ? 'green' : scenarioRunway >= 6 ? 'yellow' : 'red';

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-runway-muted">Growth adjustment (MRR)</span>
            <span className="text-xs font-semibold text-runway-text tabular-nums">
              {growthAdj >= 0 ? '+' : ''}{(growthAdj * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            aria-label="Growth adjustment"
            size="sm"
            minValue={-20}
            maxValue={20}
            step={5}
            defaultValue={0}
            value={Math.round(growthAdj * 100)}
            onChange={(v) => setGrowthAdj(Number(v) / 100)}
            classNames={{
              track: 'bg-runway-border/60',
              filler: 'bg-accent-gradient',
              thumb: 'bg-white shadow-glow border border-runway-accent/50',
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-runway-muted">Burn adjustment</span>
            <span className="text-xs font-semibold text-runway-text tabular-nums">
              {burnAdj >= 0 ? '+' : ''}{(burnAdj * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            aria-label="Burn adjustment"
            size="sm"
            minValue={-20}
            maxValue={20}
            step={5}
            defaultValue={0}
            value={Math.round(burnAdj * 100)}
            onChange={(v) => setBurnAdj(Number(v) / 100)}
            classNames={{
              track: 'bg-runway-border/60',
              filler: 'bg-accent-gradient',
              thumb: 'bg-white shadow-glow border border-runway-accent/50',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-runway-border/70 bg-white/[0.02] p-3">
          <p className="text-[11px] uppercase tracking-wider text-runway-muted">Current runway</p>
          <p className="text-lg font-semibold text-runway-text tabular-nums">{baselineRunway} mo</p>
        </div>
        <div className="rounded-xl border border-runway-border/70 bg-white/[0.02] p-3">
          <p className="text-[11px] uppercase tracking-wider text-runway-muted">Scenario runway</p>
          <p className="text-lg font-semibold text-runway-text tabular-nums">{scenarioRunway} mo</p>
        </div>
        <div className="rounded-xl border border-runway-border/70 bg-white/[0.02] p-3 flex flex-col justify-center">
          <p className="text-[11px] uppercase tracking-wider text-runway-muted">Scenario zone</p>
          <Chip
            size="sm"
            variant="flat"
            color={zone === 'green' ? 'success' : zone === 'yellow' ? 'warning' : 'danger'}
            className="mt-1 w-fit"
          >
            {zone === 'green' ? 'Healthy' : zone === 'yellow' ? 'Caution' : 'Critical'}
          </Chip>
        </div>
      </div>

      <div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={combined} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis
              dataKey="month"
              tick={axisTickStyle}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              label={{ value: 'months out', position: 'insideBottomRight', fill: chartColors.muted, fontSize: 10 }}
            />
            <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={52} />
            <Tooltip content={<ChartTooltip formatter={(v) => `$${Number(v).toLocaleString()}`} labelFormatter={(l) => `Month ${l}`} />} cursor={{ stroke: chartColors.axis, strokeDasharray: '3 6' }} />
            <ReferenceLine y={0} stroke={chartColors.negative} strokeOpacity={0.5} />
            <Line type="monotone" dataKey="baseline" name="Current" stroke={chartColors.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} />
            <Line type="monotone" dataKey="scenario" name="Scenario" stroke={chartColors.accent} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#ffffff', stroke: chartColors.accent, strokeWidth: 2.5 }} />
          </LineChart>
        </ResponsiveContainer>
        <p className="px-2 pt-1 text-[11px] text-runway-muted">
          Illustrative projection only — assumes constant net burn and no additional cash inflow.
        </p>
      </div>
    </div>
  );
}
