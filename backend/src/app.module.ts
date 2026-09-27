import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { MetricsModule } from './metrics/metrics.module';
import { CohortsModule } from './cohorts/cohorts.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { LoggerModule } from './common/logging/logger.module';
import { PrismaModule } from './prisma.module';
import { env } from './config/env';

@Module({
  imports: [
    // config/env.ts owns loading the .env file and has already validated it by
    // the time this module body runs, so the file loader is disabled here to
    // avoid a second, order-dependent read.
    ConfigModule.forRoot({ isGlobal: true, cache: true, ignoreEnvFile: true }),
    // Must be first: it installs the request-id + redaction middleware that
    // everything else logs through.
    LoggerModule,
    PrismaModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: env.RATE_LIMIT_TTL_SECONDS * 1000,
          limit: env.RATE_LIMIT_MAX,
        },
      ],
    }),
    AuthModule,
    CompaniesModule,
    MetricsModule,
    CohortsModule,
    ReportsModule,
    AuditModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
