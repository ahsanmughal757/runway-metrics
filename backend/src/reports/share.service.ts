import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';

export const SHARE_TTL_DAYS = 7;
const TOKEN_TTL_MS = SHARE_TTL_DAYS * 86_400_000;

export interface ShareLinkSummary {
  token: string;
  url: string;
  expiresAt: string;
  createdAt: string;
  viewCount: number;
  isRevoked: boolean;
}

/** Demo-mode links live only as long as the process. */
const demoStore = new Map<string, { companyId: string; createdAt: number }>();

/**
 * Share links are read by people who are not members, so the link itself is the
 * credential. That makes three properties non-negotiable, and the previous
 * in-memory implementation could offer none of them:
 *
 *  - it must survive a restart, or links handed to investors die on every deploy
 *  - it must be revocable, or a link shared once is shared forever
 *  - it must expire, or a leaked URL is permanent access
 *
 * All three are now columns on a row rather than properties of a running
 * process, which is why this moved into the database.
 */
@Injectable()
export class ShareService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(companyId: string, actorId: string, ttlDays = SHARE_TTL_DAYS): Promise<ShareLinkSummary> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);
    // 32 bytes of entropy in base64url. This is the only thing standing between
    // a leaked URL and a stranger reading a company's financials, so it is not
    // derived from anything guessable.
    const token = randomBytes(32).toString('base64url');

    if (!env.ENABLE_DATABASE) {
      demoStore.set(token, { companyId, createdAt: now.getTime() });
      return { token, url: `/share/${token}`, expiresAt: expiresAt.toISOString(), createdAt: now.toISOString(), viewCount: 0, isRevoked: false };
    }

    return this.prisma.$transaction(async (tx) => {
      const link = await tx.shareLink.create({
        data: { companyId, token, createdById: actorId, expiresAt, createdAt: now },
      });
      await this.audit.recordIn(tx, {
        companyId,
        entityId: link.id,
        entityType: 'SHARE_LINK',
        action: 'SHARED',
        actorId,
        diff: { expiresAt: expiresAt.toISOString() },
      });
      return toSummary(link, token);
    });
  }

  /**
   * Resolves a token to its company, or null if the link is unknown, expired or
   * revoked.
   *
   * The view counter is bumped here rather than in a separate call so that a
   * burst of traffic from one leaked link is visible without an extra write per
   * request being a correctness requirement.
   */
  async resolve(token: string): Promise<string | null> {
    if (!env.ENABLE_DATABASE) {
      const record = demoStore.get(token);
      if (!record) return null;
      if (Date.now() - record.createdAt > TOKEN_TTL_MS) {
        demoStore.delete(token);
        return null;
      }
      return record.companyId;
    }

    const link = await this.prisma.shareLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now()) return null;

    await this.prisma.shareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    return link.companyId;
  }

  /** Lists the company's own links, newest first, so they can be revoked. */
  async list(companyId: string): Promise<ShareLinkSummary[]> {
    if (!env.ENABLE_DATABASE) {
      return Array.from(demoStore.entries())
        .filter(([, r]) => r.companyId === companyId)
        .map(([token, r]) => ({
          token,
          url: `/share/${token}`,
          expiresAt: new Date(r.createdAt + TOKEN_TTL_MS).toISOString(),
          createdAt: new Date(r.createdAt).toISOString(),
          viewCount: 0,
          isRevoked: false,
        }));
    }

    const links = await this.prisma.shareLink.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return links.map((l) => toSummary(l, l.token));
  }

  async revoke(companyId: string, id: string, actorId: string): Promise<void> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Share links cannot be revoked in demo mode');

    await this.prisma.$transaction(async (tx) => {
      const link = await tx.shareLink.findFirst({ where: { id, companyId } });
      if (!link) throw new NotFoundException('Share link not found');
      if (link.revokedAt) return;

      await tx.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.recordIn(tx, {
        companyId,
        entityId: id,
        entityType: 'SHARE_LINK',
        action: 'REVOKED',
        actorId,
        diff: { token: `${link.token.slice(0, 8)}...` },
      });
    });
  }
}

type ShareLinkRow = {
  id: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
  revokedAt: Date | null;
};

function toSummary(row: ShareLinkRow, token: string): ShareLinkSummary {
  return {
    token,
    url: `/share/${token}`,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    viewCount: row.viewCount,
    isRevoked: row.revokedAt !== null,
  };
}
