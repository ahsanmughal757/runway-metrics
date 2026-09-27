import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { env } from '../../config/env';
import { REDACTED_PATHS, REDACTION_REPLACEMENT } from './redaction';

/**
 * Structured JSON logs with a correlation id on every request.
 *
 * `genReqId` honours an inbound `x-request-id` so a request can be traced from
 * the nginx access log through the app, which matters when the only way to
 * correlate a user's 500 with a log line is a timestamp.
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        name: 'runway-api',
        level: env.LOG_LEVEL,
        // Pretty output is a dev affordance; production ships JSON only so the
        // collector never has to parse. env.ts refuses LOG_PRETTY in production.
        transport: env.LOG_PRETTY
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
          : undefined,
        redact: { paths: [...REDACTED_PATHS], censor: REDACTION_REPLACEMENT },
        // The id is already resolved and stored on the request by
        // requestIdMiddleware, so Pino and the error envelope quote the same
        // value rather than each inventing one.
        genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        // Query strings routinely carry filter values but never secrets; the
        // body is never logged at all.
        serializers: {
          req: (req: IncomingMessage & { id?: unknown }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            userAgent: req.headers['user-agent'],
          }),
          res: (res: ServerResponse & { statusCode?: number }) => ({ statusCode: res.statusCode }),
        },
        // Health checks run every few seconds and would dominate the log volume.
        // pino-http types `ignore` against a request shape that only declares
        // `headers`, so `url` has to be read off a cast.
        autoLogging: { ignore: (req) => isNoisyUrl((req as { url?: string }).url) },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}

/** Endpoints that are polled on a timer and would bury real traffic in noise. */
function isNoisyUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url === '/health' || url === '/health/ready' || url.startsWith('/api/docs');
}
