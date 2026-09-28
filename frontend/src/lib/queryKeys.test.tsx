/**
 * The two tests this phase exists to make impossible.
 *
 * Neither can be written as a backend test, and that is the point. In both
 * failures every HTTP request is correctly authorised and correctly answered -
 * the wrong thing reaches the screen because the browser was still holding data
 * that belonged to a different tenant, or because an older response landed
 * after a newer one. The server is not involved in the defect, so a test that
 * only exercises the server passes while the product is broken.
 *
 * They run against the real `QueryProvider` and the real API client, with only
 * `fetch` faked. A test that mocked the data layer would assert the key was
 * spelled correctly, not that the wrong company's data stayed off the screen,
 * and the key is the thing most likely to be "simplified" later.
 *
 * Both tests switch company by re-rendering the same mounted tree rather than
 * unmounting and mounting again. That is deliberate and it was the first version
 * of this file's fault: a second `render` builds a second `QueryProvider` and
 * therefore a second cache, so the switch would have started from an empty one
 * and proved nothing. The hazard only exists while the cache is warm, which is
 * the state a real user is in when they change company in the top bar.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from './QueryContext';
import { api } from './api';
import { companyKeys } from './queryKeys';
import type { DashboardResponse } from './types';

const COMPANY_A = 'co_alpha';
const COMPANY_B = 'co_beta';
const ACTIVE_KEY = 'runway_active_company_id';

/** A response distinguishable only by which company asked for it. */
function dashboardFor(companyId: string, mrr: number): DashboardResponse {
  return {
    latest: { month: '2026-01-01', mrr, newMrr: 0, expansionMrr: 0, contractionMrr: 0, churnedMrr: 0 },
    snapshots: [],
    customers: { total: 0, new: 0, churned: 0 },
    runway: { months: 12, burnRate: 0, cash: 0 },
  } as unknown as DashboardResponse;
}

/**
 * Stands in for a page: the dashboard for whichever company is active.
 *
 * `useCompany` is deliberately not used. The tenant switch under test is the
 * prop, which keeps the component small enough that a failure points at the
 * cache rather than at React.
 */
function DashboardFor({ companyId }: { companyId: string | null }) {
  const { data, isPending, isError } = useQuery({
    queryKey: companyKeys.dashboard(companyId),
    queryFn: ({ signal }) => api.get<DashboardResponse>('/metrics/dashboard', signal),
    // The rule from the phase doc: no company means no request. Not a shared
    // key, and not a request fired and cancelled.
    enabled: companyId !== null,
  });

  if (isError) return <p>failed</p>;
  if (isPending) return <p>loading</p>;
  // `latest` is nullable in the real type because a company with no snapshots
  // has none. The stub always supplies one, so the guard here is only for the
  // compiler - and the alternative, a non-null assertion, would be the
  // kind of thing that hides a real change to that type later.
  if (!data.latest) return <p>no data</p>;
  return <p>mrr {data.latest.mrr}</p>;
}

/** Mounts the app once. Switch companies with the returned `rerender`. */
function mountApp(companyId: string | null) {
  const view = render(
    <QueryProvider>
      <DashboardFor companyId={companyId} />
    </QueryProvider>,
  );

  return {
    ...view,
    switchTo(next: string) {
      localStorage.setItem(ACTIVE_KEY, next);
      view.rerender(
        <QueryProvider>
          <DashboardFor companyId={next} />
        </QueryProvider>,
      );
    },
  };
}

