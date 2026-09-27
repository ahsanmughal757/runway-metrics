import { Body, Controller, Header, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { IsArray, IsString } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { MetricsService } from '../metrics/metrics.service';
import { CompaniesRepository } from '../companies/companies.repository';
import { AuditService } from '../audit/audit.service';
import { renderInvestorUpdatePdf } from './investor-update.pdf';

class NarrativeSectionDto {
  @IsString() heading!: string;
  @IsString() body!: string;
}

class GenerateReportDto {
  @IsString() periodLabel!: string;
  @IsArray() narrativeSections!: NarrativeSectionDto[];
}

@Controller('reports')
@UseGuards(AuthGuard, CompanyScopeGuard)
export class ReportsController {
  constructor(
    private metrics: MetricsService,
    private companies: CompaniesRepository,
    private audit: AuditService,
  ) {}

  // ANALYST and above build the update. Investors receive the PDF; they do not
  // author it, which is why this is a permission and not a role name.
  @Post('investor-update')
  @UseGuards(PermissionsGuard)
  @RequirePermission('reports:generate')
  @Header('Content-Type', 'application/pdf')
  async generateInvestorUpdate(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateReportDto,
    @Res() res: Response,
  ) {
    const [{ snapshots, latest }, settings] = await Promise.all([
      this.metrics.getDashboard(user.companyId),
      this.companies.getSettings(user.companyId),
    ]);
    const pdf = await renderInvestorUpdatePdf({
      companyName: settings.name,
      periodLabel: dto.periodLabel,
      narrativeSections: dto.narrativeSections,
      latest: {
        mrr: latest?.mrr ?? 0,
        momGrowthRate: latest?.derived.momGrowthRate ?? null,
        runwayMonths: latest?.derived.runwayMonths ?? null,
        nrr: latest?.derived.nrr ?? null,
        revenueChurnPct: latest?.derived.revenueChurnPct ?? null,
        cash: latest?.cash ?? 0,
      },
      snapshots,
      generatedAt: new Date().toLocaleDateString('en-US', { dateStyle: 'medium' }),
    });
    res.setHeader('Content-Disposition', 'attachment; filename="investor-update.pdf"');
    // No transaction here, and deliberately so: generating a report reads data
    // and writes nothing, so there is no mutation for the audit entry to be
    // atomic with. This is the standalone `record` path, not the `recordIn` one.
    await this.audit.record({
      companyId: user.companyId,
      entityId: `report:${dto.periodLabel}`,
      entityType: 'REPORT',
      action: 'GENERATED',
      actorId: user.userId,
      diff: { periodLabel: dto.periodLabel, sectionCount: dto.narrativeSections.length },
    });
    res.send(pdf);
  }
}
