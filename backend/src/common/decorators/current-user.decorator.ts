import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';
import { permissionsForRole, type Permission } from '../../auth/permissions';

/**
 * The authenticated caller, resolved to a specific company.
 *
 * `role` is typed from the database enum rather than a hand-written union. The
 * old `'FOUNDER' | 'INVESTOR'` literal was a fourth independent copy of the
 * role list, and it was read straight out of the JWT, so a stale or forged
 * token could carry a role the database no longer knew about.
 *
 * `permissions` is carried alongside the role purely so handlers and the
 * /auth/me payload can echo what the caller may do without recomputing it.
 * Enforcement still happens in PermissionsGuard; this field is not a shortcut
 * around it.
 */
export interface RequestUser {
  userId: string;
  email: string;
  name: string | null;
  companyId: string;
  role: MembershipRole;
  permissions: readonly Permission[];
  /**
   * Set only by BypassAuthGuard, on the identity it injects.
   *
   * The frontend has controls that can only work against a demo identity - the
   * viewpoint switcher, which is answered by `X-Demo-Role` - plus one that can
   * only work against a *real* one, the sign-out control, because demo mode has
   * no session and no refresh cookie to revoke. Previously the client had to
   * guess which mode it was in, and the honest-looking guesses (sniffing the
   * `demo-user` id, or treating "no local token" as signed out) are wrong in
   * opposite directions. The server already knows, so it says so.
   *
   * Never populated from request input, so it cannot be forged. Omitted rather
   * than `false` on real identities so every existing construction site - JWT
   * verification, membership resolution - stays valid without being edited.
   */
  demo?: true;

  /**
   * Set only by ApiKeyGuard, when the caller authenticated with an API key
   * rather than a session.
   *
   * The distinction exists because a key is not a person. Every field above is
   * either a human fact (userId, email, name) or a fact about a membership that
   * has since been resolved into a role, and neither describes a machine
   * credential. Rather than pretend otherwise -- minting a synthetic user, or
   * borrowing the key creator's identity so a key would inherit that person's
   * later demotion -- the type says what actually authenticated the request.
   *
   * A key also carries its own `permissions` that have nothing to do with
   * `role`, which is why `roleCan` alone cannot be the whole of enforcement for
   * these requests. See PermissionsGuard.
   */
  apiKeyId?: string;
  /**
   * Label for audit rows written by a key caller, e.g. `API key:Reporting key`.
   * AuditLog.changedBy is a foreign key to User, so a machine has no id to put
   * there; this is the honest substitute and the audit service prefers it.
   */
  actorLabel?: string;
}

export function permissionsOf(user: Pick<RequestUser, 'role'>): readonly Permission[] {
  return permissionsForRole(user.role);
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
