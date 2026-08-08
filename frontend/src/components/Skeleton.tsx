import type { CSSProperties } from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-md bg-runway-charcoal ${className}`} style={style} />;
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-runway-border bg-runway-surface p-4 flex flex-col gap-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export function ChartCardSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-runway-border bg-runway-surface p-4 flex flex-col gap-3">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
