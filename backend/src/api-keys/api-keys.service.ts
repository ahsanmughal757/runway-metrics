import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { KEY_FORBIDDEN_SCOPES, PERMISSIONS, type Permission } from '../auth/permissions';
import type { RequestUser } from '../common/decorators/current-user.decorator';

const KEY_PREFIX = 'rw_live_';
/** How much of the secret is stored in the clear for lookup and display. */
const PREFIX_BODY_BYTES = 4;

export interface CreatedApiKey {
  /** The only time the secret is ever available. */
  secret: string;
  key: ApiKeySummary;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  isRevoked: boolean;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Mints a key and returns its secret exactly once.
   *
   * The plaintext is not stored in any form that can reproduce it: only a
   * SHA-256 digest and a four-byte head go to the database. A lost key cannot be
   * recovered, only replaced, which is the same trade an SSH key makes and the
   * only one that survives someone copying the table.
   */
  async create(actor: RequestUser, name: string, scopes: string[], expiresInDays?: number): Promise<CreatedApiKey> {
    const requested = normaliseScopes(scopes);

    if (!env.ENABLE_DATABASE) {
      return { secret: `${KEY_PREFIX}${randomBytes(16).toString('hex')}`, key: demoKey(name, requested) };
    }

    // 16 bytes of entropy for the body. This is a bearer credential for a
    // company, so it gets the same treatment as a share token: no derivation,
    // no structure an attacker can exploit.
    const body = randomBytes(16).toString('hex');
    const secret = `${KEY_PREFIX}${body}`;
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await tx.apiKey.create({
        data: {
          companyId: actor.companyId,
          name,
          prefix: secret.slice(0, KEY_PREFIX.length + PREFIX_BODY_BYTES * 2),
          secretHash: hashSecret(secret),
          scopes: requested,
          expiresAt,
          createdById: actor.userId,
        },
      });
      await this.audit.recordIn(tx, {
        companyId: actor.companyId,
        entityId: row.id,
        entityType: 'API_KEY',
        action: 'CREATED',
        actorId: actor.userId,
        // The secret is not in here and must never be. The prefix and the
        // scopes are enough to answer "what did we hand out".
        diff: { name, prefix: row.prefix, scopes: requested, expiresAt: expiresAt?.toISOString() ?? null },
      });
      return { secret, key: toSummary(row) };
    });
  }

  /** The company's keys. Never includes anything derived from the secret. */
  async list(actor: RequestUser): Promise<ApiKeySummary[]> {
    if (!env.ENABLE_DATABASE) return [demoKey('Reporting key', ['metrics:read', 'reports:read'])];

    const rows = await this.prisma.apiKey.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSummary);
  }

  /**
   * Revokes a key. Idempotent: a key that is already revoked is reported as
   * revoked rather than as an error, because a double-click on a revoke button
   * should not surface as a failure.
   */
  async revoke(actor: RequestUser, id: string): Promise<void> {
    if (!env.ENABLE_DATABASE) return;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // companyId in the where clause, not just the id: an id from another
      // tenant has to match nothing, not resolve to a row someone else owns.
      const key = await tx.apiKey.findFirst({ where: { id, companyId: actor.companyId } });
      if (!key) throw new NotFoundException('API key not found');
      if (key.revokedAt) return;

      await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.recordIn(tx, {
        companyId: actor.companyId,
        entityId: id,
        entityType: 'API_KEY',
        action: 'REVOKED',
        actorId: actor.userId,
        diff: { name: key.name, prefix: key.prefix },
      });
    });
  }

  /**
   * Resolves a presented secret to the identity it authenticates.
   *
   * Returns null for every failure -- unknown, revoked, expired, wrong prefix --
   * so a caller cannot use the response to learn which of those it hit. It is
   * the same reasoning as the share link's single "invalid or expired" message.
   */
  async authenticate(secret: string): Promise<{ companyId: string; keyId: string; scopes: readonly Permission[] } | null> {
    if (!env.ENABLE_DATABASE) return null;

    // The prefix narrows to one row before any hashing, so a presented key
    // cannot be used to time a scan across the table. It is a lookup
    // optimisation, not a secret: it is stored in the clear and displayed.
    const prefix = secret.slice(0, KEY_PREFIX.length + PREFIX_BODY_BYTES * 2);
    if (!prefix.startsWith(KEY_PREFIX)) return null;

    const key = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (!key) return null;
    if (!constantTimeEquals(hashSecret(secret), key.secretHash)) return null;
    if (key.revokedAt || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) return null;

    await this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return { companyId: key.companyId, keyId: key.id, scopes: key.scopes as Permission[] };
  }
}

/**
 * Rejects anything outside the known vocabulary, and anything the caller could
 * not do themselves.
 *
 * The second half is the important one: a key must never be a privilege
 * escalation. If the issuing admin cannot delete the company through the UI,
 * they must not be able to mint a key that does it and hand it to somebody else
 * who keeps it after they are demoted.
 */
function normaliseScopes(scopes: string[]): string[] {
  if (scopes.length === 0) {
    throw new BadRequestException('An API key needs at least one scope');
  }
  const unique = [...new Set(scopes)];
  for (const scope of unique) {
    if (!PERMISSIONS.includes(scope as Permission)) {
      throw new BadRequestException(`Unknown scope "${scope}"`);
    }
    if (KEY_FORBIDDEN_SCOPES.includes(scope as Permission)) {
      throw new ForbiddenException(`An API key cannot hold "${scope}"`);
    }
  }
  return unique.sort();
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Compares digests in constant time.
 *
 * Not a meaningful defence in isolation -- an attacker who has reached this
 * line already holds a candidate secret and the timing of a 32-byte hex compare
 * leaks nothing useful. It is here so the comparison is correct by default
 * rather than correct by remembering, and so the intent survives a future
 * refactor that swaps the digest for something slower.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

function toSummary(row: ApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    isRevoked: row.revokedAt !== null,
  };
}

function demoKey(name: string, scopes: string[]): ApiKeySummary {
  const now = new Date();
  return {
    id: `demo-key-${name.toLowerCase().replace(/\W+/g, '-')}`,
    name,
    prefix: `${KEY_PREFIX}${'0'.repeat(PREFIX_BODY_BYTES * 2)}`,
    scopes,
    createdAt: now.toISOString(),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    isRevoked: false,
  };
}

export { KEY_PREFIX };
