/**
 * Schema-level guarantees, verified against a real migrated PostgreSQL database.
 *
 * These are the constraints added by hand in the baseline migration. Unit tests
 * cannot check them, because a Prisma schema is a description of intent while
 * these are the rules the server actually enforces. If one of these regresses,
 * the database will happily accept data the application assumes it cannot.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeApp, freshDb, makeApp, monthStart, prisma, uniqueEmail } from './harness';

const JAN = (day: number, month = 0) => new Date(Date.UTC(2026, month, day));

/** A snapshot row with every required column filled in; callers override one field. */
function snapshot(companyId: string, over: Record<string, unknown> = {}) {
  return {
    companyId,
    month: monthStart(0),
    mrr: 1000,
    burnRate: 800,
    cash: 5000,
    ...over,
  };
}

describe('database invariants', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => {
    await closeApp(app);
  });

  beforeEach(async () => {
    await freshDb();
  });

  /** A company with one OWNER, for tests that need a valid tenant. */
  async function seedCompany(slugPrefix = 'acme') {
    const company = await prisma.company.create({
      data: { name: 'Acme', slug: `${slugPrefix}-${Math.random().toString(36).slice(2, 8)}` },
    });
    const user = await prisma.user.create({
      data: { email: uniqueEmail(), passwordHash: 'x', name: 'Owner' },
    });
    await prisma.companyMembership.create({
      data: { companyId: company.id, userId: user.id, role: 'OWNER' },
    });
    return { company, user };
  }

  describe('month boundaries', () => {
    it('rejects a metric snapshot that is not the first of its month', async () => {
      const { company } = await seedCompany();
      await expect(prisma.metricSnapshot.create({ data: snapshot(company.id, { month: JAN(17) }) })).rejects.toThrow();

      // The first of the month is accepted, so the check is not simply
      // rejecting everything.
      await expect(
        prisma.metricSnapshot.create({ data: snapshot(company.id, { month: JAN(1) }) }),
      ).resolves.toBeTruthy();
    });

    it('rejects a customer signup month that is not the first of its month', async () => {
      const { company } = await seedCompany();
      await expect(
        prisma.customer.create({ data: { companyId: company.id, name: 'Late', signupMonth: JAN(9, 2) } }),
      ).rejects.toThrow();
    });

    it('rejects a monthly value dated off the first of the month', async () => {
      const { company } = await seedCompany();
      const customer = await prisma.customer.create({
        data: { companyId: company.id, name: 'Acme Ltd', signupMonth: monthStart(2) },
      });
      await expect(
        prisma.customerMonthlyValue.create({
          data: { companyId: company.id, customerId: customer.id, month: JAN(14, 1), mrr: 500 },
        }),
      ).rejects.toThrow(/month/i);
    });
  });

  describe('tenant isolation', () => {
    it('refuses a monthly value whose company does not match the customer’s', async () => {
      const { company: a } = await seedCompany('alpha');
      const { company: b } = await seedCompany('beta');
      const customerOfA = await prisma.customer.create({
        data: { companyId: a.id, name: 'A Customer', signupMonth: monthStart(1) },
      });

      // The customer belongs to A. Writing a monthly value for it under B is
      // exactly the cross-tenant leak the composite foreign key exists to stop.
      await expect(
        prisma.customerMonthlyValue.create({
          data: { companyId: b.id, customerId: customerOfA.id, month: monthStart(1), mrr: 100 },
        }),
      ).rejects.toThrow();
    });

    it('refuses a monthly value for a customer that does not exist', async () => {
      const { company } = await seedCompany();
      await expect(
        prisma.customerMonthlyValue.create({
          data: { companyId: company.id, customerId: 'no-such-customer', month: monthStart(0), mrr: 100 },
        }),
      ).rejects.toThrow();
    });

    it('refuses a second snapshot for the same company and month', async () => {
      const { company } = await seedCompany();
      await prisma.metricSnapshot.create({ data: snapshot(company.id, { month: JAN(1) }) });
      await expect(prisma.metricSnapshot.create({ data: snapshot(company.id, { month: JAN(1) }) })).rejects.toThrow();
    });

    it('refuses two monthly values for the same customer and month', async () => {
      const { company } = await seedCompany();
      const customer = await prisma.customer.create({
        data: { companyId: company.id, name: 'C', signupMonth: monthStart(2) },
      });
      const row = { companyId: company.id, customerId: customer.id, month: monthStart(1), mrr: 100 };
      await prisma.customerMonthlyValue.create({ data: row });
      await expect(prisma.customerMonthlyValue.create({ data: row })).rejects.toThrow();
    });
  });

  describe('churn consistency', () => {
    it('requires churnedAt exactly when status is CHURNED', async () => {
      const { company } = await seedCompany();

      // CHURNED with no date.
      await expect(
        prisma.customer.create({
          data: { companyId: company.id, name: 'Churned', signupMonth: monthStart(3), status: 'CHURNED' },
        }),
      ).rejects.toThrow(/churn/i);

      // ACTIVE but carrying a churn date: the two disagree.
      await expect(
        prisma.customer.create({
          data: {
            companyId: company.id,
            name: 'Active but has a date',
            signupMonth: monthStart(3),
            status: 'ACTIVE',
            churnedAt: monthStart(1),
          },
        }),
      ).rejects.toThrow(/churn/i);

      await expect(
        prisma.customer.create({
          data: {
            companyId: company.id,
            name: 'Consistent',
            signupMonth: monthStart(3),
            status: 'CHURNED',
            churnedAt: monthStart(1),
          },
        }),
      ).resolves.toBeTruthy();
    });
  });

  describe('runway thresholds', () => {
    it('refuses thresholds that are inverted', async () => {
      // green is the "comfortable" end and yellow the "worrying" end, so green
      // must be the larger number. Inverted here.
      await expect(
        prisma.company.create({
          data: { name: 'Bad', slug: 'bad-thresholds', runwayGreenMonths: 6, runwayYellowMonths: 18 },
        }),
      ).rejects.toThrow(/runway/i);
    });

    it('allows equal thresholds, which is a company with no caution band', async () => {
      // The constraint is yellow <= green, not <. Equal is a legitimate
      // configuration: every month below 9 is then red, with no amber.
      await expect(
        prisma.company.create({ data: { name: 'Equal', slug: 'equal-thresholds', runwayGreenMonths: 9, runwayYellowMonths: 9 } }),
      ).resolves.toBeTruthy();
    });

    it('refuses a non-positive threshold', async () => {
      await expect(
        prisma.company.create({ data: { name: 'Zero', slug: 'zero-threshold', runwayGreenMonths: 0 } }),
      ).rejects.toThrow(/runway/i);
    });

    it('accepts the defaults and an explicit ordered pair', async () => {
      await expect(prisma.company.create({ data: { name: 'Fine', slug: 'fine-thresholds' } })).resolves.toBeTruthy();
      await expect(
        prisma.company.create({ data: { name: 'Ordered', slug: 'ordered-thresholds', runwayGreenMonths: 12, runwayYellowMonths: 6 } }),
      ).resolves.toBeTruthy();
    });
  });

  describe('monetary amounts', () => {
    it('refuses negative MRR, cash or burn on a metric snapshot', async () => {
      const { company } = await seedCompany();
      for (const field of ['mrr', 'cash', 'burnRate'] as const) {
        await expect(
          prisma.metricSnapshot.create({ data: snapshot(company.id, { [field]: -1, month: JAN(1, field.length) }) }),
        ).rejects.toThrow();
      }
    });

    it('accepts a negative customer month, because a credit note does that', async () => {
      // Deliberately *not* constrained, unlike MetricSnapshot. A refund or
      // credit note legitimately makes one month of a customer's value
      // negative, and the invoice is what should decide that - not the schema.
      // This test exists so the next person to read the missing CHECK on
      // CustomerMonthlyValue and add one for consistency learns that the
      // asymmetry is intentional.
      const { company } = await seedCompany();
      const customer = await prisma.customer.create({
        data: { companyId: company.id, name: 'Refunded', signupMonth: monthStart(2) },
      });
      await expect(
        prisma.customerMonthlyValue.create({
          data: { companyId: company.id, customerId: customer.id, month: monthStart(1), mrr: -250 },
        }),
      ).resolves.toBeTruthy();
    });
  });

  describe('email normalisation', () => {
    it('refuses a user email that is not lower-cased and trimmed', async () => {
      await expect(
        prisma.user.create({ data: { email: 'NotLower@Example.COM ', passwordHash: 'x' } }),
      ).rejects.toThrow(/email/i);
    });

    it('refuses a non-normalised invite email', async () => {
      const { company, user } = await seedCompany();
      await expect(
        prisma.invite.create({
          data: {
            companyId: company.id,
            email: 'Mixed@Example.COM',
            role: 'VIEWER',
            token: uniqueEmail('tok'),
            invitedById: user.id,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ).rejects.toThrow(/email/i);
    });

    it('accepts an already-normalised email', async () => {
      await expect(prisma.user.create({ data: { email: uniqueEmail(), passwordHash: 'x' } })).resolves.toBeTruthy();
    });
  });

  describe('pending invites', () => {
    const in14Days = () => new Date(Date.now() + 14 * 86_400_000);

    it('allows only one pending invite per company and email', async () => {
      const { company, user } = await seedCompany();
      const email = uniqueEmail('invitee');
      const invite = {
        companyId: company.id,
        email,
        role: 'VIEWER' as const,
        token: uniqueEmail('tok'),
        invitedById: user.id,
        expiresAt: in14Days(),
      };

      await expect(prisma.invite.create({ data: invite })).resolves.toBeTruthy();
      await expect(prisma.invite.create({ data: { ...invite, token: uniqueEmail('tok') } })).rejects.toThrow();

      // Revoking frees the slot. A revoked invite is not pending, and blocking
      // that would leave a company permanently unable to re-invite somebody
      // they had already removed.
      const created = await prisma.invite.findFirstOrThrow({ where: { email } });
      await prisma.invite.update({ where: { id: created.id }, data: { status: 'REVOKED' } });
      await expect(prisma.invite.create({ data: { ...invite, token: uniqueEmail('tok') } })).resolves.toBeTruthy();
    });

    it('does not treat an accepted invite as pending', async () => {
      const { company, user } = await seedCompany();
      const base = { companyId: company.id, email: uniqueEmail('invitee'), role: 'VIEWER' as const, invitedById: user.id, expiresAt: in14Days() };
      await prisma.invite.create({ data: { ...base, token: uniqueEmail('t'), status: 'ACCEPTED', respondedAt: new Date() } });
      await expect(prisma.invite.create({ data: { ...base, token: uniqueEmail('t') } })).resolves.toBeTruthy();
    });
  });

  describe('expiry ordering', () => {
    it('refuses an invite that expires before it was created', async () => {
      const { company, user } = await seedCompany();
      await expect(
        prisma.invite.create({
          data: {
            companyId: company.id,
            email: uniqueEmail(),
            role: 'VIEWER',
            token: uniqueEmail('t'),
            invitedById: user.id,
            createdAt: new Date('2026-06-01'),
            expiresAt: new Date('2026-05-01'),
          },
        }),
      ).rejects.toThrow(/expire/i);
    });
  });

  describe('share links', () => {
    it('refuses a negative view count', async () => {
      const { company, user } = await seedCompany();
      await expect(
        prisma.shareLink.create({
          data: {
            companyId: company.id,
            token: uniqueEmail('share'),
            createdById: user.id,
            expiresAt: new Date(Date.now() + 86_400_000),
            viewCount: -1,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('updatedAt triggers', () => {
    it('advances updatedAt on a raw UPDATE, which Prisma does not manage', async () => {
      const { company } = await seedCompany();
      const before = company.updatedAt;

      // Deliberately raw: any future code that writes with $executeRaw must not
      // be able to leave a stale updatedAt behind.
      await prisma.$executeRawUnsafe(`UPDATE "Company" SET "name" = $1 WHERE id = $2`, 'Renamed', company.id);

      const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
      expect(after.name).toBe('Renamed');
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('readiness', () => {
    /**
     * `/health/ready` is the one endpoint that runs a raw query on every call,
     * so it is the canary for "can this process actually reach the database".
     * main.ts excludes it from the global prefix, hence the unprefixed path.
     */
    it('reports the database as reachable', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info.database.status).toBe('up');
    });

    it('reports the API mode honestly', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      // This suite runs with ENABLE_DATABASE=true. If that ever changes, this
      // assertion is what tells us the suite is no longer testing its subject.
      expect(res.body.info.api.mode).toBe('database');
    });
  });
});
