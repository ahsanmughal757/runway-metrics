import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(AuthGuard, CompanyScopeGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get('recent')
  recent(@CurrentUser() user: RequestUser) {
    return this.audit.recent(user.companyId);
  }
}
