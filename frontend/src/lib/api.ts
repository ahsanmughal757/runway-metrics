/**
 * Thin fetch wrapper.
 *
 * The active company is sent as `X-Company-Id` on every request. The server
 * treats it as a request, not a credential: it resolves which of the caller's
 * own memberships to use and rejects the request if they have no membership
 * there. That is why the header is safe to keep in localStorage - it can select
 * a company, but it cannot grant access to one.
 *
 * In BYPASS_AUTH demo mode the token is ignored and `X-Demo-*` selects a canned
 * identity instead, so this works unmodified in both modes.
 */
import { ACTIVE_COMPANY_KEY, DEMO_ROLE_KEY, TOKEN_KEY, clearSession, readKey, writeKey } from './storage';

const BASE = '/api';

/**
 * How long a request may hang before the caller is told it failed.
 *
 * A fetch with no timeout is a page that never finishes loading: the API
 * accepts the connection, the process is wedged, and the browser waits
 * indefinitely. The skeleton stays up with no message and no way out, which
 * reads as "the app is broken" rather than "the request is slow". Long enough
 * that a cold database or a large cohort query is not cut off, short enough
 * that a wedged process is noticed. Phase 5 replaces this per-request default
 * with the data layer's own abort handling; it lives here until then.
 */
const REQUEST_TIMEOUT_MS = 20_000;

function authHeaders(): Record<string, string> {
  const token = readKey(TOKEN_KEY);
  const activeCompanyId = readKey(ACTIVE_COMPANY_KEY);
  const demoRole = readKey(DEMO_ROLE_KEY);
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeCompanyId ? { 'X-Company-Id': activeCompanyId } : {}),
    // Only meaningful when the API is running with BYPASS_AUTH=true; ignored otherwise.
    ...(demoRole ? { 'X-Demo-Role': demoRole } : {}),
  };
}

/**
 * A failed request, carrying enough for a caller to decide what to do.
 *
 * The message alone is not enough. `Sessions.tsx` rendered an "set
 * `ENABLE_DATABASE=true`" hint for *every* failure - a 401, a 403 and a 500 all
 * produced the same wrong instruction, because the old client threw
 * `new Error(body.message)` and discarded the status. The server already sends
 * a stable machine-readable `code` and an `X-Request-Id` on every response, so
 * both are surfaced here and no caller has to parse message text to find out
 * what happened.
 */
export class ApiError extends Error {
  readonly status: number;
  /** The server's stable error code, e.g. `FORBIDDEN`, `RATE_LIMITED`. */
  readonly code: string | null;
  /** Correlates the failure with a server log line. Null if the header was lost. */
  readonly requestId: string | null;

