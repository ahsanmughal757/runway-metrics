import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { CredentialCryptoService } from '../common/crypto/credential-crypto.service';

export const SHARE_TTL_DAYS = 7;
const TOKEN_TTL_MS = SHARE_TTL_DAYS * 86_400_000;

/**
 * Share tokens are looked up by hash, so the AAD context has to be derivable
 * from the row alone. Binding the company id means a ciphertext cannot be moved
 * between rows, but `resolve` is the one call that has only the token and no
 * company id -- so the context cannot be the company for a lookup path.
 *
 * It is a fixed string instead. The tenant binding that actually matters here
 * is not in the cipher, it is in the query: `findUnique({ tokenHash })` is
 * global, and the company is then read from the row the hash found, so a token
 * can only ever resolve to the one company it was issued for.
 */
const CRYPTO_CONTEXT = 'share-link-token';

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
    private crypto: CredentialCryptoService,
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
        data: {
          companyId,
          tokenHash: hashToken(token),
          tokenCiphertext: this.crypto.encrypt(token, CRYPTO_CONTEXT),
          createdById: actorId,
          expiresAt,
          createdAt: now,
        },
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

    const link = await this.prisma.shareLink.findUnique({ where: { tokenHash: hashToken(token) } });
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
    // Decrypting here, and only here, is the whole reason the ciphertext
    // column exists. If the key is missing or a row predates encryption this
    // throws and the list endpoint 500s -- deliberately, because returning a
    // link with a blank token would hand the UI a "copy" button that copies
    // nothing and looks like a working link.
    return links.map((l) => toSummary(l, this.crypto.decrypt(l.tokenCiphertext, CRYPTO_CONTEXT)));
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
        // The first eight characters of a hash. Enough to correlate a revoke
        // with a link someone reported, and useless as a way back in -- unlike
        // a prefix of the token itself, which would narrow a 256-bit secret to
        // something brute-forceable in principle and quotable in a support
        // ticket in practice.
        diff: { tokenHash: `${link.tokenHash.slice(0, 8)}...` },
      });
    });
  }
}

/**
 * SHA-256 of the token, as hex. The token is 32 bytes of CSPRNG output, so
 * there is no dictionary to search and the hash cannot be reversed; a plain
 * digest is the right tool. It is not a password hash, and must not become
 * one -- bcrypt here would mean scanning the table on every public page view.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type ShareLinkRow = {
  id: string;
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
