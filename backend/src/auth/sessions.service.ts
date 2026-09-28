import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';

/** What the request looked like, recorded so a user can recognise their sessions. */
export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Refresh tokens, and the rotation that makes them revocable.
 *
 * Three decisions here are the whole point of this file:
 *
 * 1. **The refresh token is opaque, not a JWT.** It is 32 random bytes and only
 *    its SHA-256 is stored. A JWT refresh token is self-validating, which is a
 *    problem precisely when you need to revoke it - you end up keeping the
 *    blacklist that a session table would have been anyway. Hashing also means a
 *    database dump does not hand out live sessions, the same reason passwords
 *    are stored hashed.
 *
 * 2. **It rotates on every use.** Presenting a refresh token burns it and mints
 *    a replacement in the same `familyId`. A refresh token is long-lived, so
 *    treating it as a reusable bearer credential means one stolen token is good
 *    for weeks.
 *
 * 3. **Reuse is treated as theft.** Every token in a family descends from one
 *    login, so if a token that was already rotated comes back, either an
 *    attacker has a copy or the legitimate client replayed it. The response is
 *    the same either way: revoke the entire family and force a real sign-in.
 *    This is the property that turns a stolen token from an undetected
 *    long-term credential into a detectable, recoverable event.
 *
 * The cost of (3) is that two genuinely concurrent refreshes - two browser tabs
 * waking at once - will kill the family and log the user out. That is a
 * deliberate fail-closed choice: the server cannot honestly distinguish the two
 * cases, and guessing "probably just concurrency" on a theft signal is the
 * wrong direction to be wrong in. The client reduces the false positive by
 * collapsing concurrent refreshes into one in-flight request (see
 * `frontend/src/lib/api.ts`), and `rotate` guarantees that the *server* also
 * resolves the race, so a client that gets it wrong cannot end up with two live
 * tokens.
 */
