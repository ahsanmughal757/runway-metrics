/**
 * The tenant bootstrap, and the two ways of being "not signed in".
 *
 * This file exists because of a specific, twice-repeated failure: demo mode
 * works, so every manual check of the sign-in path passes, and the real-auth
 * path ships broken. The bug under test is therefore never "does the demo load"
 * on its own - it is whether the app asks the *server* who the user is, rather
 * than deciding from localStorage.
 *
 * The distinction these tests defend:
 *
 *   - demo mode  — no token exists, and that is correct and healthy
 *   - signed out — no token exists, and the server answers 401
 *
 * Those two are byte-identical from the browser's point of view. Only a request
 * can separate them, so anything that infers a session from the absence of a
 * token is a bug regardless of how reasonable it looks.
 */
import type { ReactNode } from 'react';
import { act, useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';
import { AuthProvider, useAuth } from './AuthContext';
import { CompanyProvider, useCompany } from './CompanyContext';
import { ACTIVE_COMPANY_KEY, TOKEN_KEY, writeKey } from './storage';

const COMPANY = { id: 'co_1', name: 'Acme', persona: null };
const ME = { companyId: 'co_1', role: 'OWNER', permissions: ['metrics:read', 'metrics:write'] };

/** Latest published context state, written by `Probe` on every commit. */
let company: ReturnType<typeof useCompany> | null = null;
let auth: ReturnType<typeof useAuth> | null = null;

/** What the fake server does, per test. */
let serverMode: 'ok' | 'denied' | 'offline' = 'ok';
/** Flipped by a successful login, so "denied" only refuses anonymous callers. */
let serverHasSession = false;
/**
 * Whether `/auth/me` reports a demo identity.
 *
 * Deliberately a server-supplied value rather than something derived locally.
 * The controls it gates - the viewpoint switcher and sign out - each work in
 * exactly one of the two modes, and the browser cannot tell the modes apart.
 */
let serverIsDemo = true;

/**
 * Replaces the request methods and nothing else.
 *
 * `ApiError` and every other export stay the real ones. The code under test
 * branches on `instanceof ApiError` and on `status`/`isNetwork`, and that
 * branch is the thing under test; a stubbed error class would let the exact
 * distinction this suite protects drift without anything failing. `spyOn` over
 * the exported `api` object keeps the module graph intact, so a future
 * `CompanyContext` import of some other helper keeps working.
 */
function installFakeServer() {
  vi.spyOn(api, 'get').mockImplementation((path: string) => {
    if (serverMode === 'offline') {
      // Status 0 is the client's own encoding for "never reached the server".
      return Promise.reject(new ApiError('Failed to fetch', 0, null, null)) as ReturnType<typeof api.get>;
    }
    if (serverMode === 'denied' && !serverHasSession) {
      return Promise.reject(new ApiError('Unauthorized', 401, 'UNAUTHORIZED', 'req-test')) as ReturnType<typeof api.get>;
    }
    if (path === '/companies') return Promise.resolve([COMPANY]) as ReturnType<typeof api.get>;
    if (path === '/auth/me') return Promise.resolve({ ...ME, demo: serverIsDemo }) as ReturnType<typeof api.get>;
    return Promise.reject(new ApiError(`Unexpected GET ${path}`, 500, null, null)) as ReturnType<typeof api.get>;
  });

  vi.spyOn(api, 'post').mockImplementation((path: string) => {
    if (path === '/auth/logout') {
      serverHasSession = false;
      return Promise.resolve({}) as ReturnType<typeof api.post>;
    }
    if (path === '/auth/login') {
      serverHasSession = true;
      return Promise.resolve({
        accessToken: 'token-abc',
        user: { id: 'u_1', email: 'founder@acme.test', name: null },
        memberships: [{ companyId: COMPANY.id, companyName: COMPANY.name, companySlug: 'acme', role: 'OWNER' }],
      }) as ReturnType<typeof api.post>;
    }
    return Promise.resolve({}) as ReturnType<typeof api.post>;
  });
}

// The contexts are published from a render-time probe so a test always observes
// the state of the tree that is actually mounted. Publishing happens in an
// effect rather than during render: writing module state from render is exactly
// the thing the React Compiler lint rules exist to catch, and they are right
// about it - a component that renders twice would publish a half-built value.
function Probe() {
  const currentCompany = useCompany();
  const currentAuth = useAuth();
  useEffect(() => {
    company = currentCompany;
    auth = currentAuth;
  });
  return null;
}

function renderApp() {
  return render(
    <Providers>
      <Probe />
    </Providers>,
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CompanyProvider>{children}</CompanyProvider>
    </AuthProvider>
  );
}

beforeEach(() => {
  serverMode = 'ok';
  serverHasSession = false;
  serverIsDemo = true;
  installFakeServer();
});

describe('CompanyProvider bootstrap', () => {
  it('loads the tenant in demo mode, which has no token at all', async () => {
    // The regression this suite was added for. Demo mode is
    // `BYPASS_AUTH=true` with no `runway_token` in storage, and it is expected
    // to be fully usable. An implementation that treats a missing token as a
    // signed-out user redirects the demo to /login on every page, and because
    // the demo is the mode people actually run, it looks like a working app.
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();

    renderApp();

    await waitFor(() => expect(company?.activeCompanyId).toBe(COMPANY.id));
    expect(company?.unauthorized).toBe(false);
    expect(company?.companies).toEqual([COMPANY]);
    expect(company?.can('metrics:write')).toBe(true);
  });

  it('reports the mode the server says it is in, not one guessed locally', async () => {
    // `demo` exists so the top bar can show only the controls that can do
    // something: the viewpoint switcher works *only* in demo mode (`X-Demo-Role`
    // is read by BypassAuthGuard alone), and sign-out works *only* against a real
    // session (demo mode has no refresh cookie to revoke, so the click clears
    // nothing and the app stays populated). Two controls, opposite requirements,
    // and no local signal separates the modes - a missing token is what *both* a
    // healthy demo and a signed-out browser look like. So the server reports it,
    // and the client believes that rather than guessing.
    serverIsDemo = true;
    const { unmount } = renderApp();
    await waitFor(() => expect(company?.demo).toBe(true));
    unmount();

    serverIsDemo = false;
    renderApp();
    await waitFor(() => expect(company?.demo).toBe(false));
  });

  it('reports unauthorized when the server refuses an anonymous request', async () => {
    serverMode = 'denied';

    renderApp();

    await waitFor(() => expect(company?.unauthorized).toBe(true));
    expect(company?.activeCompanyId).toBeNull();
  });

  it('distinguishes a dead network from a refusal', async () => {
    // These two used to produce the same screen. Sending a reader whose backend
    // was simply down to a "check that the backend is running" message is at
    // best useless; the same conflation in `Sessions.tsx` told people to enable
    // a database flag that was already on.
    serverMode = 'offline';

    renderApp();

    await waitFor(() => expect(company?.offline).toBe(true));
    expect(company?.unauthorized).toBe(false);
    expect(company?.activeCompanyId).toBeNull();
  });

  it('recovers the tenant after signing in, without a reload', async () => {
    // 3c-2. The bootstrap effect depended only on a stable `useCallback`, so it
    // ran once per page load and never again; `activeCompanyId` stayed null and
    // every page's guard rendered its skeleton forever. The only recovery was a
    // hard refresh. Invisible in demo mode, which is why it shipped.
    serverMode = 'denied';
    renderApp();
    await waitFor(() => expect(company?.unauthorized).toBe(true));

    await act(async () => {
      await auth?.login('founder@acme.test', 'password');
    });

    await waitFor(() => expect(company?.activeCompanyId).toBe(COMPANY.id));
    expect(company?.unauthorized).toBe(false);
  });

  it('drops the previous tenant the moment a real session ends', async () => {
    // Fail closed. A signed-out shell still holding company A's id and cached
    // numbers shows them to whoever opens the app next on a shared machine.
    //
    // Signed in first, deliberately. There is a genuine gap for a session that
    // was never established - see "Found while working on this" in
    // plan/phase-3c-regressions.md.
    serverMode = 'denied';
    renderApp();
    await waitFor(() => expect(company?.unauthorized).toBe(true));

    await act(async () => {
      await auth?.login('founder@acme.test', 'password');
    });
    await waitFor(() => expect(company?.activeCompanyId).toBe(COMPANY.id));

    await act(async () => {
      await auth?.logout();
    });

    expect(company?.activeCompanyId).toBeNull();
    expect(company?.companies).toEqual([]);
    expect(company?.can('metrics:write')).toBe(false);
  });

  it('does not treat an already-present demo company id as a session', async () => {
    // `runway_active_company_id` is a *request* header the server validates, not
    // a credential. It is left in storage across a sign-out so the next request
    // can name a company, and it must not be read as evidence of a login.
    writeKey(ACTIVE_COMPANY_KEY, COMPANY.id);
    serverMode = 'denied';

    renderApp();

    await waitFor(() => expect(company?.unauthorized).toBe(true));
    expect(company?.activeCompanyId).toBeNull();
  });
});
