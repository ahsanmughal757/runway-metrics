import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import { env } from '../../config/env';

/** Stable, documented error envelope. The frontend switches on `code`, never on `message`. */
interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}

interface Normalized {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  /** Log at error level (5xx / unexpected) vs warn (client's fault). */
  logLevel: 'warn' | 'error';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    // requestIdMiddleware sets this before routing, so `unknown` means the
    // filter ran without it -- worth surfacing rather than hiding behind a
    // plausible-looking id.
    const requestId = typeof req.id === 'string' && req.id ? req.id : 'unknown';
    const normalized = this.normalize(exception);

    const logPayload = {
      requestId,
      status: normalized.status,
      code: normalized.code,
      method: req.method,
      path: req.originalUrl,
      // Never log the request body: it carries passwords and, in Phase 3,
      // refresh tokens. Field-level redaction is configured in main.ts.
      err: exception instanceof Error ? exception : new Error(String(exception)),
    };

    if (normalized.logLevel === 'error') {
      this.logger.error(logPayload, normalized.message);
    } else {
      this.logger.warn(logPayload, normalized.message);
    }

    const body: ErrorBody = {
      statusCode: normalized.status,
      code: normalized.code,
      message: normalized.message,
      requestId,
    };
    if (normalized.details !== undefined) body.details = normalized.details;

    // Out-of-band in tests: supertest would otherwise hang on an open handle.
    if (!res.headersSent) {
      res.setHeader('X-Request-Id', requestId);
      res.status(normalized.status).json(body);
    }
  }

  private normalize(exception: unknown): Normalized {
    if (exception instanceof HttpException) {
      const status: number = exception.getStatus();
      const payload = exception.getResponse();
      return {
        status,
        code: codeFromStatus(status),
        message: messageFromPayload(payload, exception.message),
        details: detailsFromPayload(payload),
        // 500+ is the server's fault and must page someone; 4xx is the caller's
        // and belongs in a warning.
        logLevel: status >= Number(HttpStatus.INTERNAL_SERVER_ERROR) ? 'error' : 'warn',
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        logLevel: 'warn',
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.normalizePrisma(exception);
    }

    // Anything reaching here is a bug, not a bad request. The client gets a
    // requestId and nothing else; the stack goes to the logs.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      // Stack traces are a reconnaissance gift. Never in production.
      ...(env.NODE_ENV === 'production' ? {} : { details: { name: (exception as Error)?.name } }),
      logLevel: 'error',
    };
  }

  private normalizePrisma(exception: Prisma.PrismaClientKnownRequestError): Normalized {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'ALREADY_EXISTS',
          message: 'That record already exists',
          details: { fields: (exception.meta?.target as string[] | undefined) ?? undefined },
          logLevel: 'warn',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'That record no longer exists',
          logLevel: 'warn',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'FOREIGN_KEY_VIOLATION',
          message: 'Referenced record does not exist',
          logLevel: 'warn',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'A database error occurred',
          logLevel: 'error',
        };
    }
  }
}

function codeFromStatus(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE',
    429: 'RATE_LIMITED',
  };
  return map[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
}

function messageFromPayload(payload: string | object, fallback: string): string {
  if (typeof payload === 'string') return payload;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return fallback;
}

/** class-validator puts per-field messages in `message`; those already surface via messageFromPayload. */
function detailsFromPayload(payload: string | object): unknown {
  if (typeof payload === 'string') return undefined;
  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) return message;
  return undefined;
}
