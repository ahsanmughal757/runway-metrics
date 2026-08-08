import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Active only when env.BYPASS_AUTH=true (dev/demo mode). Injects a fixed
 * demo Founder identity so the whole app is explorable with zero setup.
 * env.ts throws at boot if this were ever combined with NODE_ENV=production.
 */
const KNOWN_DEMO_COMPANIES = new Set(['demo-company-steady', 'demo-company-hypergrowth', 'demo-company-struggling']);
const KNOWN_ROLES = new Set(['FOUNDER', 'INVESTOR']);

@Injectable()
export class BypassAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // Demo mode still lets the frontend's company switcher / role toggle work,
    // via plain request headers — never trusted as real auth, only used to pick
    // which canned demo identity to inject. Falls back to safe defaults.
    const requestedCompany = req.headers['x-demo-company-id'];
    const requestedRole = String(req.headers['x-demo-role'] ?? '').toUpperCase();

    req.user = {
      userId: 'demo-user',
      email: 'demo.founder@runway.local',
      companyId: KNOWN_DEMO_COMPANIES.has(requestedCompany) ? requestedCompany : 'demo-company-steady',
      role: KNOWN_ROLES.has(requestedRole) ? requestedRole : 'FOUNDER',
    };
    return true;
  }
}
