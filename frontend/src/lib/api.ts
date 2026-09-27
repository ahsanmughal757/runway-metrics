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
const BASE = '/api';
const TOKEN_KEY = 'runway_token';
const ACTIVE_COMPANY_KEY = 'runway_active_company_id';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  const activeCompanyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  const demoCompanyId = localStorage.getItem('runway_demo_company_id');
  const demoRole = localStorage.getItem('runway_demo_role');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeCompanyId ? { 'X-Company-Id': activeCompanyId } : {}),
    // Only meaningful when the API is running with BYPASS_AUTH=true; ignored otherwise.
    ...(demoCompanyId ? { 'X-Demo-Company-Id': demoCompanyId } : {}),
    ...(demoRole ? { 'X-Demo-Role': demoRole } : {}),
  };
}

/**
 * Fired when the server has told us the session is over, so `AuthContext` can
 * drop the UI without this module having to know that React exists.
 */
export const SIGNED_OUT_EVENT = 'runway:signed-out';

/** Forgets the session. The refresh cookie is cleared by `/auth/logout`. */
export function endLocalSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTIVE_COMPANY_KEY);
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
      localStorage.setItem(TOKEN_KEY, body.accessToken);
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
 * Whether a 401 on this path is worth a refresh.
 *
 * A 401 from a credential endpoint is the server correctly saying "those
 * credentials are wrong" - refreshing and retrying would just turn a clear error
 * into a confusing one, and would mint tokens for a session that does not exist.
 */
function shouldRefresh(path: string, alreadyRetried: boolean | undefined): boolean {
  if (alreadyRetried) return false;
  if (!localStorage.getItem(TOKEN_KEY)) return false;
  return !/^\/auth\/(login|register|refresh|logout)$/.test(path);
}

type InternalOptions = RequestInit & { alreadyRetried?: boolean };

async function request<T>(path: string, options: InternalOptions = {}): Promise<T> {
  const { alreadyRetried, ...init } = options;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status === 204) return undefined as T;
  return (contentType.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};
