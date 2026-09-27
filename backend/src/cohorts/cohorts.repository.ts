import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { generateCohorts } from '../fake-data/generator';
import { PersonaKey } from '../fake-data/personas';

const DEMO_COMPANY_PERSONAS: Record<string, PersonaKey> = {
  'demo-company-steady': 'steady',
  'demo-company-hypergrowth': 'hypergrowth',
  'demo-company-struggling': 'struggling',
};

/** One cell of the retention grid, already aggregated by the database. */
export interface CohortCell {
  signupMonth: Date;
  /** Months since signup. */
  offset: number;
  activeCustomers: number;
  revenue: number;
}

export interface CohortAggregate {
  cells: CohortCell[];
  /** Cohort sizes, derived from the number of customers who signed up each month. */
  sizes: { signupMonth: Date; size: number }[];
}

@Injectable()
export class CohortsRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Aggregates retention for one company.
   *
   * This is the query the old schema could not express. Previously each customer
   * carried a JSON blob of its monthly values, so the database could not sum
   * across customers and the service had to pull every customer into memory and
   * add it up in JavaScript - a cost that grew with the customer count and was
   * wrong for anyone above a few hundred.
   *
   * Now that a month is a row, the grouping is a GROUP BY. The offset is
   * computed from the difference between the value's month and the customer's
   * signup month, both of which the database can now index.
   *
   * In database mode this returns exactly what is stored, including nothing. A
   * real company with no customers must render an empty state: it must never be
   * handed generated demo data that looks like its own customers.
   */
  async aggregateRetention(companyId: string): Promise<CohortAggregate> {
    if (!env.ENABLE_DATABASE) return aggregateInMemory(this.demoCustomers(companyId));

    // $queryRaw is parameterised through Prisma.sql rather than interpolated, so
    // companyId is bound, not parsed as SQL.
    const cells = await this.prisma.$queryRaw<
      { signupMonth: Date; offset: number; activeCustomers: number; revenue: number }[]
    >(Prisma.sql`
      SELECT
        c."signupMonth"                                              AS "signupMonth",
        (EXTRACT(YEAR  FROM age(v."month", c."signupMonth")) * 12
        + EXTRACT(MONTH FROM age(v."month", c."signupMonth")))::int   AS "offset",
        count(*) FILTER (WHERE v."mrr" > 0)::int                     AS "activeCustomers",
        COALESCE(SUM(v."mrr"), 0)::float8                            AS "revenue"
      FROM "Customer" c
      JOIN "CustomerMonthlyValue" v
        ON v."customerId" = c."id" AND v."companyId" = c."companyId"
      WHERE c."companyId" = ${companyId}
      GROUP BY c."signupMonth", 2
      ORDER BY c."signupMonth" ASC, 2 ASC
    `);

    const sizes = await this.prisma.customer.groupBy({
      by: ['signupMonth'],
      where: { companyId },
      _count: { _all: true },
      orderBy: { signupMonth: 'asc' },
    });

    return {
      cells,
      sizes: sizes.map((s) => ({ signupMonth: s.signupMonth, size: s._count._all })),
    };
  }

  /** Count of customers, for the dashboard's active-customer tile. */
  async countByCompany(companyId: string): Promise<{ total: number; active: number }> {
    if (!env.ENABLE_DATABASE) {
      const customers = this.demoCustomers(companyId);
      return {
        total: customers.length,
        active: customers.filter((c) => c.status === 'active').length,
      };
    }
    const [total, active] = await Promise.all([
      this.prisma.customer.count({ where: { companyId } }),
      this.prisma.customer.count({ where: { companyId, status: 'ACTIVE' } }),
    ]);
    return { total, active };
  }

  private demoCustomers(companyId: string) {
    return generateCohorts(DEMO_COMPANY_PERSONAS[companyId] ?? 'steady', 12, 12);
  }
}

/**
 * Demo-mode equivalent of the SQL above, over generated data.
 *
 * Kept structurally identical to the database path on purpose: if the two
 * disagree, the demo stops being a useful preview of the real product, and the
 * difference only shows up for a customer nobody was looking at.
 */
function aggregateInMemory(customers: ReturnType<typeof generateCohorts>): CohortAggregate {
  const cells: CohortCell[] = [];
  const sizeByMonth = new Map<string, number>();

  for (const customer of customers) {
    const key = customer.signupMonth.toISOString().slice(0, 7);
    sizeByMonth.set(key, (sizeByMonth.get(key) ?? 0) + 1);

    for (const value of customer.values) {
      const offset =
        (value.month.getUTCFullYear() - customer.signupMonth.getUTCFullYear()) * 12 +
        (value.month.getUTCMonth() - customer.signupMonth.getUTCMonth());
      const existing = cells.find(
        (c) => c.signupMonth.getTime() === customer.signupMonth.getTime() && c.offset === offset,
      );
      if (existing) {
        if (value.mrr > 0) existing.activeCustomers += 1;
        existing.revenue += value.mrr;
      } else {
        cells.push({
          signupMonth: customer.signupMonth,
          offset,
          activeCustomers: value.mrr > 0 ? 1 : 0,
          revenue: value.mrr,
        });
      }
    }
  }

  return {
    cells: cells.sort((a, b) => a.signupMonth.getTime() - b.signupMonth.getTime() || a.offset - b.offset),
    sizes: Array.from(sizeByMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, size]) => ({ signupMonth: new Date(`${month}-01T00:00:00.000Z`), size })),
  };
}
