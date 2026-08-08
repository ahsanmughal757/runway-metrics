/**
 * Illustrative percentile bands for a seed-stage SaaS benchmark overlay.
 * These are invented, plausible values for the demo — NOT sourced from live
 * market data. The UI must render the accompanying disclaimer verbatim.
 */
export interface BenchmarkBand {
  label: string;
  values: [number, number, number, number, number]; // p10, p25, p50, p75, p90
}

export interface BenchmarkSet {
  churnPct: BenchmarkBand;
  nrrPct: BenchmarkBand;
  burnMultiple: BenchmarkBand;
  disclosure: string;
}

export const BENCHMARKS: BenchmarkSet = {
  churnPct: {
    label: 'Revenue churn (%)',
    values: [0.6, 1.1, 2.0, 3.4, 5.5],
  },
  nrrPct: {
    label: 'Net revenue retention (%)',
    values: [95, 103, 110, 118, 128],
  },
  burnMultiple: {
    label: 'Burn multiple',
    values: [0.4, 0.8, 1.3, 2.2, 3.5],
  },
  disclosure: 'Illustrative benchmark bands, not sourced from live market data',
};

/**
 * Maps a value onto 0-100 percentile position within a band.
 * Values at/below p10 -> 0, at/above p90 -> 100, linear between.
 */
export function percentileFor(values: BenchmarkBand['values'], value: number): number {
  const [p10, p25, p50, p75, p90] = values;
  if (value <= p10) return 0;
  if (value >= p90) return 100;
  const points: [number, number][] = [
    [p10, 10],
    [p25, 25],
    [p50, 50],
    [p75, 75],
    [p90, 90],
  ];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0 || 1);
      return Math.round(y0 + t * (y1 - y0));
    }
  }
  return 90;
}
