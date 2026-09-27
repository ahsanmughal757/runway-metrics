import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { AuthModule } from '../auth/auth.module';
import { MetricsModule } from '../metrics/metrics.module';
import { CompaniesModule } from '../companies/companies.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, MetricsModule, CompaniesModule, AuditModule],
  controllers: [ReportsController, ShareController],
  providers: [ShareService],
})
export class ReportsModule {}
