import { Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { MetricsService } from '../metrics/metrics.service';
import { ShareService } from './share.service';

@Controller()
export class ShareController {
  constructor(
    private shares: ShareService,
    private metrics: MetricsService,
  ) {}

  @Post('reports/share-link')
  @UseGuards(AuthGuard, CompanyScopeGuard, PermissionsGuard)
  @RequirePermission('reports:share')
  createShareLink(@CurrentUser() user: RequestUser) {
    return this.shares.create(user.companyId, user.userId);
  }

  @Get('reports/share-links')
  @UseGuards(AuthGuard, CompanyScopeGuard, PermissionsGuard)
  @RequirePermission('reports:share')
  listShareLinks(@CurrentUser() user: RequestUser) {
    return this.shares.list(user.companyId);
  }

  @Delete('reports/share-links/:id')
  @UseGuards(AuthGuard, CompanyScopeGuard, PermissionsGuard)
  @RequirePermission('reports:share')
  async revokeShareLink(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.shares.revoke(user.companyId, id, user.userId);
    return { revoked: true };
  }

  /**
   * Public, token-gated dashboard feed. No auth guard here by design - the token
   * is the credential.
   *
   * Throttled on its own budget because it is the one endpoint reachable without
   * a session, and each hit is a database read. A stricter limit than the
   * company-wide default would be a denial-of-service risk against a shared
   * investor; this is a floor rather than a ceiling.
   */
  @Get('public/dashboard/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async publicDashboard(@Param('token') token: string) {
    const companyId = await this.shares.resolve(token);
    if (!companyId) {
      // One message for unknown, expired and revoked, so a caller cannot use the
      // error to learn which of those it was.
      throw new NotFoundException('Invalid or expired share link');
    }
    return this.metrics.getDashboard(companyId);
  }
}
