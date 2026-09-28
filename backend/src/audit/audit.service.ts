import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { incrementCounter } from '../common/observability/counters';
import { env } from '../config/env';

export type { AuditAction, AuditEntityType };

/** The subset of PrismaService that a transaction exposes, and the only thing audit writes ever need. */
export type AuditTx = Prisma.TransactionClient;

export interface ActivityItem {
  id: string;
  entityType: AuditEntityType;
  action: AuditAction;
  changedBy: string;
  changedAt: string;
}

export interface RecordAuditInput {
  companyId: string;
  entityId: string;
  entityType: AuditEntityType;
  action: AuditAction;
  /** The acting user's id. */
  actorId: string;
  diff?: unknown;
}

/** Human-readable phrasing for the activity feed, kept next to the enum it renders. */
const ACTION_PHRASES: Record<AuditAction, string> = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  IMPORTED: 'imported',
  INVITED: 'invited',
  ACCEPTED: 'accepted',
  REVOKED: 'revoked',
  GENERATED: 'generated',
  SHARED: 'shared',
  VIEWED: 'viewed',
};

const ENTITY_PHRASES: Record<AuditEntityType, string> = {
  COMPANY_SETTINGS: 'company settings',
  MEMBER: 'a team member',
  CUSTOMER: 'a customer',
  METRIC_SNAPSHOT: 'a monthly snapshot',
  INVITE: 'an invitation',
  REPORT: 'the investor update',
  SHARE_LINK: 'a share link',
  API_KEY: 'an API key',
};

export function describeAudit(input: { entityType: AuditEntityType; action: AuditAction }): string {
  return `${ACTION_PHRASES[input.action]} ${ENTITY_PHRASES[input.entityType]}`;
}

// In-memory feed for demo/BYPASS_AUTH mode, seeded with a few plausible
// events so the Notifications panel isn't empty on first load.
const demoFeed: Record<string, ActivityItem[]> = {
  'demo-company-steady': [
    {
      id: 'a1',
      entityType: 'METRIC_SNAPSHOT',
      action: 'UPDATED',
      changedBy: 'Demo Owner',
      changedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
      id: 'a2',
      entityType: 'INVITE',
      action: 'INVITED',
      changedBy: 'Demo Owner',
      changedAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    },
    {
      id: 'a3',
      entityType: 'REPORT',
      action: 'GENERATED',
      changedBy: 'Demo Owner',
      changedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    },
  ],
  'demo-company-hypergrowth': [
    {
      id: 'a4',
      entityType: 'METRIC_SNAPSHOT',
      action: 'IMPORTED',
      changedBy: 'Demo Owner',
      changedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
  ],
  'demo-company-struggling': [
    {
      id: 'a5',
      entityType: 'METRIC_SNAPSHOT',
      action: 'UPDATED',
      changedBy: 'Demo Owner',
      changedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    },
  ],
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Append an audit entry *inside* a caller's transaction.
   *
   * This is the correct way to write to the trail. Passing the transaction
   * client means the audit row and the change it describes commit together or
   * not at all, which is the whole point of having a trail: there is no longer
   * a window where the numbers changed and the log says otherwise, and no
   * orphan entry describing a change that rolled back.
   *
   * Note that it does not swallow errors, unlike `record`. Inside a
   * transaction, catching a failure and continuing would commit a change with
   * no audit row - precisely the gap this method exists to close. If the audit
   * insert fails, the whole transaction fails and the caller retries.
   */
  recordIn(tx: AuditTx, input: RecordAuditInput): Promise<unknown> {
    return tx.auditLog.create({
      data: {
        companyId: input.companyId,
        entityId: input.entityId,
        entityType: input.entityType,
        action: input.action,
        changedBy: input.actorId,
        diff: input.diff as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });
  }

  /**
   * Standalone audit write, for the rare case where there is no mutation to be
   * atomic with (a public share-link view, a rejected invite).
   *
   * Still non-throwing: here there is no data change to protect, so failing the
   * request over a bookkeeping row would be the wrong trade. Failures are
   * logged at error level so they are alertable.
   */
  async record(input: RecordAuditInput): Promise<void> {
    if (!env.ENABLE_DATABASE) return; // no-op in demo mode

    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: input.companyId,
          entityId: input.entityId,
          entityType: input.entityType,
          action: input.action,
          changedBy: input.actorId,
          diff: input.diff as Prisma.InputJsonValue | undefined,
        },
        select: { id: true },
      });
    } catch (err) {
      // Counted as well as logged. The log line is what an operator reads after
      // the fact; the counter is what tells them the trail stopped while
      // nothing was obviously broken, which is the failure this method's own
      // comment warns about — a trail that quietly stops recording looks exactly
      // like a healthy one until someone goes looking for an entry that is not
      // there.
      incrementCounter('audit_write_failed', { entityType: input.entityType, action: input.action });
      this.logger.error({ err, ...input }, 'Failed to write audit log entry');
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
      return rows.map(toActivityItem);
    }
    return demoFeed[companyId] ?? [];
  }

  /** Paginated + optionally entityType-filtered feed for the full Activity page. */
  async list(
    companyId: string,
    opts: { page?: number; pageSize?: number; entityType?: string },
  ): Promise<{ items: ActivityItem[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 15));
    const entityType = asEntityType(opts.entityType);

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
      return { items: rows.map(toActivityItem), total, page, pageSize };
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

type AuditRow = Prisma.AuditLogGetPayload<{ include: { user: true } }>;

function toActivityItem(r: AuditRow): ActivityItem {
  return {
    id: r.id,
    entityType: r.entityType,
    action: r.action,
    changedBy: r.user?.name ?? r.user?.email ?? r.changedBy,
    changedAt: r.changedAt.toISOString(),
  };
}

/** The filter arrives as a query string, so it is validated rather than trusted. */
function asEntityType(value: string | undefined): AuditEntityType | undefined {
  if (!value) return undefined;
  return (Object.values(AuditEntityType) as string[]).includes(value) ? (value as AuditEntityType) : undefined;
}
