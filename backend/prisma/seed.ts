/**
 * Seeds Postgres with all three personas' full history — snapshots + cohort
 * entries — using the exact same generator as the ENABLE_DATABASE=false
 * in-memory path, so demo data is identical in shape either way.
 *
 * Run with: npm run seed  (requires ENABLE_DATABASE=true and a migrated DB)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { allPersonaKeys, generateCohorts, generateSnapshots, personaConfig } from '../src/fake-data/generator';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Runway demo data...');

  const founder = await prisma.user.upsert({
    where: { email: 'demo.founder@runway.local' },
    update: {},
    create: {
      email: 'demo.founder@runway.local',
      passwordHash: await bcrypt.hash('demo-password-123', 12),
      name: 'Demo Founder',
    },
  });

  const investor = await prisma.user.upsert({
    where: { email: 'demo.investor@runway.local' },
    update: {},
    create: {
      email: 'demo.investor@runway.local',
      passwordHash: await bcrypt.hash('demo-password-123', 12),
      name: 'Demo Investor',
    },
  });

  for (const key of allPersonaKeys()) {
    const cfg = personaConfig(key);

    const company = await prisma.company.create({
      data: { name: cfg.companyName, persona: key },
    });

    await prisma.companyMembership.create({
      data: { userId: founder.id, companyId: company.id, role: 'FOUNDER' },
    });
    await prisma.companyMembership.create({
      data: { userId: investor.id, companyId: company.id, role: 'INVESTOR' },
    });

    const snapshots = generateSnapshots(key, 24);
    for (const s of snapshots) {
      await prisma.metricSnapshot.create({
        data: {
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
      });
    }

    const cohorts = generateCohorts(key, 12, 12);
    for (const c of cohorts) {
      await prisma.cohortEntry.create({
        data: {
          companyId: company.id,
          customerId: c.customerId,
          signupMonth: c.signupMonth,
          status: c.status,
          mrrByMonth: c.mrrByMonth,
        },
      });
    }

    console.log(`  ${cfg.companyName} (${key}): ${snapshots.length} snapshots, ${cohorts.length} cohort entries`);
  }

  console.log('Done. Demo logins: demo.founder@runway.local / demo.investor@runway.local, password: demo-password-123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
