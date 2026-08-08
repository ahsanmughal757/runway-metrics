export const chartColors = {
  positive: '#34d399',
  negative: '#fb7185',
  accent: '#6f7cff',
  accent2: '#a78bfa',
  amber: '#f6b93b',
  muted: '#8892a8',
  axis: '#2b3449',
  grid: '#1b2233',
};

export const axisTickStyle = { fill: chartColors.muted, fontSize: 11 };

export function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/** Subtle dashed horizontal grid — no hard axis lines. */
export const gridStyle = { stroke: chartColors.grid, strokeDasharray: '3 6', vertical: false };

export const axisLineStyle = { stroke: chartColors.grid };

export interface TooltipEntry {
  name?: string;
  color?: string;
  stroke?: string;
  value?: number | string;
  dataKey?: string | number;
}

/** Shared glass tooltip used by every chart. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  note,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
  note?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const renderedLabel = labelFormatter
    ? labelFormatter(label as string)
    : typeof label === 'number'
      ? label
      : monthLabel(label as string);
  return (
    <div
      className="min-w-[10rem] rounded-xl border border-runway-borderStrong/80 bg-runway-raised/95 px-3.5 py-2.5 backdrop-blur-xl"
      style={{ boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)' }}
    >
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-runway-muted">
        {renderedLabel}
      </p>
      {payload.map((p, i) => (
        <div key={`${String(p.dataKey)}-${i}`} className="flex items-center justify-between gap-5 py-0.5">
          <span className="flex items-center gap-1.5 text-xs text-runway-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke }} />
            {p.name}
          </span>
          <span className="text-xs font-semibold tabular-nums text-runway-text">
            {formatter ? formatter(Number(p.value)) : String(p.value)}
          </span>
        </div>
      ))}
      {note && (
        <>
          <div className="my-1.5 h-px bg-runway-border/60" />
          <p className="text-xs text-runway-amber leading-relaxed">{note}</p>
        </>
      )}
    </div>
  );
}