/** Answers per the `X-Company-Id` the real client sends, so it authorises the way the API does. */
function stubServerByHeader(mrr: Record<string, number>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    const company = (init?.headers as Record<string, string> | undefined)?.['X-Company-Id'] ?? COMPANY_A;
    calls.push(company);
    return new Response(JSON.stringify(dashboardFor(company, mrr[company] ?? 0)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

describe('tenant isolation', () => {
  it('does not show the previous company\'s data after switching', async () => {
    const calls = stubServerByHeader({ [COMPANY_A]: 1000, [COMPANY_B]: 9000 });

    localStorage.setItem(ACTIVE_KEY, COMPANY_A);
    const app = mountApp(COMPANY_A);
    await waitFor(() => expect(screen.getByText('mrr 1000')).toBeInTheDocument());

    // The user changes company in the top bar. No reload, and the first
    // company's response is still in the cache.
    app.switchTo(COMPANY_B);

    await waitFor(() => expect(screen.getByText('mrr 9000')).toBeInTheDocument());
    expect(screen.queryByText('mrr 1000')).not.toBeInTheDocument();
    // A second request, because the company is part of the key. Without that the
    // cache would have answered and company A's numbers would be on screen under
    // company B's name - which is the failure this test exists to catch, and
    // which the two assertions above would otherwise not distinguish from a
    // correct slow refetch.
    expect(calls).toEqual([COMPANY_A, COMPANY_B]);
  });

  it('keys each company separately', () => {
    // Asserted on its own so that dropping the company from the key factory
    // fails with a message that names the cause, rather than surfacing later as
    // a mysterious leak in whichever page test runs first.
    expect(companyKeys.dashboard(COMPANY_A)).toEqual(['company', COMPANY_A, 'dashboard']);
    expect(companyKeys.dashboard(COMPANY_A)).not.toEqual(companyKeys.dashboard(COMPANY_B));
  });

  it('cannot mistake "no company yet" for a company', () => {
    // The reason the factories take `string | null` rather than a `string` with a
    // placeholder substituted at each call site. A sentinel like 'unset' is a
    // string that could collide with a real id; `null` is a value no id can be.
    // So the bootstrap key is not merely different from every tenant's key, it is
    // a different type of thing.
    expect(companyKeys.dashboard(null)).toEqual(['company', null, 'dashboard']);
    for (const id of [COMPANY_A, COMPANY_B]) {
      expect(companyKeys.dashboard(null)).not.toEqual(companyKeys.dashboard(id));
    }
  });

  it('issues no request at all when there is no company', async () => {
    const calls = stubServerByHeader({});
    mountApp(null);
    await waitFor(() => expect(screen.getByText('loading')).toBeInTheDocument());
    expect(calls).toEqual([]);
  });
});

describe('response races', () => {
  it('a slow response for the previous company does not overwrite the current one', async () => {
    // Two requests in flight, the older one lands second. With the company in
    // the key they are separate entries, so the late arrival updates a query
    // nobody is reading. The stub deliberately ignores the abort signal, which
    // is the harsh version: the server answers a request the browser has
    // already walked away from.
    const pending: Record<string, (value: Response) => void> = {};
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const company = (init?.headers as Record<string, string> | undefined)?.['X-Company-Id'] ?? COMPANY_A;
      void init;
      return new Promise<Response>((resolve) => {
        pending[company] = resolve;
      });
    });

    const respond = (company: string, mrr: number) =>
      act(async () => {
        pending[company](
          new Response(JSON.stringify(dashboardFor(company, mrr)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

    localStorage.setItem(ACTIVE_KEY, COMPANY_A);
    const app = mountApp(COMPANY_A);
    await waitFor(() => expect(pending[COMPANY_A]).toBeDefined());

    // Switch before the first response lands.
    app.switchTo(COMPANY_B);
    await waitFor(() => expect(pending[COMPANY_B]).toBeDefined());

    await respond(COMPANY_B, 9000);
    await waitFor(() => expect(screen.getByText('mrr 9000')).toBeInTheDocument());

    // Now the stale one arrives. Nothing on screen may change.
    await respond(COMPANY_A, 1000);
    await act(async () => undefined);

    expect(screen.getByText('mrr 9000')).toBeInTheDocument();
    expect(screen.queryByText('mrr 1000')).not.toBeInTheDocument();
  });
});
