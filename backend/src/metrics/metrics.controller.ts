import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { MetricsService } from './metrics.service';
import { UpsertSnapshotDto, ImportCsvDto } from './dto';
import { env } from '../config/env';
import { generateSnapshots } from '../fake-data/generator';
import { PERSONAS, PersonaKey } from '../fake-data/personas';
import { BENCHMARKS, percentileFor } from '../fake-data/benchmarks';

@Controller('metrics')
@UseGuards(AuthGuard, RolesGuard, CompanyScopeGuard)
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: RequestUser) {
    return this.metrics.getDashboard(user.companyId);
  }

  /**
   * Static illustrative benchmark bands with the calling company's latest
   * derived value positioned against each band. Bands are invented seed-stage
   * percentiles — the `disclosure` field must be rendered verbatim in the UI.
   */
  @Get('benchmarks')
  async benchmarks(@CurrentUser() user: RequestUser) {
    const { latest } = await this.metrics.getDashboard(user.companyId);
    const d = latest?.derived;
    return {
      disclosure: BENCHMARKS.disclosure,
      metrics: [
        {
          key: 'burnMultiple',
          label: BENCHMARKS.burnMultiple.label,
          band: BENCHMARKS.burnMultiple.values,
          you: d?.burnMultiple ?? null,
          percentile: d?.burnMultiple != null ? percentileFor(BENCHMARKS.burnMultiple.values, d.burnMultiple) : null,
        },
        {
          key: 'nrr',
          label: BENCHMARKS.nrrPct.label,
          band: BENCHMARKS.nrrPct.values,
          you: d?.nrr ?? null,
          percentile: d?.nrr != null ? percentileFor(BENCHMARKS.nrrPct.values, d.nrr) : null,
        },
        {
          key: 'revenueChurn',
          label: BENCHMARKS.churnPct.label,
          band: BENCHMARKS.churnPct.values,
          you: d?.revenueChurnPct ?? null,
          percentile: d?.revenueChurnPct != null ? percentileFor(BENCHMARKS.churnPct.values, d.revenueChurnPct) : null,
        },
      ],
    };
  }

  // Founder-only: investors get read access via /dashboard, never write access.
  @Post('snapshot')
  @Roles('FOUNDER')
  upsertSnapshot(@CurrentUser() user: RequestUser, @Body() dto: UpsertSnapshotDto) {
    return this.metrics.upsertSnapshot({ ...dto, companyId: user.companyId, month: new Date(dto.month), actorId: user.userId });
  }

  @Delete('snapshot/:month')
  @Roles('FOUNDER')
  deleteSnapshot(@CurrentUser() user: RequestUser, @Param('month') month: string) {
    return this.metrics.deleteSnapshot(user.companyId, new Date(month), user.userId);
  }

  @Post('import/preview')
  @Roles('FOUNDER')
  previewCsv(@CurrentUser() user: RequestUser, @Body() dto: ImportCsvDto) {
    return this.metrics.parseCsvPreview(user.companyId, dto.csv);
  }

  @Post('import/commit')
  @Roles('FOUNDER')
  commitCsv(@CurrentUser() user: RequestUser, @Body() dto: ImportCsvDto) {
    return this.metrics.importAndCommit(user.companyId, dto.csv, user.userId);
  }

  /**
   * Demo-mode-only comparison feed: overlays another persona's MRR series on
   * the dashboard without exposing another tenant's real data. Refuses
   * outright when ENABLE_DATABASE=true — real mode never allows cross-company
   * reads, comparison there would require both companies sharing the same
   * investor's membership, which is out of scope for v1.
   */
  @Get('compare/:persona')
  comparePersona(@Param('persona') persona: string) {
    if (env.ENABLE_DATABASE) {
      return { available: false, reason: 'Cross-company comparison is demo-mode only in v1.' };
    }
    if (!(persona in PERSONAS)) {
      return { available: false, reason: 'Unknown persona.' };
    }
    const snapshots = generateSnapshots(persona as PersonaKey, 24);
    return {
      available: true,
      companyName: PERSONAS[persona as PersonaKey].companyName,
      snapshots: snapshots.map((s) => ({ month: s.month, mrr: s.mrr })),
    };
  }
}
