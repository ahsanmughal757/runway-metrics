import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

@Controller('metrics')
@UseGuards(AuthGuard, RolesGuard, CompanyScopeGuard)
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: RequestUser) {
    return this.metrics.getDashboard(user.companyId);
  }

  // Founder-only: investors get read access via /dashboard, never write access.
  @Post('snapshot')
  @Roles('FOUNDER')
  upsertSnapshot(@CurrentUser() user: RequestUser, @Body() dto: UpsertSnapshotDto) {
    return this.metrics.upsertSnapshot({ ...dto, companyId: user.companyId, month: new Date(dto.month) });
  }

  @Post('import/preview')
  @Roles('FOUNDER')
  previewCsv(@CurrentUser() user: RequestUser, @Body() dto: ImportCsvDto) {
    return this.metrics.parseCsvPreview(user.companyId, dto.csv);
  }

  @Post('import/commit')
  @Roles('FOUNDER')
  async commitCsv(@CurrentUser() user: RequestUser, @Body() dto: ImportCsvDto) {
    const { rows, errors } = this.metrics.parseCsvPreview(user.companyId, dto.csv);
    if (errors.length > 0) return { committed: 0, errors };
    const committed = await this.metrics.commitCsv(user.companyId, rows);
    return { committed, errors: [] };
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
