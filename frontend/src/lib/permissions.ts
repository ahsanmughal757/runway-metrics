/**
 * Mirrors `backend/src/auth/permissions.ts`.
 *
 * The server is the authority: `/auth/me` returns the caller's actual
 * permission strings, and `can()` only ever checks membership of that set. This
 * file exists for autocomplete and for catching a rename at compile time, not
 * for deciding anything. If the two ever disagree the server wins, because the
 * server is what enforces.
 */
export const ROLES = ['OWNER', 'ADMIN', 'ANALYST', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

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

const known = new Set<string>(PERMISSIONS);

/**
 * Narrows whatever the server sent to a known permission.
 *
 * An unrecognised string is dropped rather than trusted. A client that invents a
 * permission nobody defined should render the more restrictive UI, and the
 * server would have refused the request anyway - this just keeps the two
 * consistent.
 */
export function toPermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return [];
  return values.filter((v): v is Permission => typeof v === 'string' && known.has(v));
}

export function can(permissions: readonly Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}

/** Presentation only: how a role is labelled in the team list. */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Full control, including deleting the company and transferring ownership.',
  ADMIN: 'Runs the company day to day, including the team. Cannot delete the company.',
  ANALYST: 'Edits metrics and customers, and generates reports.',
  VIEWER: 'Read-only. The right role for an investor.',
};
