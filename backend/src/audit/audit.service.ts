import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';

export interface ActivityItem {
  id: string;
  entityType: string;
  action: string;
  changedBy: string;
  changedAt: string;
}

/**
 * Closed sets rather than free strings: an audit trail nobody can query is
 * worthless, and typos in `action` silently create unscannable buckets.
 */
export type AuditEntityType =
  | 'MetricSnapshot'
  | 'Customer'
  | 'CohortEntry'
  | 'Company'
  | 'CompanySettings'
  | 'CompanyMembership'
  | 'InvestorInvite'
  | 'ShareLink'
  | 'Report'
  | 'User';

export type AuditAction = 'created' | 'updated' | 'deleted' | 'imported' | 'generated' | 'shared' | 'invited';

export interface RecordAuditInput {
  companyId: string;
  entityId: string;
  entityType: AuditEntityType;
  action: AuditAction;
  /** The acting user's id. Falls back to the bypass demo user in demo mode. */
  actorId: string;
  diff?: unknown;
}

// In-memory feed for demo/BYPASS_AUTH mode, seeded with a few plausible
// events so the Notifications panel isn't empty on first load.
const demoFeed: Record<string, ActivityItem[]> = {
  'demo-company-steady': [
    { id: 'a1', entityType: 'MetricSnapshot', action: 'added snapshot for last month', changedBy: 'Demo Founder', changedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'a2', entityType: 'InvestorInvite', action: 'invited an investor', changedBy: 'Demo Founder', changedAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString() },
    { id: 'a3', entityType: 'Report', action: 'generated the investor update PDF', changedBy: 'Demo Founder', changedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() },
  ],
  'demo-company-hypergrowth': [
    { id: 'a4', entityType: 'MetricSnapshot', action: 'imported 6 snapshots via CSV', changedBy: 'Demo Founder', changedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() },
  ],
  'demo-company-struggling': [
    { id: 'a5', entityType: 'MetricSnapshot', action: 'added snapshot for last month', changedBy: 'Demo Founder', changedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() },
  ],
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Append-only trail of every state change in a company.
   *
   * Deliberately does not throw. A failed audit insert must not roll back or
   * 500 a founder's saved month — the data change already happened, and
   * losing it because bookkeeping failed is strictly worse. Failures are
   * logged at error level with full context so they are alertable, and the
   * reconciler can backfill. Phase 2 moves these writes into the same
   * transaction as the mutation they describe, which closes the gap properly.
   */
  async record(input: RecordAuditInput): Promise<void> {
    if (!env.ENABLE_DATABASE) return; // no-op in demo mode

    const { companyId, entityId, entityType, action, actorId, diff } = input;
    try {
      await this.prisma.auditLog.create({
        data: { companyId, entityId, entityType, action, changedBy: actorId, diff: diff as never },
      });
    } catch (err) {
      this.logger.error(
        { err, companyId, entityId, entityType, action, actorId },
        'Failed to write audit log entry',
      );
    }
  }

  async recent(companyId: string): Promise<ActivityItem[]> {
    if (env.ENABLE_DATABASE) {
      const rows = await this.prisma.auditLog.findMany({
        where: { companyId },
        orderBy: { changedAt: 'desc' },
        take: 20,
        include: { user: true },
      });
      return rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        action: r.action,
        changedBy: r.user?.name ?? r.user?.email ?? r.changedBy,
        changedAt: r.changedAt.toISOString(),
      }));
    }
    return demoFeed[companyId] ?? [];
  }

  /** Paginated + optionally entityType-filtered feed for the full Activity page. */
  async list(companyId: string, opts: { page?: number; pageSize?: number; entityType?: string }): Promise<{ items: ActivityItem[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 15));
    const entityType = opts.entityType || undefined;

    if (env.ENABLE_DATABASE) {
      const where = { companyId, ...(entityType ? { entityType } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          orderBy: { changedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { user: true },
        }),
        this.prisma.auditLog.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          entityType: r.entityType,
          action: r.action,
          changedBy: r.user?.name ?? r.user?.email ?? r.changedBy,
          changedAt: r.changedAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    }

    let feed = demoFeed[companyId] ?? [];
    if (entityType) feed = feed.filter((i) => i.entityType === entityType);
    return {
      items: feed.slice((page - 1) * pageSize, page * pageSize),
      total: feed.length,
      page,
      pageSize,
    };
  }
}
