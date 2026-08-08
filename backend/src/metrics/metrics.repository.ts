import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { generateSnapshots } from '../fake-data/generator';
import { PersonaKey } from '../fake-data/personas';

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

  async upsert(input: SnapshotInput): Promise<SnapshotInput> {
    if (env.ENABLE_DATABASE) {
      const row = await this.prisma.metricSnapshot.upsert({
        where: { companyId_month: { companyId: input.companyId, month: input.month } },
        create: { ...input },
        update: { ...input },
      });
      return toSnapshotInput(row);
    }
    // Fake mode: no persistence, echo back the input as confirmation.
    // Founder-edit UX still works against in-memory data for the demo.
    return input;
  }

  async importCsvRows(companyId: string, rows: SnapshotInput[]): Promise<number> {
    if (env.ENABLE_DATABASE) {
      let count = 0;
      for (const row of rows) {
        await this.prisma.metricSnapshot.upsert({
          where: { companyId_month: { companyId, month: row.month } },
          create: { ...row, companyId },
          update: { ...row, companyId },
        });
        count++;
      }
      return count;
    }
    return rows.length; // demo mode: report what would have been imported
  }

  async delete(companyId: string, month: Date): Promise<boolean> {
    if (env.ENABLE_DATABASE) {
      const res = await this.prisma.metricSnapshot.deleteMany({ where: { companyId, month } });
      return res.count > 0;
    }
    return true; // demo mode: acknowledge the delete
  }
}

function toSnapshotInput(row: any): SnapshotInput {
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
