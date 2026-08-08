import { SetMetadata } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
/** Marks a route as requiring one of the given company roles. Checked server-side by RolesGuard — never rely on hiding UI. */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
