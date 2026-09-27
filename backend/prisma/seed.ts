/**
 * Seeds three demo companies with 24 months of snapshots and a year of
 * per-customer cohort data.
 *
 * Safe to run repeatedly: companies and memberships are upserted by slug and
 * email, snapshots by (company, month), and customers by (company, externalId).
 * The previous version created companies unconditionally, so every run left
 * another three orphaned tenants behind.
 */
import { PrismaClient, MembershipRole, CustomerStatus, AuditEntityType, AuditAction } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { allPersonaKeys, generateCohorts, generateSnapshots, personaConfig } from '../src/fake-data/generator';
import { slugify } from '../src/common/slug';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo-password-123';

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const [founder, analyst, viewer] = await Promise.all([
    upsertUser('demo.owner@runway.local', passwordHash, 'Demo Owner'),
    upsertUser('demo.analyst@runway.local', passwordHash, 'Ada Analyst'),
    upsertUser('demo.viewer@runway.local', passwordHash, 'Vic Viewer'),
  ]);

  for (const personaKey of allPersonaKeys()) {
    const cfg = personaConfig(personaKey);
    const company = await prisma.company.upsert({
      where: { slug: slugify(cfg.companyName) },
      create: { name: cfg.companyName, slug: slugify(cfg.companyName) },
      update: { name: cfg.companyName },
    });

    // One owner, one analyst, one viewer: the seeded tenant demonstrates the
    // whole role matrix, so the demo is not just "the owner can do everything".
    await Promise.all([
      upsertMembership(founder.id, company.id, MembershipRole.OWNER),
      upsertMembership(analyst.id, company.id, MembershipRole.ANALYST),
      upsertMembership(viewer.id, company.id, MembershipRole.VIEWER),
    ]);

    // One transaction per company: a seed that half-succeeds leaves a company
    // with a membership and no numbers, which looks like a product bug.
    await prisma.$transaction(async (tx) => {
      const snapshots = generateSnapshots(personaKey, 24);
      for (const s of snapshots) {
        await tx.metricSnapshot.upsert({
          where: { companyId_month: { companyId: company.id, month: s.month } },
          create: {
            companyId: company.id,
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
          },
          update: {
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
          },
        });
      }
    });

    await seedCustomers(company.id, personaKey);

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        entityId: company.id,
        entityType: AuditEntityType.COMPANY_SETTINGS,
        action: AuditAction.CREATED,
        changedBy: founder.id,
        diff: { name: company.name, persona: personaKey, seeded: true },
      },
    });
  }

  console.log('Seeded 3 demo companies (24 months + 12 cohorts each).');
  console.log(`Sign in with any of: demo.owner@ / demo.analyst@ / demo.viewer@runway.local`);
  console.log(`Password: ${DEMO_PASSWORD}`);
}

async function seedCustomers(companyId: string, personaKey: Parameters<typeof generateCohorts>[0]) {
  const customers = generateCohorts(personaKey, 12, 12);

  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: { companyId_externalId: { companyId, externalId: c.externalId } },
      create: {
        companyId,
        externalId: c.externalId,
        name: `Customer ${c.externalId.slice(0, 8)}`,
        status: c.status === 'churned' ? CustomerStatus.CHURNED : CustomerStatus.ACTIVE,
        signupMonth: c.signupMonth,
        churnedAt: c.churnedAt,
      },
      update: {
        status: c.status === 'churned' ? CustomerStatus.CHURNED : CustomerStatus.ACTIVE,
        churnedAt: c.churnedAt,
      },
    });

    for (const value of c.values) {
      await prisma.customerMonthlyValue.upsert({
        where: { customerId_month: { customerId: customer.id, month: value.month } },
        create: { companyId, customerId: customer.id, month: value.month, mrr: value.mrr },
        update: { mrr: value.mrr },
      });
    }
  }
}

async function upsertUser(email: string, passwordHash: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name, emailVerifiedAt: new Date() },
    update: { name },
  });
}

async function upsertMembership(userId: string, companyId: string, role: MembershipRole) {
  return prisma.companyMembership.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: { userId, companyId, role },
    update: { role },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
