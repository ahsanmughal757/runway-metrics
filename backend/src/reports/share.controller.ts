import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { MetricsService } from '../metrics/metrics.service';
import { ShareService } from './share.service';

@Controller()
export class ShareController {
  constructor(private shares: ShareService, private metrics: MetricsService) {}

  // Founder creates the share link; the token (not auth) gates the read view.
  @Post('reports/share-link')
  @UseGuards(AuthGuard, RolesGuard, CompanyScopeGuard)
  @Roles('FOUNDER')
  createShareLink(@CurrentUser() user: RequestUser) {
    return this.shares.create(user.companyId);
  }

  // Public, token-gated dashboard feed — no auth guard here by design.
  @Get('public/dashboard/:token')
  async publicDashboard(@Param('token') token: string) {
    const companyId = this.shares.resolve(token);
    if (!companyId) {
      throw new NotFoundException('Invalid or expired share link');
    }
    return this.metrics.getDashboard(companyId);
  }
}
