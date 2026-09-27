import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';
import { permissionsForRole } from './permissions';
import type { RequestUser } from '../common/decorators/current-user.decorator';

/** What the access token carries: identity only. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/**
 * Turns an authenticated user into an authenticated *member of a company*.
 *
 * The access token deliberately does not carry a company or a role. Those were
 * the two things it used to carry, and both were wrong: a token minted before a
 * demotion kept working at the old privilege until it expired, and the company
 * came from the token rather than from the request being authorised, so a token
 * for one company was accepted as if it spoke for another.
 *
 * So the token says who you are, and this class decides which company you are
 * acting as and what that entitles you to, by asking the database every time.
 * The cost is one indexed lookup per request, which is cheaper than the class of
 * bug the alternative invites.
 */
@Injectable()
export class MembershipResolver {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolves the acting membership. `requestedCompanyId` is the client's claim
   * about which company it is working in; it is only ever treated as a request.
   */
  async resolve(userId: string, email: string, requestedCompanyId?: string): Promise<RequestUser> {
    if (!env.ENABLE_DATABASE) {
      // Demo mode injects its identity upstream in BypassAuthGuard. Reaching
      // here would mean that guard was skipped, so refuse rather than invent a
      // membership.
      throw new ForbiddenException('Company membership cannot be resolved without a database');
    }

    const membership = await this.prisma.companyMembership.findFirst({
      where: requestedCompanyId ? { userId, companyId: requestedCompanyId } : { userId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership) {
      // A valid token for a user who belongs to no company is not a server
      // fault, and is deliberately indistinguishable from a bad token to the
      // caller. Asking for a company you are not in says exactly that much.
      throw requestedCompanyId
        ? new ForbiddenException('You do not have access to that company')
        : new UnauthorizedException('This account has no company membership yet');
    }

    if (!membership.user.isActive) {
      throw new ForbiddenException('This account has been deactivated');
    }

    return {
      userId: membership.userId,
      // Read the email from the row rather than the token, so a stale token
      // cannot make the API disagree with the database about the address.
      email: membership.user.email,
      name: membership.user.name,
      companyId: membership.companyId,
      role: membership.role,
      permissions: permissionsForRole(membership.role),
    };
  }
}

type MembershipRow = Prisma.CompanyMembershipGetPayload<{ include: { user: true } }>;

export { type MembershipRow };
