import { ReactNode } from 'react';
import { Card, CardBody } from '@heroui/react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  secondary?: ReactNode;
  trend?: 'up' | 'down' | 'flat' | 'none';
  trendIsGood?: boolean;
  zone?: 'green' | 'yellow' | 'red' | 'unknown';
  onPress?: () => void;
}

const zoneDot: Record<NonNullable<KpiCardProps['zone']>, string> = {
  green: 'bg-runway-positive shadow-glow-green',
  yellow: 'bg-runway-amber shadow-glow-amber',
  red: 'bg-runway-negative shadow-glow-red',
  unknown: 'bg-runway-muted',
};

export function KpiCard({ icon: Icon, label, value, secondary, trend, trendIsGood = true, zone, onPress }: KpiCardProps) {
  const trendColor =
    trend === 'flat' || trend === 'none' || !trend
      ? 'text-runway-muted'
      : trend === 'up'
      ? trendIsGood ? 'text-runway-positive' : 'text-runway-negative'
      : trendIsGood ? 'text-runway-negative' : 'text-runway-positive';

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <Card
      isPressable={!!onPress}
      onPress={onPress}
      disableRipple
      className="group relative overflow-hidden rounded-2xl border border-runway-border/70 bg-surface-gradient bg-runway-surface shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-runway-accent/40 hover:shadow-glow"
    >
      {/* Top sheen + hover wash */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-runway-accent/[0.06] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <CardBody className="relative flex flex-col gap-3.5 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center transition-colors duration-300 group-hover:border-runway-accent/40 group-hover:bg-runway-accent/10">
              <Icon size={14} className="text-runway-accent" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-runway-muted">{label}</span>
          </div>
          {zone && <span className={`w-2.5 h-2.5 rounded-full ${zoneDot[zone]} animate-pulse-dot`} />}
        </div>

        <div className="font-condensed text-display-sm font-bold leading-none text-runway-text tabular-nums">{value}</div>

        {secondary && (
          <div className={`inline-flex items-center gap-1.5 text-xs ${trend ? trendColor : 'text-runway-muted'}`}>
            {trend && trend !== 'none' && <TrendIcon size={13} strokeWidth={2.5} />}
            <span className="truncate">{secondary}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
