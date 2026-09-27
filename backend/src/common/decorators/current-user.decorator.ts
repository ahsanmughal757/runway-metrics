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
}

export function permissionsOf(user: Pick<RequestUser, 'role'>): readonly Permission[] {
  return permissionsForRole(user.role);
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
