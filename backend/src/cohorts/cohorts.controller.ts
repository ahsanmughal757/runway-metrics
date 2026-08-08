import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { CohortsService } from './cohorts.service';

@Controller('cohorts')
@UseGuards(AuthGuard, RolesGuard, CompanyScopeGuard)
export class CohortsController {
  constructor(private cohorts: CohortsService) {}

  @Get('retention')
  getRetention(@CurrentUser() user: RequestUser) {
    return this.cohorts.getRetentionTable(user.companyId);
  }
}
