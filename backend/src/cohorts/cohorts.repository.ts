import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { generateCohorts } from '../fake-data/generator';
import { PersonaKey } from '../fake-data/personas';

const DEMO_COMPANY_PERSONAS: Record<string, PersonaKey> = {
  'demo-company-steady': 'steady',
  'demo-company-hypergrowth': 'hypergrowth',
  'demo-company-struggling': 'struggling',
};

/**
 * Cohort data is fake-data-only for v1 per the PRD ("real customer-level
 * ingestion is v2"). Even in ENABLE_DATABASE mode, this reads whatever was
 * seeded — there is no write/edit path for cohorts in v1.
 *
 * In database mode this returns exactly what is stored, including nothing. A
 * real company with no cohort rows must render an empty state: it must never
 * be handed generated demo data that looks like its own customers.
 */
@Injectable()
export class CohortsRepository {
  constructor(private prisma: PrismaService) {}

  async findByCompany(companyId: string) {
    if (env.ENABLE_DATABASE) {
      const rows = await this.prisma.cohortEntry.findMany({
        where: { companyId },
        orderBy: [{ signupMonth: 'asc' }, { customerId: 'asc' }],
      });
      return rows.map((r) => ({
        customerId: r.customerId,
        signupMonth: r.signupMonth,
        status: r.status as 'active' | 'churned',
        mrrByMonth: r.mrrByMonth as Record<string, number>,
      }));
    }

    const persona = DEMO_COMPANY_PERSONAS[companyId] ?? 'steady';
    return generateCohorts(persona, 12, 12);
  }
}
