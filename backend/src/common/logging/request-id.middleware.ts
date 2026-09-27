import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Resolves one correlation id per request and makes it available to everything
 * downstream: the response header, the Pino access log, and the exception
 * filter's error body.
 *
 * This is explicit middleware rather than relying on pino-http to set `req.id`.
 * The error envelope in particular has to be able to quote an id that matches
 * the log line, and an id that only exists inside a log serializer cannot be
 * read back out to build an HTTP response. An inbound id is honoured so a
 * request can be traced from the nginx access log through to the log line.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;

  // Untrusted input, so it is length- and charset-bounded before it reaches a
  // log aggregator; anything else is replaced rather than sanitised.
  const id = candidate && /^[A-Za-z0-9._-]{1,128}$/.test(candidate) ? candidate : randomUUID();

  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
