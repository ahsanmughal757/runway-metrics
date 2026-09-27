import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorFunction, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma.service';
import { env, isProduction } from '../config/env';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
  ) {}

  /**
   * Liveness. Deliberately touches no dependency: if this fails the process
   * should be restarted, and a restart will not fix a database outage, so
   * coupling them would turn an outage into a crash loop.
   */
  @Get()
  @HealthCheck()
  live() {
    return this.health.check([
      (): HealthIndicatorResult => ({
        api: { status: 'up', mode: env.ENABLE_DATABASE ? 'database' : 'demo' },
      }),
    ]);
  }

  /**
   * Readiness. Checks real dependencies, and is what the deploy pipeline gates
   * on so a container that cannot serve traffic never receives traffic.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    const checks: HealthIndicatorFunction[] = [];

    if (env.ENABLE_DATABASE) {
      checks.push(async () => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up' } };
        } catch (err) {
          return {
            database: {
              status: 'down',
              // The real driver error can name hosts and schemas. That is
              // fine in a log and not fine in an unauthenticated response.
              message: isProduction ? 'unavailable' : (err as Error).message,
            },
          };
        }
      });
    } else {
      checks.push((): HealthIndicatorResult => ({ database: { status: 'up', mode: 'skipped (demo)' } }));
    }

    return this.health.check(checks);
  }
}
