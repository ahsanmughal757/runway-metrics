import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../../auth/permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Marks a route as requiring one of the given permissions. Enforced
 * server-side by PermissionsGuard.
 *
 * Naming the permission rather than the role is deliberate: the route states
 * what it does ("these are the write endpoints for metrics"), and the role
 * table decides who gets to do it. The frontend asks the API for the caller's
 * permissions and renders from those, so it never has to hardcode a role name
 * to decide whether a button should exist.
 */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
