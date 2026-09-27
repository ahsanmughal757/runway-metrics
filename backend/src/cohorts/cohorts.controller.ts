import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { CohortsService } from './cohorts.service';

@Controller('cohorts')
@UseGuards(AuthGuard, CompanyScopeGuard)
export class CohortsController {
  constructor(private cohorts: CohortsService) {}

  @Get('retention')
  @UseGuards(PermissionsGuard)
  @RequirePermission('customers:read')
  getRetention(@CurrentUser() user: RequestUser) {
    return this.cohorts.getRetentionTable(user.companyId);
  }
}
