import { MembershipRole } from '@prisma/client';

/**
 * Every capability the product has, in one list.
 *
 * The old model authorised by role: controllers declared `@Roles('FOUNDER')`
 * and the frontend re-declared `'FOUNDER' | 'INVESTOR'` in three separate files
 * and asked `role === 'FOUNDER'` to decide whether to render a button. Adding
 * a role meant editing five files and hoping they stayed in agreement.
 *
 * Roles now exist only in the database, and everything else asks for a
 * permission. That way "who can edit the runway thresholds" is answered by one
 * table below instead of by grepping for a role name.
 */
export const PERMISSIONS = [
  'company:read',
  'company:update',
  'company:delete',

  'members:read',
  'members:invite',
  'members:updateRole',
  'members:remove',

  'metrics:read',
  'metrics:write',

  'customers:read',
  'customers:write',

  'reports:read',
  'reports:generate',
  'reports:share',

  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: readonly Permission[] = [
  'company:read',
  'members:read',
  'metrics:read',
  'customers:read',
  'reports:read',
  'audit:read',
];

/**
 * The one place role semantics are defined.
 *
 * OWNER  - owns the company. Can delete it. Cannot be deleted or demoted.
 * ADMIN  - runs the company day to day, including the team. Cannot delete the
 *          company or touch ownership, because those are the owner's to give.
 * ANALYST- does the actual finance work: edits metrics and customers and
 *          generates reports. Cannot change settings or the team.
 * VIEWER - reads, and shares nothing. This is what an investor should get, and
 *          the reason the old INVESTOR role needed to exist is now a permission
 *          set rather than a special case.
 */
export const ROLE_PERMISSIONS: Readonly<Record<MembershipRole, readonly Permission[]>> = {
  OWNER: [...READ_ONLY, 'company:update', 'company:delete', 'members:invite', 'members:updateRole', 'members:remove', 'metrics:write', 'customers:write', 'reports:generate', 'reports:share'],
  ADMIN: [...READ_ONLY, 'company:update', 'members:invite', 'members:updateRole', 'members:remove', 'metrics:write', 'customers:write', 'reports:generate', 'reports:share'],
  ANALYST: [...READ_ONLY, 'metrics:write', 'customers:write', 'reports:generate'],
  VIEWER: READ_ONLY,
};

export function permissionsForRole(role: MembershipRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleCan(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Owners cannot be removed or demoted; an ADMIN cannot be demoted past ADMIN. */
export const ROLE_RANK: Readonly<Record<MembershipRole, number>> = {
  OWNER: 4,
  ADMIN: 3,
  ANALYST: 2,
  VIEWER: 1,
};
