import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { permissionsForRole } from './permissions';

/**
 * Active only when env.BYPASS_AUTH=true (dev/demo mode). Injects a fixed
 * demo Owner identity so the whole app is explorable with zero setup.
 * env.ts throws at boot if this were ever combined with NODE_ENV=production.
 *
 * The identity is still built through the same permission table as a real
 * membership, so a demo user sees exactly what their chosen role would see.
 * That is the point: if demo mode granted more than the matrix grants, the demo
 * would quietly lie about what the product does.
 */
const KNOWN_DEMO_COMPANIES = new Set(['demo-company-steady', 'demo-company-hypergrowth', 'demo-company-struggling']);
const KNOWN_ROLES = new Set<string>(Object.values(MembershipRole));

@Injectable()
export class BypassAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // Demo mode still lets the frontend's company switcher / role toggle work,
    // via plain request headers - never trusted as real auth, only used to pick
    // which canned demo identity to inject. Falls back to safe defaults.
    const requestedCompany = req.headers['x-demo-company-id'];
    const requestedRole = String(req.headers['x-demo-role'] ?? '').toUpperCase();

    const role = (KNOWN_ROLES.has(requestedRole) ? requestedRole : MembershipRole.OWNER) as MembershipRole;

    req.user = {
      userId: 'demo-user',
      email: 'demo.owner@runway.local',
      name: 'Demo Owner',
      companyId: KNOWN_DEMO_COMPANIES.has(requestedCompany) ? requestedCompany : 'demo-company-steady',
      role,
      permissions: permissionsForRole(role),
      // Tells the client this identity is a demo one. Set here rather than read
      // from `env` in the service, because auth.guard.ts is the only file
      // allowed to branch on BYPASS_AUTH, and /auth/me reaches the same fact
      // through the identity this guard built.
      demo: true,
    };
    return true;
  }
}
