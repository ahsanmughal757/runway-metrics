import { Body, Controller, Header, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { IsArray, IsString } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { MetricsService } from '../metrics/metrics.service';
import { CompaniesRepository } from '../companies/companies.repository';
import { renderInvestorUpdatePdf } from './investor-update.pdf.tsx';

class NarrativeSectionDto {
  @IsString() heading!: string;
  @IsString() body!: string;
}

class GenerateReportDto {
  @IsString() periodLabel!: string;
  @IsArray() narrativeSections!: NarrativeSectionDto[];
}

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard, CompanyScopeGuard)
export class ReportsController {
  constructor(private metrics: MetricsService, private companies: CompaniesRepository) {}

  // Founder builds/exports the update; investors receive the PDF, they don't generate it.
  @Post('investor-update')
  @Roles('FOUNDER')
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
    res.send(pdf);
  }
}
