import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * PRD risk: "Data leak across companies". Every scoped route must resolve
 * companyId from the authenticated session, never from client-supplied
 * params/body. This guard rejects any request where a client-supplied
 * companyId param disagrees with the session's companyId.
 */
@Injectable()
export class CompanyScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const sessionCompanyId = req.user?.companyId;
    const paramCompanyId = req.params?.companyId ?? req.body?.companyId ?? req.query?.companyId;

    if (paramCompanyId && paramCompanyId !== sessionCompanyId) {
      throw new ForbiddenException('Company scope mismatch');
    }
    return true;
  }
}
