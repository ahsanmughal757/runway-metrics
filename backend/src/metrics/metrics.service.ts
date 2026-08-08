import { Injectable } from '@nestjs/common';
import * as Papa from 'papaparse';
import { MetricsRepository, SnapshotInput } from './metrics.repository';
import { CompaniesRepository } from '../companies/companies.repository';

export interface DerivedMetrics {
  runwayMonths: number | null;
  runwayZone: 'green' | 'yellow' | 'red' | 'unknown';
  nrr: number | null;
  momGrowthRate: number | null;
  revenueChurnPct: number | null;
  logoChurnPct: number | null;
  threeMoAvgBurn: number | null;
}

const REQUIRED_CSV_COLUMNS = [
  'month', 'mrr', 'newMrr', 'expansionMrr', 'contractionMrr', 'churnedMrr',
  'newCustomers', 'churnedCustomers', 'totalCustomers', 'burnRate', 'cash',
];

@Injectable()
export class MetricsService {
  constructor(private repo: MetricsRepository, private companies: CompaniesRepository) {}

  async getDashboard(companyId: string) {
    const [snapshots, settings] = await Promise.all([
      this.repo.findByCompany(companyId),
      this.companies.getSettings(companyId),
    ]);
    const withDerived = snapshots.map((s, idx) => ({
      ...s,
      derived: this.deriveForIndex(snapshots, idx, settings.runwayGreenMonths, settings.runwayYellowMonths),
    }));
    const latest = withDerived[withDerived.length - 1] ?? null;
    return { snapshots: withDerived, latest };
  }

  upsertSnapshot(input: SnapshotInput) {
    return this.repo.upsert(input);
  }

  /** Computes runway, NRR, MoM growth, and churn splits for one point in the series using trailing context. */
  private deriveForIndex(all: SnapshotInput[], idx: number, greenMonths: number, yellowMonths: number): DerivedMetrics {
    const current = all[idx];
    const prior = all[idx - 1];

    // 3-month rolling average burn (PRD: "not single month" to avoid noisy runway swings)
    const window = all.slice(Math.max(0, idx - 2), idx + 1);
    const avgBurn = window.reduce((sum, s) => sum + s.burnRate, 0) / window.length;
    const threeMoAvgBurn = Math.round(avgBurn * 100) / 100;

    const runwayMonths = avgBurn > 0 ? Math.round((current.cash / avgBurn) * 10) / 10 : null;
    const runwayZone =
      runwayMonths === null ? 'unknown' : runwayMonths >= greenMonths ? 'green' : runwayMonths >= yellowMonths ? 'yellow' : 'red';

    const startingMrr = prior ? prior.mrr : current.mrr - current.newMrr - current.expansionMrr + current.contractionMrr + current.churnedMrr;
    const nrr =
      startingMrr > 0
        ? Math.round(((startingMrr + current.expansionMrr - current.contractionMrr - current.churnedMrr) / startingMrr) * 1000) / 10
        : null;

    const momGrowthRate = prior && prior.mrr > 0 ? Math.round(((current.mrr - prior.mrr) / prior.mrr) * 1000) / 10 : null;

    const revenueChurnPct = startingMrr > 0 ? Math.round((current.churnedMrr / startingMrr) * 1000) / 10 : null;
    const priorTotal = prior ? prior.totalCustomers : current.totalCustomers - current.newCustomers + current.churnedCustomers;
    const logoChurnPct = priorTotal > 0 ? Math.round((current.churnedCustomers / priorTotal) * 1000) / 10 : null;

    return { runwayMonths, runwayZone, nrr, momGrowthRate, revenueChurnPct, logoChurnPct, threeMoAvgBurn };
  }

  /** Parses + validates a CSV upload, returning a preview (parsed rows + errors) without committing. */
  parseCsvPreview(companyId: string, csvText: string) {
    const parsed = Papa.parse(csvText.trim(), { header: true, skipEmptyLines: true });
    const errors: string[] = [];

    if (parsed.errors.length > 0) {
      errors.push(...parsed.errors.map((e) => `Row ${e.row}: ${e.message}`));
    }

    const header = parsed.meta.fields ?? [];
    const missing = REQUIRED_CSV_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length > 0) {
      errors.push(`Missing required columns: ${missing.join(', ')}`);
    }

    const rows: SnapshotInput[] = [];
    for (const [i, raw] of (parsed.data as Record<string, string>[]).entries()) {
      try {
        rows.push({
          companyId,
          month: new Date(raw.month),
          mrr: num(raw.mrr),
          newMrr: num(raw.newMrr),
          expansionMrr: num(raw.expansionMrr),
          contractionMrr: num(raw.contractionMrr),
          churnedMrr: num(raw.churnedMrr),
          newCustomers: Math.round(num(raw.newCustomers)),
          churnedCustomers: Math.round(num(raw.churnedCustomers)),
          totalCustomers: Math.round(num(raw.totalCustomers)),
          burnRate: num(raw.burnRate),
          cash: num(raw.cash),
          notes: raw.notes,
        });
      } catch (e) {
        errors.push(`Row ${i + 2}: ${(e as Error).message}`);
      }
    }

    return { rows, errors, rowCount: rows.length };
  }

  async commitCsv(companyId: string, rows: SnapshotInput[]) {
    return this.repo.importCsvRows(companyId, rows);
  }
}

function num(v: string | undefined): number {
  if (v === undefined || v === '' || Number.isNaN(Number(v))) throw new Error(`invalid numeric value "${v}"`);
  return Number(v);
}
