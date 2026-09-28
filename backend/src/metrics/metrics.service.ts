import { BadRequestException, Injectable } from '@nestjs/common';
import * as Papa from 'papaparse';
import { MetricsRepository, SnapshotInput } from './metrics.repository';
import { CompaniesRepository } from '../companies/companies.repository';
import { AuditService } from '../audit/audit.service';

export interface DerivedMetrics {
  runwayMonths: number | null;
  runwayZone: 'green' | 'yellow' | 'red' | 'unknown';
  nrr: number | null;
  momGrowthRate: number | null;
  revenueChurnPct: number | null;
  logoChurnPct: number | null;
  threeMoAvgBurn: number | null;
  /** Net burn multiple: (annualized net-new MRR) / net burn. >1 means growth outpaces burn. */
  burnMultiple: number | null;
  /** Rule of 40 score: annualized MoM growth rate + profit margin %. >=40 = healthy SaaS. */
  ruleOf40: number | null;
  /** Quick ratio: (new + expansion MRR) / (churned + contraction MRR). >=4 = healthy SaaS. */
  quickRatio: number | null;
}

const REQUIRED_CSV_COLUMNS = [
  'month',
  'mrr',
  'newMrr',
  'expansionMrr',
  'contractionMrr',
  'churnedMrr',
  'newCustomers',
  'churnedCustomers',
  'totalCustomers',
  'burnRate',
  'cash',
];

@Injectable()
export class MetricsService {
  constructor(
    private repo: MetricsRepository,
    private companies: CompaniesRepository,
    private audit: AuditService,
  ) {}

  async getDashboard(companyId: string) {
    const [snapshots, settings] = await Promise.all([this.repo.findByCompany(companyId), this.companies.getSettings(companyId)]);
    const withDerived = snapshots.map((s, idx) => ({
      ...s,
      derived: this.deriveForIndex(snapshots, idx, settings.runwayGreenMonths, settings.runwayYellowMonths),
    }));
    const latest = withDerived[withDerived.length - 1] ?? null;
    return { snapshots: withDerived, latest };
  }

  /**
   * Saves a month and records the change, in one transaction.
   *
   * Previously the snapshot was written, then the audit entry was written by a
   * separate call that swallowed its own errors. A failure in between left the
   * company's numbers changed with no record of who changed them. Sharing a
   * transaction removes the window: there is no state in which one exists
   * without the other.
   */
  async upsertSnapshot(input: SnapshotInput & { actorId: string }) {
    const { actorId, ...rest } = input;
    const monthKey = input.month.toISOString().slice(0, 10);
    return this.repo.transaction(async (tx) => {
      const saved = await this.repo.upsert(rest, tx);
      await this.audit.recordIn(tx, {
        companyId: rest.companyId,
        entityId: `${rest.companyId}:${monthKey}`,
        entityType: 'METRIC_SNAPSHOT',
        action: 'UPDATED',
        actorId,
        diff: { month: monthKey, mrr: rest.mrr, cash: rest.cash },
      });
      return saved;
    });
  }

