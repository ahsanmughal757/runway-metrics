/**
 * The two top-bar controls that only work in one mode.
 *
 * Both were shipped visible in both, which is the same defect as the bootstrap
 * guard this phase started with: a control that looks like it works and does not.
 *
 *   - the viewpoint switcher is answered by `X-Demo-Role`, which only
 *     BypassAuthGuard reads. Against a real session the server ignores the
 *     header and returns the role from the database, so the selected tab springs
 *     back - and a reviewer reads that as "this is what an ADMIN sees".
 *   - sign-out ends the session by revoking the refresh cookie. Demo mode has no
 *     session and no cookie, so the click clears nothing and the app stays fully
 *     populated.
 *
 * The client cannot infer either mode from localStorage: a healthy demo and a
 * signed-out browser are both simply "no token". The server reports it, and these
 * tests hold both that report and the gating to it. Removing either condition
 * from TopBar makes one of them fail.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { renderWithProviders } from '../test/render';
import { TopBar } from './TopBar';

const COMPANY = { id: 'co_1', name: 'Acme', persona: null };
const ME = { companyId: 'co_1', role: 'OWNER', permissions: ['metrics:read', 'metrics:write'] };

/** What the fake server reports about itself. */
let serverIsDemo = true;

/** Mirrors `CompanyProvider` so the tests can wait for the bootstrap to settle. */
function ModeProbe() {
  const { demo } = useCompany();
  return <span data-testid="mode">{demo ? 'demo' : 'real'}</span>;
}

// The chain comes from `test/render` so it matches `main.tsx`. The top bar
// renders `NotificationsBell`, which now reads the activity feed through the
// data layer, so a harness without a `QueryProvider` throws before any of the
// mode gating under test is reached.
function renderTopBar() {
  return renderWithProviders(
    <>
      <ModeProbe />
      <TopBar />
    </>,
  );
}

beforeEach(() => {
  serverIsDemo = true;
  // Only the endpoints TopBar's children actually call. Anything unexpected 500s
  // rather than resolving to a plausible shape, so a new caller cannot pass
  // unnoticed on a stub that answers everything.
  vi.spyOn(api, 'get').mockImplementation((path: string) => {
    switch (path) {
      case '/companies':
        return Promise.resolve([COMPANY]) as ReturnType<typeof api.get>;
      case '/auth/me':
        return Promise.resolve({ ...ME, demo: serverIsDemo }) as ReturnType<typeof api.get>;
      case '/audit/recent':
        return Promise.resolve([]) as ReturnType<typeof api.get>;
      case '/metrics/dashboard':
        return Promise.resolve({ latest: null }) as ReturnType<typeof api.get>;
      default:
        return Promise.reject(new ApiError(`Unexpected GET ${path}`, 500, null, null)) as ReturnType<typeof api.get>;
    }
  });
  vi.spyOn(api, 'post').mockImplementation((path: string) => {
    if (path === '/auth/logout') return Promise.resolve({}) as ReturnType<typeof api.post>;
    return Promise.reject(new ApiError(`Unexpected POST ${path}`, 500, null, null)) as ReturnType<typeof api.post>;
  });
});

describe('TopBar mode-gated controls', () => {
  it('offers the viewpoint switcher in demo mode, where the server honours it', async () => {
    serverIsDemo = true;

    renderTopBar();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('demo'));
    // Asserted by count rather than by label: HeroUI's Tabs emit more than one
    // element carrying the `aria-label`, so a singular label query throws on a
    // match rather than reporting one. The tablist is inline, so this does not
    // depend on popover behaviour.
    expect(screen.queryAllByRole('tablist').length).toBeGreaterThan(0);
  });

  it('hides the viewpoint switcher for a real session, where it is inert', async () => {
    // The regression: shown against a real session, this is a role selector that
    // silently snaps back. Leaving it visible invites the reader to draw a
    // conclusion about permissions that the database, not this control, decides.
    serverIsDemo = false;

    renderTopBar();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('real'));
    expect(screen.queryAllByRole('tablist')).toHaveLength(0);
  });

  it('hides sign-out in demo mode, where there is no session to end', async () => {
    // The regression: clicking it called `logout()`, which cleared nothing -
    // `isAuthenticated` was already false, so the true -> false transition never
    // fired and the tenant stayed on screen. A sign-out that does not sign you
    // out is worse than none, because it implies the session model works.
    serverIsDemo = true;

    renderTopBar();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('demo'));
    await userEvent.click(screen.getByLabelText('Account menu'));
    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
  });

  it('keeps sign-out for a real session, where it revokes the refresh cookie', async () => {
    serverIsDemo = false;

    renderTopBar();

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('real'));
    await userEvent.click(screen.getByLabelText('Account menu'));
    expect(await screen.findByText('Log out')).toBeInTheDocument();
  });
});
