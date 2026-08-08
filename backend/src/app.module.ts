import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { MetricsModule } from './metrics/metrics.module';
import { CohortsModule } from './cohorts/cohorts.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CompaniesModule,
    MetricsModule,
    CohortsModule,
    ReportsModule,
    AuditModule,
  ],
})
export class AppModule {}
