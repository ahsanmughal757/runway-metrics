import { Injectable } from '@nestjs/common';
import { CohortsRepository, type CohortCell } from './cohorts.repository';

export interface CohortRow {
  cohortLabel: string;
  signupMonth: string;
  size: number;
  // retention[monthOffset] = % of cohort still active (logo) or % of MRR retained (revenue)
  logoRetention: number[];
  revenueRetention: number[];
  // cumulativeRevenue[monthOffset] = running total $ earned from this cohort through month offset t
  cumulativeRevenue: number[];
}

/**
 * Turns the per-cell rows the repository returns into a dense grid.
 *
 * The gaps are the interesting part. A cohort that signed up last month has one
 * column; one from a year ago has twelve. A cell missing for a later offset
 * means every customer in that cohort had already churned, so revenue and logo
 * count are genuinely zero and must be rendered as zero rather than skipped -
 * otherwise the grid appears to end early and reads as "we have no data" when
 * the truth is "we have no customers left".
 */
@Injectable()
export class CohortsService {
  constructor(private repo: CohortsRepository) {}

  async getRetentionTable(companyId: string): Promise<CohortRow[]> {
    const { cells, sizes } = await this.repo.aggregateRetention(companyId);
    if (sizes.length === 0) return [];

    const byMonth = new Map<string, CohortCell[]>();
    for (const cell of cells) {
      const key = cell.signupMonth.toISOString().slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(cell);
    }

    const rows: CohortRow[] = [];
    for (const { signupMonth, size } of sizes) {
      const key = signupMonth.toISOString().slice(0, 7);
      const group = (byMonth.get(key) ?? []).sort((a, b) => a.offset - b.offset);
      if (size === 0) continue;

      const maxOffset = group.reduce((max, c) => Math.max(max, c.offset), -1);
      const startingRevenue = group.find((c) => c.offset === 0)?.revenue ?? 0;

      const logoRetention: number[] = [];
      const revenueRetention: number[] = [];
      const cumulativeRevenue: number[] = [];
      let runningRevenue = 0;

      for (let t = 0; t <= maxOffset; t++) {
        const cell = group.find((c) => c.offset === t);
        const activeAtT = cell?.activeCustomers ?? 0;
        const revenueAtT = cell?.revenue ?? 0;

        logoRetention.push(pct(activeAtT, size));
        revenueRetention.push(pct(revenueAtT, startingRevenue));
        runningRevenue += revenueAtT;
        cumulativeRevenue.push(round2(runningRevenue));
      }

      rows.push({ cohortLabel: key, signupMonth: key, size, logoRetention, revenueRetention, cumulativeRevenue });
    }

    return rows;
  }
}

const pct = (part: number, whole: number): number => (whole > 0 ? round2((part / whole) * 100) : 0);
const round2 = (n: number): number => Math.round(n * 100) / 100;
