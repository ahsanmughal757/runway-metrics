import { ReactNode } from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
import { LucideIcon } from 'lucide-react';

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

const zoneColor: Record<NonNullable<KpiCardProps['zone']>, 'success' | 'warning' | 'danger' | 'default'> = {
  green: 'success', yellow: 'warning', red: 'danger', unknown: 'default',
};

export function KpiCard({ icon: Icon, label, value, secondary, trend, trendIsGood = true, zone, onPress }: KpiCardProps) {
  const trendColor =
    trend === 'flat' || trend === 'none' || !trend
      ? 'text-runway-muted'
      : trend === 'up'
      ? trendIsGood ? 'text-runway-positive' : 'text-runway-negative'
      : trendIsGood ? 'text-runway-negative' : 'text-runway-positive';

  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '';

  return (
    <Card
      isPressable={!!onPress}
      onPress={onPress}
      className="bg-runway-surface border border-runway-border hover:border-runway-borderStrong transition-colors"
    >
      <CardBody className="gap-2 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon size={13} className="text-runway-muted" />
            <span className="text-micro uppercase text-runway-muted">{label}</span>
          </div>
          {zone && <Chip size="sm" variant="dot" color={zoneColor[zone]} className="border-none" />}
        </div>
        <div className="font-condensed text-display-sm font-bold text-runway-text tabular-nums">{value}</div>
        {secondary && (
          <div className={`text-xs flex items-center gap-1 ${trend ? trendColor : 'text-runway-muted'}`}>
            {arrow && <span>{arrow}</span>}
            <span>{secondary}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
