import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MembershipRole } from '@prisma/client';

/**
 * PRD requirement: "RBAC faked via UI hiding" is a named risk. This guard is
 * the actual enforcement point — it runs on every request that carries
 * @Roles(), regardless of what the frontend does or doesn't render.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    // getRequest() is untyped, so the request is narrowed to the one field
    // this guard reads. Letting it stay `any` would mean an unchecked property
    // access in the only place role enforcement happens.
    const req = context.switchToHttp().getRequest<{ user?: { role?: MembershipRole } }>();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
