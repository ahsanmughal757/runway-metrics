/**
 * Counts the failures an operator wants to see a graph of.
 *
 * Phase 6's observability note said auth failures and rate-limit hits are "the
 * signals that matter most here, and both are already computed". They were: the
 * rate limiter knows it rejected a request, and the auth service knows a
 * credential was wrong. Neither said so anywhere a human or a cron job could
 * read, so a brute-force run against `/auth/login` was visible only as a
 * 429-per-second in a log nobody was watching.
 *
 * This is a filter rather than a patch of the rate limiter or the auth service
 * because one place that sees every failure catches all of it — rejections,
 * failed logins, refused company access, unhandled errors — without each service
 * having to remember to report itself. The cost is that the label is the response
 * status, not the reason, so a 401 from an expired token and a 401 from a wrong
 * password are one series. That is acceptable: the operator's question is "is
 * this getting worse", and per-route 401s answer it.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { cardinalityBucket, incrementCounter } from './counters';

/**
 * A bounded, non-identifying name for a route.
 *
 * The tenant routes are all `/companies/:companyId/...`, so recording the raw
 * path would make one series per company and a counter that grows with the number
 * of tenants — the high-cardinality problem in `cardinalityBucket` describes,
 * arrived at by a different route. Two path segments is enough to tell "login is
 * being hammered" from "one company's API keys are being probed", and it is
 * stable: the id is replaced, not kept, so the label is the same whatever the
 * tenant.
 */
function routeLabel(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const [first, second] = segments;
  if (first === undefined) return '/';
  if (second === undefined) return `/${first}`;
  // A second segment that is already a path parameter (the routers declare
  // `:companyId`, never a literal in the URL) is collapsed so the label does not
  // change shape between `/companies/abc/members` and `/companies/xyz/members`.
  return `/${first}/${second.startsWith(':') ? ':id' : second}`;
}

@Catch()
export class MetricsFilter implements ExceptionFilter {
  /**
   * @param delegate the filter that actually writes the response. Nest runs the
   * first matching global filter and none of the rest, so a filter that only
   * counts and returns would swallow every response in the app — every failed
   * request would hang until it timed out rather than answering. Delegating is
   * not optional and is the reason this class wraps rather than replaces.
   */
  constructor(private readonly delegate: AllExceptionsFilter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const labels = {
      status,
      method: req.method,
      route: routeLabel(req.path),
      // Bucketed to a constant, not kept raw: a distinct IP per failed login is
      // an unbounded key space anyone can grow at will, and the address is not
      // what is being investigated — the rate of failures is.
      ip: cardinalityBucket(req.ip ?? '', 0),
    };

    // Split by status because the three mean different things to an operator and
    // lumping them is what makes a dashboard useless: 5xx is this process
    // broken, 429 is someone being stopped, and 401/403 is someone trying
    // something they should not. 4xx below 400-class otherwise is a client
    // sending nonsense — counted because a sudden spike means a broken client
    // deploy, but not worth a page.
    if (status >= 500) {
      incrementCounter('http_error_5xx', labels);
    } else if (status === 429) {
      incrementCounter('rate_limit_hit', labels);
    } else if (status === 401 || status === 403) {
      incrementCounter('auth_rejected', labels);
    } else {
      incrementCounter('http_client_error', labels);
    }

    // Hand off, before the early return below, so a counted failure still gets
    // its response. Ordering matters: the count must happen even if the delegate
    // throws, or a filter bug loses the very signal the counter exists for.
    this.delegate.catch(exception, host);
  }
}
