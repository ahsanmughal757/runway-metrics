import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { isValidEmail, normalizeEmail } from '../common/email';
import { slugWithSuffix } from '../common/slug';
import { permissionsForRole } from './permissions';
import { SessionsService, type ClientMeta } from './sessions.service';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private sessions: SessionsService,
  ) {}

  /**
   * Open signup: a new account creates its own company and becomes its OWNER.
   *
   * The alternative - an account with no company - produces a user who cannot
   * do anything, cannot be invited anywhere, and has to be handled as a special
   * case by every screen. Creating the tenant here means the membership always
   * exists, which is the invariant the rest of the system is built on.
   */
  async register(email: string, password: string, companyName: string, name?: string) {
    this.requireDatabase('Registration');
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) throw new ConflictException('Enter a valid email address');

    if (await this.prisma.user.findUnique({ where: { email: normalized } })) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // User, company and the OWNER membership land together or not at all. A
    // user row without its membership is the broken state described above.
    const { user } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: normalized, passwordHash, name: name?.trim() || null },
      });
      const createdCompany = await tx.company.create({
        data: { name: companyName.trim(), slug: slugWithSuffix(companyName) },
      });
      await tx.companyMembership.create({
        data: { userId: created.id, companyId: createdCompany.id, role: MembershipRole.OWNER },
      });
      await tx.auditLog.create({
        data: {
          companyId: createdCompany.id,
          entityId: createdCompany.id,
          entityType: 'COMPANY_SETTINGS',
          action: 'CREATED',
          changedBy: created.id,
          diff: { name: createdCompany.name, slug: createdCompany.slug },
        },
      });
      return { user: created };
    });

    // The token is issued here rather than making the client log in
    // immediately afterwards. That second request would mean hashing the
    // password twice - bcrypt at cost 12 is deliberately slow, and paying it
    // twice on the one request that matters most is just a slow signup.
    return {
      accessToken: this.signAccessToken(user.id, user.email),
      user: { id: user.id, email: user.email, name: user.name },
      memberships: await this.membershipsFor(user.id),
    };
  }

  async login(email: string, password: string) {
    this.requireDatabase('Login');
    const normalized = normalizeEmail(email);

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    // Compare against a dummy hash when the user is missing so that a wrong
    // address and a wrong password take the same time. Without this, response
    // latency alone reveals which addresses have accounts.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hash);
    if (!user || !passwordMatches) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated');

    const memberships = await this.membershipsFor(user.id);
    if (memberships.length === 0) throw new UnauthorizedException('This account has no company membership yet');

    return {
      accessToken: this.signAccessToken(user.id, user.email),
      user: { id: user.id, email: user.email, name: user.name },
      memberships,
    };
  }

  /**
   * The client's own view of itself: who it is, what it may do in the company
   * it is currently acting in, and which other companies it can switch to.
   *
   * This is what lets the frontend stop hardcoding role names. It renders from
   * `permissions` instead of asking "is this person the founder", and the server
   * remains the only thing that actually decides. In demo mode the membership
   * list is empty - there is no database to read - but the role and permissions
   * still come from the bypass identity, so the demo renders correctly.
   */
  async me(user: RequestUser) {
    return {
      userId: user.userId,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      role: user.role,
      permissions: user.permissions,
      // Coerced to a boolean so the client never has to distinguish "absent"
      // from "false", which is a distinction it cannot act on correctly.
      demo: user.demo === true,
      memberships: await this.membershipsFor(user.userId),
    };
  }

  /**
   * Starts a session for a user who has just proved their identity.
   *
   * Called by the controller after register/login, which is where the request
   * metadata and the response object live. Kept out of `login()` itself so the
   * credential path does not have to know about cookies.
   */
  async startSession(userId: string, meta: ClientMeta) {
    this.requireDatabase('Sessions');
    const { token } = await this.sessions.issue(userId, meta);
    return token;
  }

  /**
   * Exchanges a refresh token for a fresh access token and a rotated refresh
   * token. Both are returned; the caller decides where each one goes.
   */
  async refresh(rawToken: string, meta: ClientMeta) {
    this.requireDatabase('Sessions');
    const { token, user } = await this.sessions.rotate(rawToken, meta);
    return {
      accessToken: this.signAccessToken(user.id, user.email),
      refreshToken: token,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  /** Ends the session a refresh token belongs to. Quiet if it is already gone. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!env.ENABLE_DATABASE) return;
    await this.sessions.revokeToken(rawToken);
  }

  async listSessions(userId: string, currentToken?: string) {
    this.requireDatabase('Sessions');
    const currentFamilyId = await this.sessions.familyIdForToken(currentToken);
    return this.sessions.listForUser(userId, currentFamilyId);
  }

async revokeSession(userId: string, sessionId: string): Promise<void> {
  this.requireDatabase('Sessions');
  const removed = await this.sessions.revokeSession(userId, sessionId);
    if (!removed) throw new UnauthorizedException('That session is no longer active');
  }

  private async membershipsFor(userId: string) {
    const rows = await this.prisma.companyMembership.findMany({
      where: { userId },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      companyId: row.companyId,
      companyName: row.company.name,
      companySlug: row.company.slug,
      currency: row.company.currency,
      role: row.role,
      permissions: permissionsForRole(row.role),
    }));
  }

  /**
   * Identity only. Company and role are resolved per request by
   * MembershipResolver, so nothing in this token can be stale or forged into a
   * privilege the database would not grant.
   */
  private signAccessToken(userId: string, email: string): string {
    return this.jwt.sign({ sub: userId, email }, { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS });
  }

  private requireDatabase(what: string) {
    if (!env.ENABLE_DATABASE) {
      throw new ConflictException(`${what} requires ENABLE_DATABASE=true; use BYPASS_AUTH for demo mode.`);
    }
  }
}

/**
 * A real bcrypt hash of a value nobody knows, used to keep the "no such user"
 * path as slow as the "wrong password" path. Regenerating it per call would be
 * worse, so it is a constant.
 */
const DUMMY_HASH = '$2b$12$CfIGaCiRSizk5LbgPrsm/OqZgPRu3wifXP2/8P.rStqdjeKwLGe1O';
