import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { generateSnapshots } from '../fake-data/generator';
import { PersonaKey } from '../fake-data/personas';
import type { AuditTx } from '../audit/audit.service';

/** The exact row shape Prisma returns, so the mapper needs no `any`. */
type MetricSnapshotRow = Prisma.MetricSnapshotGetPayload<Record<string, never>>;

export interface SnapshotInput {
  companyId: string;
  month: Date;
  mrr: number;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnedMrr: number;
  newCustomers: number;
  churnedCustomers: number;
  totalCustomers: number;
  burnRate: number;
  cash: number;
  notes?: string;
}

// companyId -> persona, used to map demo company ids to generator personas
// when ENABLE_DATABASE=false. Real companies (DB mode) don't use this.
const DEMO_COMPANY_PERSONAS: Record<string, PersonaKey> = {
  'demo-company-steady': 'steady',
  'demo-company-hypergrowth': 'hypergrowth',
  'demo-company-struggling': 'struggling',
};

/**
 * Repository layer is the ONLY place that branches on env.ENABLE_DATABASE.
 * Controllers/services above this call the same methods regardless of mode.
 *
 * Mutating methods take an optional transaction client. When one is supplied
 * the write joins the caller's transaction, so a change and its audit entry
 * commit or roll back together. Omitting it still works for callers with no
 * audit obligation, but every audited path passes one.
 */
@Injectable()
export class MetricsRepository {
  constructor(private prisma: PrismaService) {}

  async findByCompany(companyId: string): Promise<SnapshotInput[]> {
    if (env.ENABLE_DATABASE) {
      const rows = await this.prisma.metricSnapshot.findMany({
        where: { companyId },
        orderBy: { month: 'asc' },
      });
      return rows.map(toSnapshotInput);
    }

    const persona = DEMO_COMPANY_PERSONAS[companyId] ?? 'steady';
    return generateSnapshots(persona, 24).map((s) => ({
      companyId,
      month: s.month,
      mrr: s.mrr,
      newMrr: s.newMrr,
      expansionMrr: s.expansionMrr,
      contractionMrr: s.contractionMrr,
      churnedMrr: s.churnedMrr,
      newCustomers: s.newCustomers,
      churnedCustomers: s.churnedCustomers,
      totalCustomers: s.totalCustomers,
      burnRate: s.burnRate,
      cash: s.cash,
    }));
  }

  async upsert(input: SnapshotInput, tx?: AuditTx): Promise<SnapshotInput> {
    if (env.ENABLE_DATABASE) {
      const db = tx ?? this.prisma;
      const row = await db.metricSnapshot.upsert({
        where: { companyId_month: { companyId: input.companyId, month: input.month } },
        create: { ...input },
        update: { ...input },
      });
      return toSnapshotInput(row);
    }
    // Fake mode: no persistence, echo back the input as confirmation.
    // Editor UX still works against in-memory data for the demo.
    return input;
  }

  /**
   * Bulk import. The caller supplies a transaction so a 24-row CSV either lands
   * whole or not at all - a partially imported month is worse than a failed
   * import, because it looks like real data.
   */
  async importCsvRows(tx: AuditTx, companyId: string, rows: SnapshotInput[]): Promise<number> {
    if (!env.ENABLE_DATABASE) return rows.length;

    // createMany with skipDuplicates is not usable here because an import is an
    // upsert per month, but it does show the intent: one statement's worth of
    // work per row, bounded by the caller's transaction.
    for (const row of rows) {
      await tx.metricSnapshot.upsert({
        where: { companyId_month: { companyId, month: row.month } },
        create: { ...row, companyId },
        update: { ...row, companyId },
      });
    }
    return rows.length;
  }

  async delete(companyId: string, month: Date, tx?: AuditTx): Promise<boolean> {
    if (env.ENABLE_DATABASE) {
      const db = tx ?? this.prisma;
      const res = await db.metricSnapshot.deleteMany({ where: { companyId, month } });
      return res.count > 0;
    }
    return true; // demo mode: acknowledge the delete
  }

  /** Exposed so services can open a transaction without reaching for the client. */
  transaction<T>(fn: (tx: AuditTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}

function toSnapshotInput(row: MetricSnapshotRow): SnapshotInput {
  return {
    companyId: row.companyId,
    month: row.month,
    mrr: Number(row.mrr),
    newMrr: Number(row.newMrr),
    expansionMrr: Number(row.expansionMrr),
    contractionMrr: Number(row.contractionMrr),
    churnedMrr: Number(row.churnedMrr),
    newCustomers: row.newCustomers,
    churnedCustomers: row.churnedCustomers,
    totalCustomers: row.totalCustomers,
    burnRate: Number(row.burnRate),
    cash: Number(row.cash),
    notes: row.notes ?? undefined,
  };
}
