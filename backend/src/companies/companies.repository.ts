import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { slugWithSuffix } from '../common/slug';

export interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface CompanySettings {
  id: string;
  name: string;
  slug: string;
  currency: string;
  runwayGreenMonths: number;
  runwayYellowMonths: number;
}

export interface MemberSummary {
  id: string;
  name: string;
  email: string;
  role: MembershipRole;
  joinedAt: string;
  /** True for the signed-in member, so the UI can mark "you" without comparing ids. */
  isSelf: boolean;
}

const DEMO_COMPANIES: CompanySummary[] = [
  { id: 'demo-company-steady', name: 'Northlane Analytics', slug: 'northlane-analytics', currency: 'USD' },
  { id: 'demo-company-hypergrowth', name: 'Fathom Metrics', slug: 'fathom-metrics', currency: 'USD' },
  { id: 'demo-company-struggling', name: 'Ledger & Vine', slug: 'ledger-and-vine', currency: 'USD' },
];

// Static demo membership roster for BYPASS_AUTH mode. Mirrors the real role
// matrix so demo mode cannot demonstrate a privilege the product withholds.
const DEMO_MEMBERS: MemberSummary[] = [
  { id: 'm-owner', name: 'Demo Owner', email: 'owner@runway.demo', role: MembershipRole.OWNER, joinedAt: '2024-01-02T00:00:00.000Z', isSelf: true },
  { id: 'm-analyst', name: 'Ada Analyst', email: 'analyst@runway.demo', role: MembershipRole.ANALYST, joinedAt: '2024-02-15T00:00:00.000Z', isSelf: false },
  { id: 'm-viewer', name: 'Vic Viewer', email: 'viewer@runway.demo', role: MembershipRole.VIEWER, joinedAt: '2024-03-01T00:00:00.000Z', isSelf: false },
];

// In-memory settings store for demo/BYPASS_AUTH mode, keyed by companyId.
const demoSettings = new Map<string, CompanySettings>(
  DEMO_COMPANIES.map((c) => [
    c.id,
    { id: c.id, name: c.name, slug: c.slug, currency: c.currency, runwayGreenMonths: 12, runwayYellowMonths: 6 },
  ]),
);

@Injectable()
export class CompaniesRepository {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findForUser(userId: string): Promise<CompanySummary[]> {
    if (env.ENABLE_DATABASE) {
      const memberships = await this.prisma.companyMembership.findMany({
        where: { userId },
        include: { company: true },
        orderBy: { createdAt: 'asc' },
      });
      return memberships.map((m) => toSummary(m.company));
    }
    return DEMO_COMPANIES;
  }

  async findMembers(companyId: string, selfId?: string): Promise<MemberSummary[]> {
    if (env.ENABLE_DATABASE) {
      const memberships = await this.prisma.companyMembership.findMany({
        where: { companyId },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      });
      return memberships.map((m) => ({
        id: m.id,
        name: m.user.name ?? m.user.email,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
        isSelf: m.userId === selfId,
      }));
    }
    return DEMO_MEMBERS.map((m) => ({ ...m, isSelf: m.id === 'm-owner' }));
  }

  async getSettings(companyId: string): Promise<CompanySettings> {
    if (env.ENABLE_DATABASE) {
      const c = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (!c) throw new NotFoundException('Company not found');
      return toSettings(c);
    }
    return demoSettings.get(companyId) ?? { id: companyId, name: 'Demo Company', slug: 'demo', currency: 'USD', runwayGreenMonths: 12, runwayYellowMonths: 6 };
  }

