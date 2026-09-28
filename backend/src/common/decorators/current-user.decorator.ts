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
}

export function permissionsOf(user: Pick<RequestUser, 'role'>): readonly Permission[] {
  return permissionsForRole(user.role);
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
