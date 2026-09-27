import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsRepository } from './metrics.repository';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, CompaniesModule, AuditModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsRepository],
  exports: [MetricsService],
})
export class MetricsModule {}