  /**
   * Updates company settings and the audit row describing the change in one
   * transaction.
   *
   * The previous version wrote the company, then wrote the audit entry, and
   * swallowed failures from the second. A crash between the two left a changed
   * company with no record of who changed it, and the audit trail quietly lied
   * about the state of the tenant. Both writes now share a transaction.
   */
  async updateSettings(
    companyId: string,
    patch: Partial<Pick<CompanySettings, 'name' | 'runwayGreenMonths' | 'runwayYellowMonths' | 'currency'>>,
    actorId: string,
  ): Promise<CompanySettings> {
    const before = await this.getSettings(companyId);
    const next = { ...before, ...patch };

    // Validated here as well as in the DTO so the rule holds no matter which
    // caller gets here. The database CHECK is the third and final backstop.
    //
    // These are BadRequest rather than a bare RangeError on purpose. A generic
    // error becomes a 500, which tells the client the server broke, tells the
    // operator to look for a fault that does not exist, and quietly buries a
    // typo in a request body among genuine incidents.
    if (next.runwayYellowMonths > next.runwayGreenMonths) {
      throw new BadRequestException('The warning threshold cannot be longer than the healthy one');
    }
    if (next.runwayGreenMonths <= 0 || next.runwayYellowMonths <= 0) {
      throw new BadRequestException('Runway thresholds must be at least one month');
    }
    if (next.currency && !/^[A-Z]{3}$/.test(next.currency)) {
      throw new BadRequestException('Currency must be a 3-letter code such as USD');
    }

    if (env.ENABLE_DATABASE) {
      const data: Prisma.CompanyUpdateInput = {
        name: next.name,
        currency: next.currency,
        runwayGreenMonths: next.runwayGreenMonths,
        runwayYellowMonths: next.runwayYellowMonths,
      };
      const updated = await this.prisma.$transaction(async (tx) => {
        const c = await tx.company.update({ where: { id: companyId }, data });
        await this.audit.recordIn(tx, {
          companyId,
          entityId: companyId,
          entityType: 'COMPANY_SETTINGS',
          action: 'UPDATED',
          actorId,
          diff: { before, after: next },
        });
        return c;
      });
      return toSettings(updated);
    }

    demoSettings.set(companyId, next);
    return next;
  }

  /**
   * Changes a member's role.
   *
   * Refuses to act on the last owner, and refuses to let an ADMIN act on an
   * OWNER. Either mistake leaves a company that nobody can administer, which is
   * a support incident and possibly a data-loss incident. The check and the
   * write share a transaction so two concurrent demotions cannot both pass it.
   */
  async updateMemberRole(
    companyId: string,
    membershipId: string,
    role: MembershipRole,
    actorId: string,
  ): Promise<MemberSummary> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Member roles cannot be changed in demo mode');

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.companyMembership.findFirst({
        where: { id: membershipId, companyId },
        include: { user: true },
      });
      if (!target) throw new NotFoundException('Member not found');

      if (target.role === MembershipRole.OWNER && role !== MembershipRole.OWNER) {
        throw new ConflictException('Promote another owner before changing this one');
      }

      await this.audit.recordIn(tx, {
        companyId,
        entityId: target.userId,
        entityType: 'MEMBER',
        action: 'UPDATED',
        actorId,
        diff: { email: target.user.email, role: { from: target.role, to: role } },
      });

      const updated = await tx.companyMembership.update({ where: { id: membershipId }, data: { role } });
      return {
        id: updated.id,
        name: target.user.name ?? target.user.email,
        email: target.user.email,
        role: updated.role,
        joinedAt: updated.createdAt.toISOString(),
        isSelf: target.userId === actorId,
      };
    });
  }

  /**
   * Removes a member. The caller has already been checked for
   * `members:remove`; this enforces the owner invariant, which is a property
   * of the tenant rather than of the caller.
   */
  async removeMember(companyId: string, membershipId: string, actorId: string): Promise<void> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Members cannot be removed in demo mode');

    await this.prisma.$transaction(async (tx) => {
      const target = await tx.companyMembership.findFirst({ where: { id: membershipId, companyId } });
      if (!target) throw new NotFoundException('Member not found');

      if (target.role === MembershipRole.OWNER) {
        const owners = await tx.companyMembership.count({ where: { companyId, role: MembershipRole.OWNER } });
        // Refusing here rather than in a trigger: the caller needs to be told
        // which action to take next, and a constraint violation cannot say that.
        if (owners <= 1) {
          throw new ConflictException('A company must keep at least one owner. Promote someone else first.');
        }
      }

      await tx.companyMembership.delete({ where: { id: membershipId } });
      await this.audit.recordIn(tx, {
        companyId,
        entityId: target.userId,
        entityType: 'MEMBER',
        action: 'DELETED',
        actorId,
        diff: { userId: target.userId, role: target.role },
      });
    });
  }
}

type CompanyRow = Prisma.CompanyGetPayload<Record<string, never>>;

function toSummary(c: CompanyRow): CompanySummary {
  return { id: c.id, name: c.name, slug: c.slug, currency: c.currency };
}

function toSettings(c: CompanyRow): CompanySettings {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency,
    runwayGreenMonths: c.runwayGreenMonths,
    runwayYellowMonths: c.runwayYellowMonths,
  };
}

export { slugWithSuffix };