  constructor(message: string, status: number, code: string | null, requestId: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  /** The session is gone server-side and a refresh will not bring it back. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** The caller is authenticated but not allowed. Worth a different message than a 500. */
  get isPermission(): boolean {
    return this.status === 403 || this.code === 'FORBIDDEN';
  }

  /** The request never reached the server, or the server never answered. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

/**
 * Fired when the server has told us the session is over, so `AuthContext` can
 * drop the UI without this module having to know that React exists.
 */
export const SIGNED_OUT_EVENT = 'runway:signed-out';

/** Forgets the session. The refresh cookie is cleared by `/auth/logout`. */
export function endLocalSession() {
  clearSession();
}

function announceSignedOut() {
  endLocalSession();
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}

/**
 * The refresh call in flight, if any.
 *
 * Held in a variable rather than re-issued per failed request because a page
 * load fires several requests at once. Without this, a dashboard with four
 * widgets all 401 at the same moment sends four refreshes - and since each
 * refresh *rotates* the token, three of them present a token the server has
 * already spent. Reuse detection then correctly revokes the family, and a
 * perfectly good session is destroyed by the client retrying carelessly.
 */
let inflightRefresh: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  inflightRefresh ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken?: string };
      if (!body.accessToken) return null;
      writeKey(TOKEN_KEY, body.accessToken);
      return body.accessToken;
    } catch {
      // Offline, or the API is not running. Same outcome as a rejected token.
      return null;
    } finally {
      // Cleared once the attempt settles, so a later 401 can try again: a token
      // that worked a minute ago may have expired in the meantime.
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

/**
 * Paths where a 401 must never trigger a refresh.
 *
 * Two groups, for different reasons:
 *
 * - Credential endpoints. A 401 from `/auth/login` is the server correctly
 *   saying "those credentials are wrong". Refreshing and retrying turns a clear
 *   error into a confusing one and can mint tokens for a session that does not
 *   exist. A wrong password must not produce a token.
 * - Public routes. `/public/dashboard/:token` is reached by an investor who may
 *   never have signed in, and `/invites/*` by someone holding a link. If a stale
 *   `runway_token` happens to be in localStorage, a 401 there used to attempt a
 *   refresh, fail, and call `announceSignedOut()` - signing the *real* user out
 *   of their own account while they were on a page that needs no session at all.
 */
const NO_REFRESH_PATHS = /^\/(auth\/(login|register|refresh|logout)|public\/|invites\/(preview|redeem))/;

function shouldRefresh(path: string, alreadyRetried: boolean | undefined): boolean {
  if (alreadyRetried) return false;
  if (!readKey(TOKEN_KEY)) return false;
  return !NO_REFRESH_PATHS.test(path);
}

type InternalOptions = RequestInit & { alreadyRetried?: boolean };

/** Reads the error envelope, tolerating a proxy that answered with HTML. */
async function toApiError(res: Response): Promise<ApiError> {
  const requestId = res.headers.get('X-Request-Id');
  // A reverse proxy 502 is HTML, and `.json()` on it throws. The `.catch` keeps
  // the status rather than losing it to a parse error, which is how "502 Bad
  // Gateway" used to arrive as a bare "Request failed: 502" with no detail.
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  return new ApiError(body.message ?? `Request failed: ${res.status}`, res.status, body.code ?? null, requestId);
}

/**
 * `fetch` that fails on its own instead of hanging.
 *
 * `AbortSignal.timeout` rather than a `setTimeout` + `clearTimeout` pair so the
 * timer cannot outlive the request and reject a promise nobody is awaiting,
 * which is the usual source of unhandled rejections in an aborted fetch.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new ApiError(
        `Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. The server may be down.`,
        0,
        'TIMEOUT',
        null,
      );
    }
    // Offline, DNS failure, connection refused. `status: 0` marks "never reached
    // the server", which is a different message from any 4xx or 5xx.
    throw new ApiError('Could not reach the server. Check your connection.', 0, 'NETWORK_ERROR', null);
  }
}

async function request<T>(path: string, options: InternalOptions = {}): Promise<T> {
  const { alreadyRetried, ...init } = options;
  const hasBody = init.body !== undefined && init.body !== null;

  const res = await fetchWithTimeout(`${BASE}${path}`, {
    ...init,
    headers: {
      // Only when there is something to send. Setting it on a bodiless GET or on
      // the PDF blob request is harmless same-origin, but it forces a CORS
      // preflight on every read in a split-origin deployment, which is a
      // pointless round trip per request.
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...init.headers,
    },
    // The refresh token now lives in an httpOnly cookie, so the browser has to
    // be told to attach it. Same-origin in production; needed in dev too.
    credentials: 'include',
  });

  if (res.status === 401 && shouldRefresh(path, alreadyRetried)) {
    const token = await refreshAccessToken();
    if (token) return request<T>(path, { ...init, alreadyRetried: true });
    // The refresh token is spent, expired, or was revoked from another device.
    // Nothing left to sign in with, so stop pretending otherwise.
    announceSignedOut();
  }

  if (!res.ok) throw await toApiError(res);

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  return (contentType.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
};
