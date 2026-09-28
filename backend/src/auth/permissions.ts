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

  'apiKeys:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions an API key may never hold, whatever the caller's role is.
 *
 * A key that could manage keys could mint itself a key with every scope, which
 * makes revoking a compromised key a race: the attacker rotates a replacement
 * before anyone notices. It is excluded here rather than in the DTO so that
 * every entry point -- HTTP, a future script, a seed -- inherits the rule, and
 * the database CHECK constraint is the backstop for a direct write.
 */
export const KEY_FORBIDDEN_SCOPES: readonly Permission[] = ['apiKeys:manage'];

const READ_ONLY: readonly Permission[] = ['company:read', 'members:read', 'metrics:read', 'customers:read', 'reports:read', 'audit:read'];

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
  // Both OWNER and ADMIN can issue and revoke API keys. This was originally
  // proposed as OWNER-only on the grounds that a key can hold `company:delete`
  // and that should require an owner. The user chose parity deliberately, and
  // the reasoning holds up: an ADMIN can already do everything an owner can
  // except delete the company and change ownership, and the practical abuse is
  // reading financials via a key they could also read via the UI. Gating on
  // owner alone would have pushed real integrations to "share your owner's
  // password", which is worse. `company:delete` is still unreachable through a
  // key at issuance time -- see KEY_FORBIDDEN_SCOPES-adjacent checks in
  // api-keys.service.ts.
  OWNER: [
    ...READ_ONLY,
    'company:update',
    'company:delete',
    'members:invite',
    'members:updateRole',
    'members:remove',
    'metrics:write',
    'customers:write',
    'reports:generate',
    'reports:share',
    'apiKeys:manage',
  ],
  ADMIN: [
    ...READ_ONLY,
    'company:update',
    'members:invite',
    'members:updateRole',
    'members:remove',
    'metrics:write',
    'customers:write',
    'reports:generate',
    'reports:share',
    'apiKeys:manage',
  ],
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
