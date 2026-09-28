import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { slugWithSuffix } from '../common/slug';
import { ROLE_RANK } from '../auth/permissions';

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
   * Refuses to act on the last owner, and refuses to let a non-OWNER grant a role
   * at or above its own. Either mistake leaves a company that nobody can
   * administer, which is a support incident and possibly a data-loss incident.
   *
   * Both checks live inside the transaction that performs the write, not in the
   * controller, so two concurrent demotions cannot both pass them. The controller
   * still checks the rank up front to return 403 without touching the database,
   * but that check is a convenience: reading the caller's role, then acting on a
   * membership that can change in between, is a TOCTOU window, and this
   * transaction is the one that actually has to hold.
   */
  async updateMemberRole(
    companyId: string,
    membershipId: string,
    role: MembershipRole,
    actorId: string,
    actorRole: MembershipRole,
  ): Promise<MemberSummary> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Member roles cannot be changed in demo mode');

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.companyMembership.findFirst({
        where: { id: membershipId, companyId },
        include: { user: true },
      });
      if (!target) throw new NotFoundException('Member not found');

      assertOutranks(actorRole, role);
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
   * Removes a member.
   *
   * Enforces two independent rules, both inside the transaction that does the
   * delete:
   *
   * 1. The caller must outrank the member being removed. `members:remove` is
   *    granted to ADMIN as well as OWNER, and without this an ADMIN could delete
   *    an OWNER's membership and lock the owner out of their own company. That
   *    directly contradicted the stated intent in `auth/permissions.ts` - "ADMIN
   *    ... cannot touch ownership, because those are the owner's to give" - which
   *    is the kind of comment that becomes a lie if the code does not enforce
   *    it. `PATCH /members/:id/role` checked the equivalent thing; this one
   *    simply omitted it.
   * 2. A company keeps at least one owner. That is a property of the tenant
   *    rather than of the caller, which is why it is a separate check.
   *
   * Check (1) is the reason `actorRole` is a parameter at all. Deriving the
   * caller's rank from the membership table would be no more authoritative than
   * passing it, and passing it makes the authority explicit at the call site.
   */
  async removeMember(companyId: string, membershipId: string, actorId: string, actorRole: MembershipRole): Promise<void> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Members cannot be removed in demo mode');

    await this.prisma.$transaction(async (tx) => {
      const target = await tx.companyMembership.findFirst({ where: { id: membershipId, companyId } });
      if (!target) throw new NotFoundException('Member not found');

      assertOutranks(actorRole, target.role);

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

/**
 * Whether `actorRole` may remove, demote, or promote a member whose role (or
 * proposed role) is `subjectRole`.
 *
 * Mirrors the controller's `assertOutranks` exactly - including the OWNER
 * exemption - so the early check and the transactional one cannot disagree
 * about who is allowed to do what. An OWNER may act on anything, because
 * ownership is the owner's to give and to take back.
 *
 * Equal rank is refused, not merely higher: an ADMIN cannot remove or
 * overwrite a peer ADMIN. `>=` rather than `>` is what makes that true, and it is
 * the whole reason this helper exists rather than a bare `ROLE_RANK` comparison
 * at each call site.
 */
function assertOutranks(actorRole: MembershipRole, subjectRole: MembershipRole): void {
  if (actorRole === MembershipRole.OWNER) return;
  if (ROLE_RANK[subjectRole] >= ROLE_RANK[actorRole]) {
    throw new ForbiddenException('You cannot act on a member at or above your own role');
  }
}

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
