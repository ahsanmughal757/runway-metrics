import { CohortsRepository } from '../src/cohorts/cohorts.repository';
import { env } from '../src/config/env';
import type { PrismaService } from '../src/prisma.service';
import { generateCohorts } from '../src/fake-data/generator';
import type { PersonaKey } from '../src/fake-data/personas';

/**
 * Regression cover for the demo-data leak in 1a.
 *
 * In database mode this repository used to fall back to the persona generator
 * when a real company had no cohort rows. A founder with an empty database was
 * therefore shown twelve fabricated customers with plausible MRR histories --
 * indistinguishable, in the UI, from their own book of business. The most
 * dangerous class of bug this product can have.
 */
describe('CohortsRepository', () => {
  const originalEnableDatabase = env.ENABLE_DATABASE;

  function build(rows: unknown[] = []) {
    const prisma = {
      cohortEntry: { findMany: jest.fn().mockResolvedValue(rows) },
    } as unknown as PrismaService;
    return { repo: new CohortsRepository(prisma), prisma };
  }

  const storedRow = (over: Record<string, unknown> = {}) => ({
    companyId: 'real-co-1',
    customerId: 'cus_1',
    signupMonth: '2024-01',
    status: 'active',
    mrrByMonth: { '0': 500, '1': 500 },
    ...over,
  });

  afterEach(() => {
    env.ENABLE_DATABASE = originalEnableDatabase;
  });

  describe('database mode', () => {
    beforeEach(() => {
      env.ENABLE_DATABASE = true;
    });

    it('returns an empty array for a real company with no cohort rows', async () => {
      // The headline regression. An empty state is the only honest answer: the
      // alternative is inventing customers.
      const { repo } = build([]);

      await expect(repo.findByCompany('real-co-1')).resolves.toEqual([]);
    });

    it('never generates demo data for an unknown company id', async () => {
      // A brand-new company in demo-configured deployments must still be empty.
      const { repo, prisma } = build([]);

      const result = await repo.findByCompany('a-company-that-does-not-exist');

      expect(result).toEqual([]);
      expect(prisma.cohortEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'a-company-that-does-not-exist' } }),
      );
    });

    it('does not return a known demo persona when rows are absent', async () => {
      // 'demo-company-steady' has a hard-coded generator path in demo mode; it
      // must not leak into database mode.
      const { repo } = build([]);

      await expect(repo.findByCompany('demo-company-steady')).resolves.toEqual([]);
    });

    it('returns stored rows without modification', async () => {
      const { repo } = build([storedRow()]);

      const result = await repo.findByCompany('real-co-1');

      expect(result).toEqual([
        {
          customerId: 'cus_1',
          signupMonth: '2024-01',
          status: 'active',
          mrrByMonth: { '0': 500, '1': 500 },
        },
      ]);
    });

    it('orders by signup month then customer id', async () => {
      // Two customers in the same month must have a stable order or the table
      // reshuffles between requests.
      const { repo, prisma } = build([]);

      await repo.findByCompany('real-co-1');

      expect(prisma.cohortEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ signupMonth: 'asc' }, { customerId: 'asc' }] }),
      );
    });

    it('preserves a churned status from storage', async () => {
      const { repo } = build([storedRow({ status: 'churned', mrrByMonth: { '0': 500, '1': 0 } })]);

      const [entry] = await repo.findByCompany('real-co-1');

      expect(entry.status).toBe('churned');
    });

    it('does not touch the database for a demo-mode read', async () => {
      env.ENABLE_DATABASE = false;
      const { repo, prisma } = build([]);

      await repo.findByCompany('demo-company-steady');

      expect(prisma.cohortEntry.findMany).not.toHaveBeenCalled();
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
      const { repo } = build([]);

      const result = await repo.findByCompany(companyId);

      expect(result).toEqual(generateCohorts(persona, 12, 12));
    });

    it('returns data for a company with no persona mapping', async () => {
      const { repo } = build([]);

      const result = await repo.findByCompany('some-other-id');

      expect(result.length).toBeGreaterThan(0);
      expect(result).toEqual(generateCohorts('steady', 12, 12));
    });

    it('is deterministic', async () => {
      const { repo } = build([]);

      const [a, b] = await Promise.all([repo.findByCompany('demo-company-steady'), repo.findByCompany('demo-company-steady')]);

      expect(a).toEqual(b);
    });
  });
});