  async deleteSnapshot(companyId: string, month: Date, actorId: string) {
    const monthKey = month.toISOString().slice(0, 10);
    return this.repo.transaction(async (tx) => {
      const deleted = await this.repo.delete(companyId, month, tx);
      // A delete that matched nothing is not a change, so it gets no entry.
      if (deleted) {
        await this.audit.recordIn(tx, {
          companyId,
          entityId: `${companyId}:${monthKey}`,
          entityType: 'METRIC_SNAPSHOT',
          action: 'DELETED',
          actorId,
          diff: { month: monthKey },
        });
      }
      return deleted;
    });
  }
  /** Computes runway, NRR, MoM growth, and churn splits for one point in the series using trailing context. */
  private deriveForIndex(all: SnapshotInput[], idx: number, greenMonths: number, yellowMonths: number): DerivedMetrics {
    const current = all[idx];
    const prior = all[idx - 1];

    // 3-month rolling average burn (PRD: "not single month" to avoid noisy runway swings)
    const window = all.slice(Math.max(0, idx - 2), idx + 1);
    const avgBurn = window.reduce((sum, s) => sum + s.burnRate, 0) / window.length;
    const threeMoAvgBurn = Math.round(avgBurn * 100) / 100;

    // An exhausted company has zero cash and therefore zero burn. Reading that
    // as `null` would surface as "runway unknown", which is the most benign
    // possible reading of the worst possible state. Insolvency is zero months.
    const insolvent = current.cash <= 0;
    const runwayMonths = insolvent ? 0 : avgBurn > 0 ? Math.round((current.cash / avgBurn) * 10) / 10 : null;
    const runwayZone = insolvent
      ? 'red'
      : runwayMonths === null
        ? 'unknown'
        : runwayMonths >= greenMonths
          ? 'green'
          : runwayMonths >= yellowMonths
            ? 'yellow'
            : 'red';

    const startingMrr = prior
      ? prior.mrr
      : current.mrr - current.newMrr - current.expansionMrr + current.contractionMrr + current.churnedMrr;
    const nrr =
      startingMrr > 0
        ? Math.round(((startingMrr + current.expansionMrr - current.contractionMrr - current.churnedMrr) / startingMrr) * 1000) / 10
        : null;

    const momGrowthRate = prior && prior.mrr > 0 ? Math.round(((current.mrr - prior.mrr) / prior.mrr) * 1000) / 10 : null;

    const revenueChurnPct = startingMrr > 0 ? Math.round((current.churnedMrr / startingMrr) * 1000) / 10 : null;
    const priorTotal = prior ? prior.totalCustomers : current.totalCustomers - current.newCustomers + current.churnedCustomers;
    const logoChurnPct = priorTotal > 0 ? Math.round((current.churnedCustomers / priorTotal) * 1000) / 10 : null;

    // Burn multiple: how much each net-dollar burned buys in annualized net-new MRR.
    // Positive = revenue engine outpacing spend, >3 is strong for seed-stage.
    const netNewMrrAnnualized = (current.mrr - (prior?.mrr ?? 0)) * 12;
    const burnMultiple = netNewMrrAnnualized > 0 && avgBurn > 0 ? Math.round((netNewMrrAnnualized / avgBurn) * 100) / 100 : null;

    // Rule of 40: annualized growth + profit margin. >40 = growth efficiency benchmark.
    const annualizedGrowth = momGrowthRate !== null ? momGrowthRate * 12 : null;
    const profitMarginPct = current.mrr > 0 ? ((current.mrr - current.burnRate) / current.mrr) * 100 : null;
    const ruleOf40 =
      annualizedGrowth !== null && profitMarginPct !== null ? Math.round((annualizedGrowth + profitMarginPct) * 100) / 100 : null;

    // Quick ratio: revenue gained vs revenue lost. >4 = healthy SaaS benchmark.
    const gained = current.newMrr + current.expansionMrr;
    const lost = current.churnedMrr + current.contractionMrr;
    const quickRatio = lost > 0 ? Math.round((gained / lost) * 100) / 100 : null;

    return {
      runwayMonths,
      runwayZone,
      nrr,
      momGrowthRate,
      revenueChurnPct,
      logoChurnPct,
      threeMoAvgBurn,
      burnMultiple,
      ruleOf40,
      quickRatio,
    };
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
          month: parseMonth(raw.month),
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

  /**
   * Parse-then-commit for a CSV upload, refusing to write anything if the file
   * has a single validation error. A partially-applied import is worse than no
   * import: the founder cannot tell which months landed.
   */
  async importAndCommit(companyId: string, csv: string, actorId: string) {
    const { rows, errors } = this.parseCsvPreview(companyId, csv);
    if (errors.length > 0) return { committed: 0, errors };
    const committed = await this.commitCsv(companyId, rows, actorId);
    return { committed, errors: [] as string[] };
  }

  async commitCsv(companyId: string, rows: SnapshotInput[], actorId: string) {
    return this.repo.transaction(async (tx) => {
      const committed = await this.repo.importCsvRows(tx, companyId, rows);
      await this.audit.recordIn(tx, {
        companyId,
        entityId: `import:${new Date().toISOString()}`,
        entityType: 'METRIC_SNAPSHOT',
        action: 'IMPORTED',
        actorId,
        diff: {
          rowCount: committed,
          firstMonth: rows[0]?.month.toISOString().slice(0, 7) ?? null,
          lastMonth: rows.at(-1)?.month.toISOString().slice(0, 7) ?? null,
        },
      });
      return committed;
    });
  }
}

/**
 * Both of these report a bad cell in the uploaded file.
 *
 * They throw BadRequest rather than a plain Error so a malformed CSV is a 400
 * rather than a 500. The message deliberately includes the offending value: the
 * user is looking at a spreadsheet, so telling them *which* cell is wrong is
 * the difference between a fixable report and a support ticket.
 */
function num(v: string | undefined): number {
  if (v === undefined || v === '' || Number.isNaN(Number(v))) {
    throw new BadRequestException(`"${v ?? ''}" is not a number. Check the column it is in.`);
  }
  return Number(v);
}

/**
 * `new Date('nonsense')` does not throw -- it returns an Invalid Date, which
 * then surfaces as an opaque Prisma error at write time (or, in demo mode,
 * silently "succeeds"). Validating here means a typo in a column that the
 * founder cannot see is reported against a specific row instead.
 */
function parseMonth(v: string | undefined): Date {
  const d = new Date(v ?? '');
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`"${v ?? ''}" is not a date. Use YYYY-MM-DD, e.g. 2026-01-31.`);
  }
  return d;
}
