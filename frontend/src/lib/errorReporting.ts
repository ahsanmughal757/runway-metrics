/**
 * A single place to report an unexpected error, in a form that costs nothing
 * when nobody has configured a destination.
 *
 * Phase 6's scope said "wire up Sentry or equivalent for both halves", and the
 * reason that is not a hard dependency is worth stating plainly: the alternative
 * is a third-party script in `index.html` that runs before the app does, on a
 * portfolio project that has no Sentry project and no reason to have one. So
 * the transport is the browser's own `navigator.sendBeacon`, and the project
 * is whatever ingest URL the operator puts in `VITE_ERROR_REPORTING_URL`.
 *
 * That means the app sends errors to an endpoint the operator controls, and the
 * no-endpoint case is the same as before this existed: `console.error`. If
 * `VITE_ERROR_REPORTING_URL` is unset — which is the case in every checked-in
 * environment, because it is a secret-bearing URL and belongs in a local
 * `.env` — nothing is sent anywhere and this is a no-op.
 *
 * Rejected: `@sentry/react`. It would have been the conventional choice, and it
 * is the wrong one here. It adds a dependency to bundle and install, needs a
 * DSN compiled into the built assets, and its `beforeSend` hook exists mostly to
 * tell you what it should not send. The reporting we need here is "an error
 * escaped the boundary, here is the message and where", and `sendBeacon` says
 * exactly that in twelve lines with no way to leak anything by accident.
 */

/** Cap the payload. A stack trace is kilobytes; an endpoint that rejects it teaches nobody anything. */
const MAX_BODY_BYTES = 8_000;

export interface ReportContext {
  /** Where it happened, in the operator's words. Used as a grouping key. */
  source: string;
  /** The component stack, when the caller has one. */
  componentStack?: string;
  readonly [key: string]: unknown;
}

/**
 * The configured endpoint, or null. Read once per call rather than cached, so a
 * value injected at runtime by a hosting platform's config script is picked up
 * without a rebuild.
 */
function endpoint(): string | null {
  const configured = import.meta.env.VITE_ERROR_REPORTING_URL;
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : null;
}

export function reportError(error: unknown, context: ReportContext): void {
  // Always to the console. An operator with no endpoint configured still needs
  // the error in front of them, and the browser console is the only place it
  // will exist.
  console.error(`[${context.source}]`, error, context.componentStack ?? '');

  const url = endpoint();
  if (url === null) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined;

  let body: string;
  try {
    body = JSON.stringify({
      source: context.source,
      message,
      stack,
      componentStack: context.componentStack,
      url: typeof window === 'undefined' ? null : window.location.href,
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      // Deliberately no request id. The backend does stamp one on every
      // response and `ApiError.requestId` carries it, so a *failed request* can
      // be correlated with the server log. A boundary error is by definition
      // not a failed request, so the id would be absent anyway — reading one
      // from storage here would have meant inventing a second cache to keep it
      // in, for a field that is always null.
      at: new Date().toISOString(),
      detail: context,
    });
  } catch {
    // A context carrying something unserialisable (a DOM node, a cycle) is a
    // bug in the caller, not a reason to lose the original error. The console
    // line above already happened, so the error is not lost.
    return;
  }

  const payload = body.length > MAX_BODY_BYTES ? `${body.slice(0, MAX_BODY_BYTES)}"` : body;

  try {
    // sendBeacon rather than fetch: it survives a page unload, which is exactly
    // when a boundary error and a navigation tend to coincide, and it is
    // fire-and-forget by specification so there is no rejection to handle.
    // The Blob carries an application/json content type, which a bare string
    // would not and which many endpoints require.
    const blob = new Blob([payload], { type: 'application/json' });
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return;
    }
    navigator.sendBeacon(url, blob);
  } catch {
    // Reporting an error must never itself throw into a render path. A failed
    // report is a missing report, which is regrettable but not worth turning
    // into a second crash on top of the first.
  }
}