@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  /** Starts a new session family. The returned token is the only copy. */
  async issue(userId: string, meta: ClientMeta) {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        familyId: randomUUID(),
        expiresAt: new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
        createdAt: now,
        ip: meta.ip ?? null,
        userAgent: truncate(meta.userAgent),
      },
    });
    return { token, session };
  }

  /**
   * Exchanges a refresh token for a new one and the matching access token.
   *
   * The family revocation on reuse happens *inside* the transaction and the
   * exception is thrown *after* it commits. Throwing from inside would roll the
   * revocation back - which would leave the theft response as the one thing that
   * does not happen.
   */
  async rotate(token: string, meta: ClientMeta) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const current = await tx.session.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!current) return { kind: 'unknown' } as const;

      if (current.revokedAt) {
        await this.revokeFamilyIn(tx, current.familyId);
        return { kind: 'reused' } as const;
      }

      if (current.expiresAt.getTime() <= Date.now()) {
        return { kind: 'expired' } as const;
      }

      const user = await tx.user.findUnique({ where: { id: current.userId } });
      // A deactivated account must not be able to keep refreshing its way back
      // in. Every one of their sessions dies, not just this family: leaving the
      // others live would mean an account the owner has switched off can still be
      // used from another device, and "deactivated" has to mean the whole thing.
      if (!user || !user.isActive) {
        await tx.session.updateMany({
          where: { userId: current.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { kind: 'inactive' } as const;
      }

      // Claim the token before minting its replacement.
      //
      // A plain read-then-update is not enough: PostgreSQL's default isolation
      // is READ COMMITTED, so two refreshes of the same token can both read
      // `revokedAt: null` and both proceed. They would each create a
      // replacement, leaving the family with two live tokens and no reuse
      // signal at all - which is precisely the case reuse detection exists to
      // catch, silently missed.
      //
      // `updateMany` with `revokedAt: null` in the WHERE clause is a
      // compare-and-swap: whoever changes the row first wins, and the second
      // transaction's UPDATE matches nothing and reports `count: 0`. It claims
      // the token without SELECT ... FOR UPDATE, so no lock is held for longer
      // than this one statement.
      const now = new Date();
      const claimed = await tx.session.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now, lastUsedAt: now },
      });
      if (claimed.count === 0) {
        // Lost the race. Someone else is spending this token right now, so
        // presenting it is a reuse signal however innocent the explanation is.
        await this.revokeFamilyIn(tx, current.familyId);
        return { kind: 'reused' } as const;
      }

      const nextToken = randomBytes(32).toString('base64url');
      const next = await tx.session.create({
        data: {
          userId: current.userId,
          tokenHash: hashToken(nextToken),
          familyId: current.familyId,
          // The family's expiry is fixed at login. Sliding it on every rotation
          // would make the session immortal, which is not what a 30-day expiry
          // means to anyone reading it.
          expiresAt: current.expiresAt,
          ip: meta.ip ?? current.ip,
          userAgent: truncate(meta.userAgent) ?? current.userAgent,
        },
      });

      await tx.session.update({ where: { id: current.id }, data: { replacedById: next.id } });

      return { kind: 'ok' as const, token: nextToken, user };
    });

    if (outcome.kind === 'ok') return { token: outcome.token, user: outcome.user };

    throw new UnauthorizedException(
      outcome.kind === 'reused'
        ? 'This session was signed out because its refresh token was reused. Please sign in again.'
        : 'Your session has expired. Please sign in again.',
    );
  }

  /**
   * Ends the session the presented token belongs to.
   *
   * Idempotent and quiet on an unknown token: a logout that 404s because the
   * session was already gone would leave the browser unsure whether to clear its
   * cookie, and the correct end state is the same either way.
   */
  async revokeToken(token: string | undefined): Promise<void> {
    if (!token) return;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session) return;
    await this.prisma.$transaction((tx) => this.revokeFamilyIn(tx, session.familyId));
  }

  /**
   * Everything this user has signed in from, most recently active first, for the
   * device list.
   *
   * Revoked and expired rows are filtered out rather than shown greyed out: a
   * device the user has already signed out of is noise, and the list exists to
   * answer "what is still logged in".
   *
   * `currentFamilyId` marks the row belonging to the caller's own cookie. Without
   * it the list cannot tell the user which entry is the device they are typing
   * on, and revoking the wrong one signs *them* out - which reads as a bug and
   * trains people to distrust the page.
   *
   * `nulls: 'last'` is load-bearing, not decoration. PostgreSQL sorts NULLS FIRST
   * on a DESC sort, and `lastUsedAt` is null for every session that has signed in
   * and never refreshed. Plain `orderBy: { lastUsedAt: 'desc' }` therefore ranked
   * the *least* recently used devices at the top of a list the UI labels "newest
   * activity first" - inverting the one thing the page is for. A session signed
   * in to and never touched should read as stale, and SQL's default says it is
   * the freshest thing there.
   *
   * `createdAt` breaks ties so the order is total. Two devices can share a
   * millisecond, and an unstable order would shuffle rows between renders, which
   * looks like the list is lying.
   */
  async listForUser(userId: string, currentFamilyId?: string | null) {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt.toISOString(),
      ip: row.ip,
      userAgent: row.userAgent,
      isCurrent: row.familyId === currentFamilyId,
    }));
  }

  /**
   * Which rotation family a refresh token belongs to.
   *
   * Compares hashes rather than returning the session, because the caller only
   * needs to answer "is this me" and has no business holding the row.
   */
  async familyIdForToken(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { familyId: true },
    });
    return row?.familyId ?? null;
  }

  /**
   * Revokes one session. Scoped to `userId` in the query itself, so a guessed
   * session id belonging to somebody else matches nothing rather than revoking
   * their session.
   */
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  /** Marks every live session in a family revoked. Caller supplies the transaction. */
  private async revokeFamilyIn(tx: Prisma.TransactionClient, familyId: string): Promise<void> {
    await tx.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export type SessionUser = Pick<User, 'id' | 'email' | 'name'>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A client can send a kilobyte of user-agent; the column does not need it. */
function truncate(userAgent?: string | null): string | null {
  return userAgent ? userAgent.slice(0, 255) : null;
}
