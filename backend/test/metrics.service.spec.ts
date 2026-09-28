import { MetricsService } from '../src/metrics/metrics.service';
import type { MetricsRepository, SnapshotInput } from '../src/metrics/metrics.repository';
import type { CompaniesRepository } from '../src/companies/companies.repository';
import type { AuditService, AuditTx } from '../src/audit/audit.service';

/**
 * Regression cover for the runway, audit, and CSV-validation fixes in 1a.
 *
 * Pinned defects:
 *  1. `AuditService.record()` had zero call sites, so the Activity feed and the
 *     audit trail were permanently empty in real mode.
 *  2. Five of the six call sites recorded the audit entry *before* the mutation
 *     was confirmed, so every failed write left a phantom audit row.
 *  3. An insolvent company (zero cash, therefore zero burn) reported
 *     `runwayZone: 'unknown'` -- the most benign reading of the worst state.
 *  4. `new Date('nonsense')` never throws, so a bad CSV month became an
 *     Invalid Date instead of a row-level validation error.
 */
describe('MetricsService', () => {
  const settings = { id: 'c1', name: 'Test Co', runwayGreenMonths: 12, runwayYellowMonths: 6 };

  function makeSnapshot(over: Partial<SnapshotInput> = {}): SnapshotInput {
    return {
      companyId: 'c1',
      month: new Date(Date.UTC(2024, 0, 1)),
      mrr: 10_000,
      newMrr: 0,
      expansionMrr: 0,
      contractionMrr: 0,
      churnedMrr: 0,
      newCustomers: 0,
      churnedCustomers: 0,
      totalCustomers: 100,
      burnRate: 10_000,
      cash: 100_000,
      ...over,
    };
  }

  const CSV_HEADER = 'month,mrr,newMrr,expansionMrr,contractionMrr,churnedMrr,newCustomers,churnedCustomers,totalCustomers,burnRate,cash';

  function build(snapshots: SnapshotInput[], opts: { importResult?: number; deleteResult?: boolean } = {}) {
    // A stand-in transaction client. The service is required to open one and do
    // both the mutation and the audit inside it, so the double simply runs the
    // callback - and the assertions below check that the audit received *this*
    // object rather than the bare Prisma client.
    const tx = { __isTransaction: true } as unknown as AuditTx;

    const repo = {
      findByCompany: jest.fn().mockResolvedValue(snapshots),
      upsert: jest.fn().mockImplementation((i: SnapshotInput) => Promise.resolve(i)),
      delete: jest.fn().mockResolvedValue(opts.deleteResult ?? true),
      importCsvRows: jest.fn().mockResolvedValue(opts.importResult ?? 0),
      transaction: jest.fn((fn: (t: AuditTx) => Promise<unknown>) => fn(tx)),
    } as unknown as MetricsRepository;

    const companies = {
      getSettings: jest.fn().mockResolvedValue(settings),
    } as unknown as CompaniesRepository;

    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
      recordIn: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    } as unknown as AuditService;

    return { service: new MetricsService(repo, companies, audit), repo, companies, audit, tx };
  }

  describe('runway derivation', () => {
    it('reports zero runway and the red zone when the company is insolvent', async () => {
      // Zero cash implies zero burn, which previously averaged to zero and
      // surfaced as "runway unknown" -- a reassuring label for a dead company.
      const { service } = build([
        makeSnapshot({ month: new Date(Date.UTC(2024, 0, 1)), cash: 0, burnRate: 0 }),
        makeSnapshot({ month: new Date(Date.UTC(2024, 1, 1)), cash: 0, burnRate: 0 }),
        makeSnapshot({ month: new Date(Date.UTC(2024, 2, 1)), cash: 0, burnRate: 0 }),
      ]);

      const { latest } = await service.getDashboard('c1');

      expect(latest?.derived.runwayMonths).toBe(0);
      expect(latest?.derived.runwayZone).toBe('red');
    });

    it('reports unknown runway when a solvent company is not burning', async () => {
      const { service } = build([makeSnapshot({ cash: 100_000, burnRate: 0 })]);

      const { latest } = await service.getDashboard('c1');

      expect(latest?.derived.runwayMonths).toBeNull();
      expect(latest?.derived.runwayZone).toBe('unknown');
    });

    it('averages burn over three months rather than trusting one month', async () => {
      // A founder's worst month should not read as their runway.
      const { service } = build([
        makeSnapshot({ month: new Date(Date.UTC(2024, 0, 1)), cash: 100_000, burnRate: 10_000 }),
        makeSnapshot({ month: new Date(Date.UTC(2024, 1, 1)), cash: 90_000, burnRate: 20_000 }),
        makeSnapshot({ month: new Date(Date.UTC(2024, 2, 1)), cash: 70_000, burnRate: 30_000 }),
      ]);

      const { latest } = await service.getDashboard('c1');

      expect(latest?.derived.threeMoAvgBurn).toBe(20_000);
      expect(latest?.derived.runwayMonths).toBe(3.5);
      expect(latest?.derived.runwayZone).toBe('red');
    });

    it.each([
      [200_000, 20, 'green'],
      [80_000, 8, 'yellow'],
      [30_000, 3, 'red'],
    ])('classifies %i cash against the company thresholds', async (cash, months, zone) => {
      const { service } = build([makeSnapshot({ cash, burnRate: 10_000 })]);

      const { latest } = await service.getDashboard('c1');

      expect(latest?.derived.runwayMonths).toBe(months);
      expect(latest?.derived.runwayZone).toBe(zone);
    });

    it('derives runway for every point in the series, not just the last', async () => {
      const { service } = build([
        makeSnapshot({ month: new Date(Date.UTC(2024, 0, 1)), cash: 300_000, burnRate: 10_000 }),
        makeSnapshot({ month: new Date(Date.UTC(2024, 1, 1)), cash: 100_000, burnRate: 10_000 }),
      ]);

      const { snapshots } = await service.getDashboard('c1');

      expect(snapshots[0].derived.runwayMonths).toBe(30);
      expect(snapshots[1].derived.runwayMonths).toBe(10);
    });

    it('handles an empty series without throwing', async () => {
      const { service } = build([]);

      const { snapshots, latest } = await service.getDashboard('c1');

      expect(snapshots).toEqual([]);
      expect(latest).toBeNull();
    });
  });

  describe('audit trail', () => {
    it('records an update when a snapshot is upserted', async () => {
      const { service, audit } = build([]);

      await service.upsertSnapshot({ ...makeSnapshot(), actorId: 'user-1' });

      expect(audit.recordIn).toHaveBeenCalledWith(expect.anything(), {
        companyId: 'c1',
        entityId: 'c1:2024-01-01',
        entityType: 'METRIC_SNAPSHOT',
        action: 'UPDATED',
        actorId: 'user-1',
        diff: { month: '2024-01-01', mrr: 10_000, cash: 100_000 },
      });
    });

    it('audits inside the same transaction as the write', async () => {
      // The Phase 2 fix. Previously the mutation committed on its own and the
      // audit row was a separate best-effort write, so a failure in between left
      // the numbers changed with no record of who changed them.
      const { service, repo, audit, tx } = build([]);

      await service.upsertSnapshot({ ...makeSnapshot(), actorId: 'user-1' });

      expect(audit.recordIn).toHaveBeenCalledWith(tx, expect.anything());
      expect(repo.upsert).toHaveBeenCalledWith(expect.anything(), tx);
    });

    it('does not leak actorId into the persisted snapshot', async () => {
      const { service, repo } = build([]);

      await service.upsertSnapshot({ ...makeSnapshot(), actorId: 'user-1' });

      expect(repo.upsert).toHaveBeenCalledWith(expect.not.objectContaining({ actorId: expect.anything() }), expect.anything());
    });

    it('does not record an update when the write fails', async () => {
      // The whole point of the ordering fix: the audit trail must never claim a
      // change that did not happen.
      const { service, repo, audit } = build([]);
      (repo.upsert as jest.Mock).mockRejectedValueOnce(new Error('db down'));

      await expect(service.upsertSnapshot({ ...makeSnapshot(), actorId: 'user-1' })).rejects.toThrow('db down');
      expect(audit.recordIn).not.toHaveBeenCalled();
    });

    it('records a delete with a month-scoped entity id', async () => {
      const { service, audit } = build([]);

      await service.deleteSnapshot('c1', new Date(Date.UTC(2024, 5, 1)), 'user-2');

      expect(audit.recordIn).toHaveBeenCalledWith(expect.anything(), {
        companyId: 'c1',
        entityId: 'c1:2024-06-01',
        entityType: 'METRIC_SNAPSHOT',
        action: 'DELETED',
        actorId: 'user-2',
        diff: { month: '2024-06-01' },
      });
    });

    it('records nothing when a delete matched no row', async () => {
      const { service, audit } = build([], { deleteResult: false });

      await expect(service.deleteSnapshot('c1', new Date(Date.UTC(2024, 5, 1)), 'user-2')).resolves.toBe(false);
      expect(audit.recordIn).not.toHaveBeenCalled();
    });

    it('records a CSV import with the row count and month range', async () => {
      const { service, audit } = build([], { importResult: 2 });
      const rows = [makeSnapshot({ month: new Date(Date.UTC(2024, 0, 1)) }), makeSnapshot({ month: new Date(Date.UTC(2024, 5, 1)) })];

      await service.commitCsv('c1', rows, 'user-3');

      expect(audit.recordIn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'IMPORTED',
          actorId: 'user-3',
          diff: { rowCount: 2, firstMonth: '2024-01', lastMonth: '2024-06' },
        }),
      );
    });

    it('passes the transaction to the bulk import rather than writing row by row outside it', async () => {
      // A partially imported month is worse than a failed one: the founder cannot
      // tell which rows landed.
      const { service, repo, audit, tx } = build([], { importResult: 2 });
      const rows = [makeSnapshot({ month: new Date(Date.UTC(2024, 0, 1)) })];

      await service.commitCsv('c1', rows, 'user-3');

      expect(repo.importCsvRows).toHaveBeenCalledWith(tx, 'c1', rows);
      expect(audit.recordIn).toHaveBeenCalledWith(tx, expect.anything());
    });

    it('writes no audit entry when a CSV import is rejected', async () => {
      // Import and audit must not diverge: a rejected import is not a change.
      const { service, audit, repo } = build([], { importResult: 1 });

      const result = await service.importAndCommit('c1', `${CSV_HEADER}\n2024-01-01,abc,0,0,0,0,0,0,0,0,0`, 'user-4');

      expect(result.committed).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(repo.importCsvRows).not.toHaveBeenCalled();
      expect(audit.recordIn).not.toHaveBeenCalled();
    });
  });

  describe('CSV parsing', () => {
    it('reports missing required columns instead of importing partial data', () => {
      const { service } = build([]);

      const result = service.parseCsvPreview('c1', 'month,mrr\n2024-01-01,100');

      expect(result.rows).toEqual([]);
      expect(result.errors.join(' ')).toMatch(/Missing required columns/);
    });

    it('rejects a non-numeric money value rather than coercing it to NaN', () => {
      const { service } = build([]);

      const result = service.parseCsvPreview('c1', `${CSV_HEADER}\n2024-01-01,abc,0,0,0,0,0,0,0,0,0`);

      expect(result.rows).toEqual([]);
      // The message names the row and quotes the value that failed, so a user
      // with a 400-row upload can find it without guessing.
      expect(result.errors.join(' ')).toMatch(/Row 2.*"abc".*is not a number/);
    });

    it('rejects an unparseable month date', () => {
      // `new Date('nonsense')` returns an Invalid Date rather than throwing, so
      // this used to pass validation and fail later as an opaque Prisma error.
      const { service } = build([]);

      const result = service.parseCsvPreview('c1', `${CSV_HEADER}\nnot-a-date,1000,0,0,0,0,0,0,50,2000,50000`);

      expect(result.rows).toEqual([]);
      // And it says what the format is, rather than just rejecting the token.
      expect(result.errors.join(' ')).toMatch(/Row 2.*"not-a-date".*is not a date.*YYYY-MM-DD/);
    });

    it('reports the offending row number', () => {
      const { service } = build([]);

      const result = service.parseCsvPreview(
        'c1',
        `${CSV_HEADER}\n2024-01-01,1000,0,0,0,0,0,0,50,2000,50000\n2024-02-01,abc,0,0,0,0,0,0,50,2000,50000`,
      );

      expect(result.errors.join(' ')).toMatch(/Row 3/);
    });

    it('keeps the valid rows from a file with one bad row', () => {
      // The service still refuses to commit anything, but the founder needs to
      // see which rows were understood to judge the size of the correction.
      const { service } = build([]);

      const result = service.parseCsvPreview(
        'c1',
        `${CSV_HEADER}\n2024-01-01,1000,0,0,0,0,0,0,50,2000,50000\n2024-02-01,abc,0,0,0,0,0,0,50,2000,50000`,
      );

      expect(result.rows).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });

    it('parses a well-formed row', () => {
      const { service } = build([]);

      const result = service.parseCsvPreview('c1', `${CSV_HEADER}\n2024-01-01,1000,100,0,0,0,5,0,50,2000,50000`);

      expect(result.errors).toEqual([]);
      expect(result.rowCount).toBe(1);
      expect(result.rows[0]).toMatchObject({ mrr: 1000, newMrr: 100, totalCustomers: 50, cash: 50_000 });
    });

    it('stamps the company id onto every imported row', () => {
      const { service } = build([]);

      const result = service.parseCsvPreview('c9', `${CSV_HEADER}\n2024-01-01,1000,0,0,0,0,0,0,50,2000,50000`);

      expect(result.rows[0].companyId).toBe('c9');
    });
  });
});
