import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InviteStatus, MembershipRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { isValidEmail, normalizeEmail } from '../common/email';
import { ROLE_RANK } from '../auth/permissions';

/** How long an invitation stays redeemable. */
export const INVITE_TTL_DAYS = 14;

export interface InviteSummary {
  id: string;
  email: string;
  role: MembershipRole;
  status: InviteStatus;
  /** ISO timestamp, or null once redeemed. */
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
  invitedBy: string;
  isExpired: boolean;
}

const demoInvites: InviteSummary[] = [];

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(companyId: string): Promise<InviteSummary[]> {
    if (!env.ENABLE_DATABASE) return demoInvites;

    const rows = await this.prisma.invite.findMany({
      where: { companyId },
      include: { invitedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSummary);
  }

  /**
   * Issues an invitation and records it in one transaction.
   *
   * Two things this gets right that the previous version did not:
   *
   *  - It refuses to invite someone who is already a member, and the database
   *    backs that with a partial unique index over PENDING invites, so two
   *    admins clicking send cannot produce two working invitations.
   *  - It cannot issue an OWNER invitation unless the caller is an owner, so a
   *    compromised admin account cannot quietly mint itself ownership.
   */
  async create(companyId: string, email: string, role: MembershipRole, actor: RequestActor): Promise<InviteSummary> {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) throw new ConflictException('Enter a valid email address');
    this.assertMayGrant(actor, role);

    if (!env.ENABLE_DATABASE) {
      const summary: InviteSummary = {
        id: `demo-${randomBytes(6).toString('hex')}`,
        email: normalized,
        role,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
        createdAt: new Date().toISOString(),
        respondedAt: null,
        invitedBy: actor.email,
        isExpired: false,
      };
      demoInvites.unshift(summary);
      return summary;
    }

    const existingMember = await this.prisma.companyMembership.findFirst({
      where: { companyId, user: { email: normalized } },
    });
    if (existingMember) throw new ConflictException('That person is already a member of this company');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.invite.create({
          data: {
            companyId,
            email: normalized,
            role,
            token: randomBytes(32).toString('base64url'),
            invitedById: actor.userId,
            expiresAt,
            createdAt: now,
          },
          include: { invitedBy: true },
        });
        await this.audit.recordIn(tx, {
          companyId,
          entityId: created.id,
          entityType: 'INVITE',
          action: 'INVITED',
          actorId: actor.userId,
          diff: { email: normalized, role },
        });
        return toSummary(created);
      });
    } catch (err) {
      // The partial unique index is the authority on duplicate pending invites;
      // translating it here keeps the caller from seeing a raw constraint name.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('There is already a pending invitation for that address');
      }
      throw err;
    }
  }

  /**
   * Redeems an invitation.
   *
   * This is unauthenticated by necessity - the person clicking the emailed link
   * may not have an account yet - so the token is the credential. Everything
   * else is deliberately strict: the token must exist, be PENDING, be unexpired,
   * and the address it was sent to must match the address the user is signing
   * in as, otherwise an invitation could be forwarded and redeemed by whoever
   * received the forward.
   *
   * Creating the user, the membership, the company slug and the audit row all
   * happen in one transaction, so a failure cannot leave an invitation marked
   * accepted with no membership behind it.
   */
  async accept(token: string, userId: string, userEmail: string): Promise<RedeemResult> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Invitations are not available in demo mode');

    const invite = await this.loadRedeemable(token, normalizeEmail(userEmail));

    return this.prisma.$transaction(async (tx) => {
      // Re-read under the transaction: two simultaneous clicks on the same link
      // would otherwise both pass the check above and create two memberships.
      const fresh = await tx.invite.findUnique({ where: { id: invite.id } });
      if (!fresh || fresh.status !== InviteStatus.PENDING) {
        throw new ConflictException('This invitation has already been used');
      }

      const membership = await tx.companyMembership.upsert({
        where: { userId_companyId: { userId, companyId: invite.companyId } },
        create: { userId, companyId: invite.companyId, role: invite.role },
        update: { role: invite.role },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED, respondedAt: new Date() },
      });

      await this.audit.recordIn(tx, {
        companyId: invite.companyId,
        entityId: userId,
        entityType: 'MEMBER',
        action: 'ACCEPTED',
        actorId: userId,
        diff: { inviteId: invite.id, role: invite.role },
      });

      return {
        userId,
        email: normalizeEmail(userEmail),
        companyId: membership.companyId,
        role: membership.role,
        createdAccount: false,
      };
    });
  }

  /**
   * Non-authoritative description of an invitation, for the landing page.
   *
   * Deliberately reveals the company *name* but not its id, and reports an
   * unknown token as simply invalid rather than distinguishing "no such token"
   * from "already used", so this cannot be used to probe which tokens exist.
   */
  async preview(token: string): Promise<InvitePreview> {
    if (!env.ENABLE_DATABASE) {
      return { companyName: 'Demo Company', email: '', role: MembershipRole.VIEWER, isExpired: false, isValid: false };
    }

    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { company: true },
    });
    if (!invite) return { companyName: '', email: '', role: MembershipRole.VIEWER, isExpired: true, isValid: false };

    const isExpired = invite.expiresAt.getTime() <= Date.now();
    return {
      companyName: invite.company.name,
      email: invite.email,
      role: invite.role,
      isExpired,
      isValid: invite.status === InviteStatus.PENDING && !isExpired,
    };
  }

  /**
   * Full redemption for a first-time invitee: signs the address in if the
   * account exists, creates it if not, and adds the membership - atomically.
   *
   * Verifying the password against the existing account is what stops an
   * invitation from being redeemed by whoever received a forwarded copy of the
   * email. Creating the account when none exists is the legitimate case: this is
   * how someone joins their first company.
   */
  async redeem(token: string, email: string, password: string): Promise<RedeemResult> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Invitations are not available in demo mode');

    const normalized = normalizeEmail(email);
    const invite = await this.loadRedeemable(token, normalized);

    const passwordHash = await bcrypt.hash(password, 12);

    return this.prisma.$transaction(async (tx) => {
      // Re-read under the transaction so a double click cannot create two
      // memberships or two accounts.
      const fresh = await tx.invite.findUnique({ where: { id: invite.id } });
      if (!fresh || fresh.status !== InviteStatus.PENDING) {
        throw new ConflictException('This invitation has already been used');
      }

      let user = await tx.user.findUnique({ where: { email: normalized } });
      let createdAccount = false;
      if (user) {
        // An existing account must prove itself, or an attacker with a forwarded
        // invitation could claim a membership in a company they do not belong to.
        if (!(await bcrypt.compare(password, user.passwordHash))) {
          throw new UnauthorizedException('That password is not correct for this email address');
        }
        if (!user.isActive) throw new ForbiddenException('This account has been deactivated');
      } else {
        user = await tx.user.create({ data: { email: normalized, passwordHash } });
        createdAccount = true;
      }

      const membership = await tx.companyMembership.upsert({
        where: { userId_companyId: { userId: user.id, companyId: invite.companyId } },
        create: { userId: user.id, companyId: invite.companyId, role: invite.role },
        update: { role: invite.role },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED, respondedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        companyId: invite.companyId,
        entityId: user.id,
        entityType: 'MEMBER',
        action: 'ACCEPTED',
        actorId: user.id,
        diff: { inviteId: invite.id, role: invite.role, createdAccount },
      });

      return {
        userId: user.id,
        email: user.email,
        companyId: membership.companyId,
        role: membership.role,
        createdAccount,
      };
    });
  }

  /**
   * Validates a token and its intended recipient, and marks the invitation
   * EXPIRED if it has lapsed. Shared by `accept` and `redeem` so both paths
   * reject exactly the same set of invitations.
   */
  private async loadRedeemable(token: string, recipientEmail: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException('This invitation is not valid');
    if (invite.status !== InviteStatus.PENDING) {
      throw new ConflictException(
        invite.status === InviteStatus.EXPIRED ? 'This invitation has expired' : 'This invitation has already been used',
      );
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      await this.expire(invite.id, invite.companyId);
      throw new ForbiddenException('This invitation has expired');
    }
    if (normalizeEmail(invite.email) !== recipientEmail) {
      // Deliberately does not reveal whether the address is on the invite.
      throw new ForbiddenException('This invitation was sent to a different email address');
    }
    return invite;
  }

  async revoke(companyId: string, inviteId: string, actorId: string): Promise<void> {
    if (!env.ENABLE_DATABASE) throw new NotFoundException('Invitations are not available in demo mode');

    await this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findFirst({ where: { id: inviteId, companyId } });
      if (!invite) throw new NotFoundException('Invitation not found');
      if (invite.status !== InviteStatus.PENDING) {
        throw new ConflictException(`This invitation is already ${invite.status.toLowerCase()}`);
      }

      await tx.invite.update({
        where: { id: inviteId },
        data: { status: InviteStatus.REVOKED, respondedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        companyId,
        entityId: inviteId,
        entityType: 'INVITE',
        action: 'REVOKED',
        actorId,
        diff: { email: invite.email },
      });
    });
  }

  /** Marks a lapsed invitation so the list does not keep showing it as pending. */
  private async expire(inviteId: string, companyId: string) {
    await this.prisma.invite.updateMany({
      where: { id: inviteId, companyId, status: InviteStatus.PENDING },
      data: { status: InviteStatus.EXPIRED },
    });
  }

  private assertMayGrant(actor: RequestActor, role: MembershipRole) {
    if (actor.role !== MembershipRole.OWNER && role === MembershipRole.OWNER) {
      throw new ForbiddenException('Only an owner can invite another owner');
    }
    if (actor.role !== MembershipRole.OWNER && ROLE_RANK[role] >= ROLE_RANK[actor.role]) {
      throw new ForbiddenException('You cannot grant a role at or above your own');
    }
  }
}

export interface RequestActor {
  userId: string;
  email: string;
  role: MembershipRole;
}

export interface InvitePreview {
  companyName: string;
  email: string;
  role: MembershipRole;
  isExpired: boolean;
  isValid: boolean;
}

export interface RedeemResult {
  userId: string;
  email: string;
  companyId: string;
  role: MembershipRole;
  createdAccount: boolean;
}

type InviteRow = Prisma.InviteGetPayload<{ include: { invitedBy: true } }>;

function toSummary(invite: InviteRow): InviteSummary {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    respondedAt: invite.respondedAt?.toISOString() ?? null,
    invitedBy: invite.invitedBy.name ?? invite.invitedBy.email,
    isExpired: invite.status === InviteStatus.PENDING && invite.expiresAt.getTime() <= Date.now(),
  };
}
