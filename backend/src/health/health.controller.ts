import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorFunction, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma.service';
import { snapshotCounters } from '../common/observability/counters';
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

  /**
   * Counters, on a separate path from `/health` rather than inside it.
   *
   * Two reasons. A probe cannot be made to fail by an observability bug: if
   * this route threw, the container's liveness check would restart a process
   * that is serving traffic perfectly well, which is the availability incident
   * this app exists to avoid. And the numbers are read far less often than
   * health is checked, so keeping them off the probe path means an expired
   * dashboard does not look like a database outage.
   *
   * Unauthenticated, and that is a considered choice rather than an oversight.
   * The counters contain failure *rates* and route names, no identifiers, and
   * an auth header here would be one more thing to configure before anyone can
   * answer "is the login rate limit being hit". If the route list is ever
   * considered sensitive, the fix is to drop it from the payload, not to add a
   * credential — a metrics endpoint behind auth is a metrics endpoint nobody
   * checks after the first auth failure.
   *
   * Throttled like everything else, deliberately. Unthrottled would be the
   * obvious choice for "a machine scrapes this", but the rate limit is what
   * stops a scraper becoming a denial of service against the health API, and an
   * operator polling this in a loop is not a load anyone planned for. The
   * numbers are cumulative, so a skipped poll costs nothing.
   */
  @Get('metrics')
  metrics() {
    return snapshotCounters();
  }
}
