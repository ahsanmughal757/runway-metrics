import type { CSSProperties } from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-md bg-gradient-to-r from-runway-raised via-runway-border/60 to-runway-raised bg-[length:200%_100%] animate-shimmer ${className}`}
      style={style}
    />
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-2xl border border-runway-border/70 bg-runway-surface shadow-soft p-5 flex flex-col gap-3.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function ChartCardSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="rounded-2xl border border-runway-border/70 bg-runway-surface shadow-soft p-5 flex flex-col gap-4">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
