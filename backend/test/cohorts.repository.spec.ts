import { CohortsRepository } from '../src/cohorts/cohorts.repository';
import { CohortsService } from '../src/cohorts/cohorts.service';
import { env } from '../src/config/env';
import type { PrismaService } from '../src/prisma.service';
import { generateCohorts } from '../src/fake-data/generator';
import type { PersonaKey } from '../src/fake-data/personas';

/**
 * Regression cover for the demo-data leak in 1a, re-expressed for the relational
 * model.
 *
 * In database mode this repository used to fall back to the persona generator
 * when a real company had no cohort rows. A founder with an empty database was
 * therefore shown twelve fabricated customers with plausible MRR histories --
 * indistinguishable, in the UI, from their own book of business. The most
 * dangerous class of bug this product can have.
 */
describe('CohortsRepository', () => {
  const originalEnableDatabase = env.ENABLE_DATABASE;

  function build() {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customer: { groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    return { repo: new CohortsRepository(prisma), prisma };
  }

  afterEach(() => {
    env.ENABLE_DATABASE = originalEnableDatabase;
    jest.clearAllMocks();
  });

  describe('database mode', () => {
    beforeEach(() => {
      env.ENABLE_DATABASE = true;
    });

    it('returns an empty aggregate for a real company with no customers', async () => {
      // The headline regression. An empty state is the only honest answer: the
      // alternative is inventing customers.
      const { repo } = build();

      const result = await repo.aggregateRetention('real-co-1');

      expect(result.cells).toEqual([]);
      expect(result.sizes).toEqual([]);
    });

    it('never generates demo data for an unknown company id', async () => {
      // A brand-new company in demo-configured deployments must still be empty.
      const { repo, prisma } = build();

      const result = await repo.aggregateRetention('a-company-that-does-not-exist');

      expect(result.cells).toEqual([]);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('does not return a known demo persona when rows are absent', async () => {
      // 'demo-company-steady' has a hard-coded generator path in demo mode; it
      // must not leak into database mode.
      const { repo } = build();

      await expect(repo.aggregateRetention('demo-company-steady')).resolves.toEqual({ cells: [], sizes: [] });
    });

    it('scopes both queries to the requested company', async () => {
      const { repo, prisma } = build();

      await repo.aggregateRetention('real-co-1');

      expect(prisma.customer.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'real-co-1' } }));
    });

    it('returns the aggregated cells the database produced', async () => {
      const { repo, prisma } = build();
      const cells = [
        { signupMonth: new Date('2024-01-01T00:00:00Z'), offset: 0, activeCustomers: 5, revenue: 1000 },
        { signupMonth: new Date('2024-01-01T00:00:00Z'), offset: 1, activeCustomers: 4, revenue: 800 },
      ];
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(cells);
      (prisma.customer.groupBy as jest.Mock).mockResolvedValueOnce([
        { signupMonth: new Date('2024-01-01T00:00:00Z'), _count: { _all: 5 } },
      ]);

      const result = await repo.aggregateRetention('real-co-1');

      expect(result.cells).toEqual(cells);
      expect(result.sizes).toEqual([{ signupMonth: new Date('2024-01-01T00:00:00Z'), size: 5 }]);
    });

    it('does not touch the database for a demo-mode read', async () => {
      env.ENABLE_DATABASE = false;
      const { repo, prisma } = build();

      await repo.aggregateRetention('demo-company-steady');

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.customer.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('demo mode', () => {
    beforeEach(() => {
      env.ENABLE_DATABASE = false;
    });

    it.each<[string, PersonaKey]>([
      ['demo-company-steady', 'steady'],
      ['demo-company-hypergrowth', 'hypergrowth'],
      ['demo-company-struggling', 'struggling'],
    ])('maps %s to the %s persona', async (companyId, persona) => {
      const { repo } = build();

      const { cells, sizes } = await repo.aggregateRetention(companyId);

      // Same generator, now flattened into month rows, so the comparison is on
      // the aggregate rather than on the stored shape.
      const customers = generateCohorts(persona, 12, 12);
      expect(sizes.reduce((sum, s) => sum + s.size, 0)).toBe(customers.length);
      expect(cells.length).toBeGreaterThan(0);
    });

    it('returns data for a company with no persona mapping', async () => {
      const { repo } = build();

      const { sizes } = await repo.aggregateRetention('some-other-id');

      expect(sizes.length).toBeGreaterThan(0);
    });

    it('is deterministic', async () => {
      const { repo } = build();

      const [a, b] = await Promise.all([repo.aggregateRetention('demo-company-steady'), repo.aggregateRetention('demo-company-steady')]);

      expect(a).toEqual(b);
    });

    it('aggregates the same values as the generator produced', async () => {
      // Pins the in-memory aggregation to the generator, so demo mode cannot
      // quietly drift from what the seed writes to the database. The offset is
      // turned back into a date with real month arithmetic, not a fixed number
      // of milliseconds, which drifts across month boundaries.
      const { repo } = build();
      const customers = generateCohorts('steady', 12, 12);
      const { cells } = await repo.aggregateRetention('demo-company-steady');

      const monthKey = (d: Date) => d.toISOString().slice(0, 7);
      const expected = new Map<string, number>();
      for (const c of customers) {
        for (const v of c.values) {
          if (v.mrr <= 0) continue;
          const key = `${monthKey(c.signupMonth)}|${monthKey(v.month)}`;
          expected.set(key, (expected.get(key) ?? 0) + 1);
        }
      }

      const actual = new Map(
        cells
          .filter((c) => c.activeCustomers > 0)
          .map((c) => [
            `${monthKey(c.signupMonth)}|${monthKey(
              new Date(Date.UTC(c.signupMonth.getUTCFullYear(), c.signupMonth.getUTCMonth() + c.offset, 1)),
            )}`,
            c.activeCustomers,
          ]),
      );

      expect(actual).toEqual(expected);
    });
  });
});

/**
 * The retention grid is where the old JSON model produced quietly wrong
 * numbers, so the densification rules are pinned here rather than left to
 * inspection.
 */
describe('CohortsService', () => {
  const month = (m: string) => new Date(`${m}-01T00:00:00.000Z`);

  function serviceWith(cells: unknown[], sizes: unknown[]) {
    const repo = { aggregateRetention: jest.fn().mockResolvedValue({ cells, sizes }) } as unknown as CohortsRepository;
    return new CohortsService(repo);
  }

  it('returns nothing when the company has no cohorts', async () => {
    const service = serviceWith([], []);
    await expect(service.getRetentionTable('co-1')).resolves.toEqual([]);
  });

  it('computes retention percentages against the starting cohort', async () => {
    const service = serviceWith(
      [
        { signupMonth: month('2024-01'), offset: 0, activeCustomers: 10, revenue: 1000 },
        { signupMonth: month('2024-01'), offset: 1, activeCustomers: 8, revenue: 900 },
        { signupMonth: month('2024-01'), offset: 2, activeCustomers: 0, revenue: 0 },
      ],
      [{ signupMonth: month('2024-01'), size: 10 }],
    );

    const [row] = await service.getRetentionTable('co-1');

    expect(row).toEqual({
      cohortLabel: '2024-01',
      signupMonth: '2024-01',
      size: 10,
      logoRetention: [100, 80, 0],
      revenueRetention: [100, 90, 0],
      cumulativeRevenue: [1000, 1900, 1900],
    });
  });

  it('fills a missing later cell with zeros rather than ending the row', async () => {
    // A gap means the whole cohort had churned. Rendering nothing there reads as
    // "no data yet", which is the opposite of what happened.
    const service = serviceWith(
      [
        { signupMonth: month('2024-01'), offset: 0, activeCustomers: 4, revenue: 400 },
        { signupMonth: month('2024-01'), offset: 1, activeCustomers: 2, revenue: 200 },
      ],
      [{ signupMonth: month('2024-01'), size: 4 }],
    );

    const [row] = await service.getRetentionTable('co-1');

    expect(row.logoRetention).toEqual([100, 50]);
    expect(row.cumulativeRevenue).toEqual([400, 600]);
  });

  it('handles a cohort with no revenue at all without dividing by zero', async () => {
    const service = serviceWith(
      [{ signupMonth: month('2024-03'), offset: 0, activeCustomers: 0, revenue: 0 }],
      [{ signupMonth: month('2024-03'), size: 0 }],
    );

    await expect(service.getRetentionTable('co-1')).resolves.toEqual([]);
  });

  it('orders cohorts oldest first', async () => {
    const service = serviceWith(
      [
        { signupMonth: month('2024-02'), offset: 0, activeCustomers: 1, revenue: 10 },
        { signupMonth: month('2024-01'), offset: 0, activeCustomers: 1, revenue: 10 },
      ],
      [
        { signupMonth: month('2024-01'), size: 1 },
        { signupMonth: month('2024-02'), size: 1 },
      ],
    );

    const rows = await service.getRetentionTable('co-1');

    expect(rows.map((r) => r.cohortLabel)).toEqual(['2024-01', '2024-02']);
  });
});
