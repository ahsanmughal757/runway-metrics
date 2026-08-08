import { Injectable } from '@nestjs/common';
import { CohortsRepository } from './cohorts.repository';

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

@Injectable()
export class CohortsService {
  constructor(private repo: CohortsRepository) {}

  async getRetentionTable(companyId: string): Promise<CohortRow[]> {
    const entries = await this.repo.findByCompany(companyId);

    const byMonth = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = e.signupMonth.toISOString().slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(e);
    }

    const rows: CohortRow[] = [];
    for (const [key, group] of Array.from(byMonth.entries()).sort()) {
      const size = group.length;
      const maxOffset = Math.max(...group.map((g) => Object.keys(g.mrrByMonth).length));
      const startingRevenue = group.reduce((sum, g) => sum + (g.mrrByMonth['0'] ?? 0), 0);

      const logoRetention: number[] = [];
      const revenueRetention: number[] = [];
      const cumulativeRevenue: number[] = [];
      let runningRevenue = 0;

      for (let t = 0; t < maxOffset; t++) {
        const activeAtT = group.filter((g) => (g.mrrByMonth[String(t)] ?? 0) > 0).length;
        const revenueAtT = group.reduce((sum, g) => sum + (g.mrrByMonth[String(t)] ?? 0), 0);
        logoRetention.push(size > 0 ? Math.round((activeAtT / size) * 1000) / 10 : 0);
        revenueRetention.push(startingRevenue > 0 ? Math.round((revenueAtT / startingRevenue) * 1000) / 10 : 0);
        runningRevenue += revenueAtT;
        cumulativeRevenue.push(Math.round(runningRevenue * 100) / 100);
      }

      rows.push({ cohortLabel: key, signupMonth: key, size, logoRetention, revenueRetention, cumulativeRevenue });
    }

    return rows;
  }
}
