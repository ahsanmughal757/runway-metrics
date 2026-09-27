import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { PERMISSIONS, roleCan, type Permission } from '../../auth/permissions';
import type { MembershipRole } from '@prisma/client';

/**
 * PRD requirement: "RBAC faked via UI hiding" is a named risk. This guard is
 * the actual enforcement point - it runs on every request that carries
 * @RequirePermission(), regardless of what the frontend does or doesn't render.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    // getRequest() is untyped, so the request is narrowed to the one field
    // this guard reads. Letting it stay `any` would mean an unchecked property
    // access in the only place permission enforcement happens.
    const req = context.switchToHttp().getRequest<{ user?: { role?: MembershipRole } }>();
    const role = req.user?.role;
    const granted = role ? required.some((permission) => roleCan(role, permission)) : false;

    if (!granted) {
      // Name the missing permission, not the role. The message is for whoever
      // is integrating, and it tells them what to fix rather than what the
      // caller's job title happens to be.
      throw new ForbiddenException(
        `This action requires one of the following permissions: ${required.join(', ')}`,
      );
    }
    return true;
  }
}

/** Exported for the /auth/me payload so the client and server cannot disagree. */
export { PERMISSIONS };
