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

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('runway_token');
  const activeCompanyId = localStorage.getItem('runway_active_company_id');
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
    // Send cookies on cross-origin dev setups. Phase 3 moves the refresh token
    // into an httpOnly cookie, and this is what makes that work without a proxy.
    credentials: 'include',
  });
  if (res.status === 401 && !localStorage.getItem('runway_refresh_attempted')) {
    // A single refresh-and-retry, guarded so a persistently rejected session
    // cannot loop. The refresh call itself is issued without this flag.
    localStorage.setItem('runway_refresh_attempted', '1');
    try {
      const refreshed = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (refreshed.ok) {
        const body = (await refreshed.json()) as { accessToken?: string };
        if (body.accessToken) localStorage.setItem('runway_token', body.accessToken);
        localStorage.removeItem('runway_refresh_attempted');
        return request<T>(path, options);
      }
    } catch {
      // fall through to the error below
    } finally {
      localStorage.removeItem('runway_refresh_attempted');
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
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
