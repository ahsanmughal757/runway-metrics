import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';

export interface CompanySummary {
  id: string;
  name: string;
  persona?: string | null;
}

export interface CompanySettings {
  id: string;
  name: string;
  runwayGreenMonths: number;
  runwayYellowMonths: number;
}

const DEMO_COMPANIES: CompanySummary[] = [
  { id: 'demo-company-steady', name: 'Northlane Analytics', persona: 'steady' },
  { id: 'demo-company-hypergrowth', name: 'Fathom Metrics', persona: 'hypergrowth' },
  { id: 'demo-company-struggling', name: 'Ledger & Vine', persona: 'struggling' },
];

// In-memory settings store for demo/BYPASS_AUTH mode, keyed by companyId.
const demoSettings = new Map<string, CompanySettings>(
  DEMO_COMPANIES.map((c) => [c.id, { id: c.id, name: c.name, runwayGreenMonths: 12, runwayYellowMonths: 6 }]),
);

@Injectable()
export class CompaniesRepository {
  constructor(private prisma: PrismaService) {}

  async findForUser(userId: string): Promise<CompanySummary[]> {
    if (env.ENABLE_DATABASE) {
      const memberships = await this.prisma.companyMembership.findMany({
        where: { userId },
        include: { company: true },
      });
      return memberships.map((m) => ({ id: m.company.id, name: m.company.name, persona: m.company.persona }));
    }
    return DEMO_COMPANIES;
  }

  async getSettings(companyId: string): Promise<CompanySettings> {
    if (env.ENABLE_DATABASE) {
      const c = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      return { id: c.id, name: c.name, runwayGreenMonths: c.runwayGreenMonths, runwayYellowMonths: c.runwayYellowMonths };
    }
    return demoSettings.get(companyId) ?? { id: companyId, name: 'Demo Company', runwayGreenMonths: 12, runwayYellowMonths: 6 };
  }

  async updateSettings(companyId: string, patch: Partial<Pick<CompanySettings, 'name' | 'runwayGreenMonths' | 'runwayYellowMonths'>>): Promise<CompanySettings> {
    if (env.ENABLE_DATABASE) {
      const c = await this.prisma.company.update({ where: { id: companyId }, data: patch });
      return { id: c.id, name: c.name, runwayGreenMonths: c.runwayGreenMonths, runwayYellowMonths: c.runwayYellowMonths };
    }
    const current = await this.getSettings(companyId);
    const next = { ...current, ...patch };
    demoSettings.set(companyId, next);
    return next;
  }
}
