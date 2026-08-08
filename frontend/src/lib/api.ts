/**
 * Thin fetch wrapper. In BYPASS_AUTH demo mode the backend ignores the
 * Authorization header entirely, so this works unmodified in both modes —
 * only the token itself is meaningless in demo mode.
 */
const BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('runway_token');
  const demoCompanyId = localStorage.getItem('runway_demo_company_id');
  const demoRole = localStorage.getItem('runway_demo_role');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  });
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
};
