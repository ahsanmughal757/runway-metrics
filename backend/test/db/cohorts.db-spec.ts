/**
 * Cohort retention against a real database.
 *
 * This suite exists because of a specific bug it would have caught. The
 * retention query lives in a `Prisma.sql` template literal, and it shipped with
 * a missing double quote: `c."signupMonth)))::int`. TypeScript cannot see
 * inside a template string, the linter cannot either, and the unit tests never
 * ran it because they use generated in-memory data with ENABLE_DATABASE=false.
 * So the entire cohort report was broken against a real database and every
 * automated check said the feature worked.
 *
 * The lesson is encoded here: this is a real query, so a real query gets a real
 * test. If you add another $queryRaw, add it to a suite like this one.
 */
import { CohortsRepository } from '../../src/cohorts/cohorts.repository';
import { CohortsService } from '../../src/cohorts/cohorts.service';
import { closeApp, freshDb, makeApp, prisma } from './harness';
import type { INestApplication } from '@nestjs/common';

const JAN = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex, 1));

/**
 * Inserts one customer with a value per month, so a test can state the retention
 * curve it expects without recomputing it from the aggregation code.
 */
async function seedCustomer(opts: {
  companyId: string;
  signupMonth: Date;
  /** mrr per month offset; a null ends the series. */
  values: (number | null)[];
  churnedAt?: Date | null;
  name?: string;
}) {
  const customer = await prisma.customer.create({
    data: {
      companyId: opts.companyId,
      name: opts.name,
      signupMonth: opts.signupMonth,
      churnedAt: opts.churnedAt ?? null,
    },
  });

  for (let offset = 0; offset < opts.values.length; offset++) {
    const mrr = opts.values[offset];
    if (mrr === null) continue;
    const month = new Date(Date.UTC(opts.signupMonth.getUTCFullYear(), opts.signupMonth.getUTCMonth() + offset, 1));
    await prisma.customerMonthlyValue.create({
      data: { companyId: opts.companyId, customerId: customer.id, month, mrr },
    });
  }
  return customer;
}

describe('cohort retention (real database)', () => {
  let app: INestApplication;
  let companyId: string;

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  beforeEach(async () => {
    await freshDb();
    const company = await prisma.company.create({ data: { name: 'Cohort Co', slug: 'cohort-co' } });
    companyId = company.id;
  });

  describe('the retention query itself', () => {
    it('parses and returns cells for a company with customers', async () => {
      // The regression test. Before the fix this threw P2010 /
      // "syntax error at or near offset" and the report 500'd.
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 80, 60] });

      const agg = await app.get(CohortsRepository).aggregateRetention(companyId);

      expect(agg.cells).toHaveLength(3);
      expect(agg.sizes).toHaveLength(1);
      expect(agg.sizes[0].size).toBe(1);
    });

    it('computes the month offset from the signup month, not the calendar', async () => {
      // A cohort that signs up mid-year must have its offset 0 in its own
      // signup month, or every retention number is silently wrong.
      await seedCustomer({ companyId, signupMonth: JAN(2024, 10), values: [100, 90] });

      const agg = await app.get(CohortsRepository).aggregateRetention(companyId);

      expect(agg.cells.map((c) => c.offset).sort()).toEqual([0, 1]);
      const offsetZero = agg.cells.find((c) => c.offset === 0);
      expect(offsetZero?.revenue).toBe(100);
      expect(new Date(offsetZero!.signupMonth).toISOString().slice(0, 7)).toBe('2024-11');
    });

    it('counts a customer as active only while their MRR is above zero', async () => {
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 0, 50] });
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 100, 0] });

      const agg = await app.get(CohortsRepository).aggregateRetention(companyId);

      const byOffset = (n: number) => agg.cells.find((c) => c.offset === n);
      expect(byOffset(0)!.activeCustomers).toBe(2);
      expect(byOffset(1)!.activeCustomers).toBe(1); // one of the two is at 0
      expect(byOffset(2)!.activeCustomers).toBe(1);
      // Revenue still counts a zero row's contribution, which is 0 anyway.
      expect(byOffset(1)!.revenue).toBe(100);
    });

    it('returns nothing at all for a company with no customers', async () => {
      // A real company with no customers must render an empty state, never
      // borrowed demo data. This is the bug the old in-memory version had.
      const agg = await app.get(CohortsRepository).aggregateRetention(companyId);

      expect(agg.cells).toEqual([]);
      expect(agg.sizes).toEqual([]);
      expect(await app.get(CohortsService).getRetentionTable(companyId)).toEqual([]);
    });

    it('never mixes two companies into one cohort', async () => {
      const other = await prisma.company.create({ data: { name: 'Other Co', slug: 'other-co' } });
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100] });
      await seedCustomer({ companyId: other.id, signupMonth: JAN(2024, 0), values: [999_999] });

      const mine = await app.get(CohortsRepository).aggregateRetention(companyId);
      const theirs = await app.get(CohortsRepository).aggregateRetention(other.id);

      expect(mine.cells[0].revenue).toBe(100);
      expect(theirs.cells[0].revenue).toBe(999_999);
    });
  });

  describe('the retention grid', () => {
    it('starts every cohort at 100%', async () => {
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 50] });

      const rows = await app.get(CohortsService).getRetentionTable(companyId);

      expect(rows).toHaveLength(1);
      expect(rows[0].logoRetention[0]).toBe(100);
      expect(rows[0].revenueRetention[0]).toBe(100);
    });

    it('halves logo retention when half the cohort stops paying', async () => {
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 100] });
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 0] });

      const rows = await app.get(CohortsService).getRetentionTable(companyId);

      expect(rows[0].size).toBe(2);
      expect(rows[0].logoRetention).toEqual([100, 50]);
    });

    /**
     * The gap case the service's own doc comment calls out. When *every*
     * customer in a cohort has no row for a month, the SQL produces no cell for
     * it at all. The row must still show a zero there: a short array reads as
     * "we have no data" when the truth is "nobody was paying that month".
     *
     * Both customers here skip month 1 but have values in month 0 and month 2,
     * so offset 1 genuinely has no cell in the result set.
     */
    it('pads a month the whole cohort skipped with zeros rather than ending the row', async () => {
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, null, 50] });
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, null, 50] });

      const agg = await app.get(CohortsRepository).aggregateRetention(companyId);
      // Precondition: the database really did skip that month.
      expect(agg.cells.map((c) => c.offset).sort()).toEqual([0, 2]);

      const rows = await app.get(CohortsService).getRetentionTable(companyId);

      expect(rows[0].logoRetention).toEqual([100, 0, 100]);
      expect(rows[0].revenueRetention).toEqual([100, 0, 50]);
      expect(rows[0].cumulativeRevenue).toEqual([200, 200, 300]);
    });

    it('accumulates revenue cumulatively and monotonically', async () => {
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 50] });

      const rows = await app.get(CohortsService).getRetentionTable(companyId);

      expect(rows[0].cumulativeRevenue).toEqual([100, 150]);
    });

    it('gives each cohort its own row, ordered by signup month', async () => {
      await seedCustomer({ companyId, signupMonth: JAN(2024, 2), values: [100, 100] });
      await seedCustomer({ companyId, signupMonth: JAN(2024, 0), values: [100, 100] });

      const rows = await app.get(CohortsService).getRetentionTable(companyId);

      expect(rows.map((r) => r.cohortLabel)).toEqual(['2024-01', '2024-03']);
    });
  });
});
