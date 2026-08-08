import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AuthModule } from '../auth/auth.module';
import { MetricsModule } from '../metrics/metrics.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [AuthModule, MetricsModule, CompaniesModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
