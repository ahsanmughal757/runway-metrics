/**
 * The query client, and the few places allowed to reach for it.
 *
 * Defaults here are not tuning, they are decisions. Each one replaces something
 * a page used to get wrong on its own.
 */
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * How long a query is considered fresh, per company.
 *
 * A company's MRR does not change because the user looked at another tab, so
 * a short window removes most refetches without serving stale numbers. Mutations
 * do not wait for it to expire — they invalidate the keys they touch — so this
 * bounds staleness from *another user's* change, not from this session's.
 */
const STALE_TIME_MS = 30_000;

/**
 * Retry policy.
 *
 * Only what a retry can actually fix. A 401 means the session is over and the
 * client already knows it; a 403 is a decision the server made deliberately; a
 * 404 will still be a 404 in thirty seconds. Retrying those is how a permission
 * error turns into a spinner.
 *
 * `isNetwork` is retried because it genuinely is transient — a tunnel, a
 * sleeping laptop — and the user is looking at a blank page.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) {
    if (error.isNetwork) return true;
    if (error.status >= 400 && error.status < 500) return false;
  }
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      /**
       * A background refetch failed while showing cached data.
       *
       * Silent on purpose. The stale data is still on screen and still correct
       * as of when it was fetched; announcing a hard error over it would replace
       * a working page with a broken one because a background request timed
       * out. A first load that fails has no data to fall back on, and that does
       * surface, through the page's own error branch.
       */
      onError: () => undefined,
    }),
    mutationCache: new MutationCache({
      /**
       * Never retry a write.
       *
       * A `POST /metrics/import/commit` that failed on a timeout may well have
       * committed. Retrying it automatically can import the same rows twice, and
       * the user has no way to know which of the two happened. They retry, on
       * purpose, after seeing what failed.
       */
      onError: () => undefined,
    }),
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: shouldRetry,
        // The caller aborts, or the data layer does. Both land here and neither
        // is an error worth showing.
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * The client outside React.
 *
 * `AuthContext` needs to clear the cache when a session ends, and that happens
 * in an event handler rather than during a render, so a hook would be the wrong
 * tool. Held on a module-level `let` and set once by the provider.
 *
 * A `let` rather than a context read because a sign-out can be triggered by a
 * 401 from `api.ts` on a route that has already unmounted its provider.
 */
let client: QueryClient | null = null;

export function setQueryClient(next: QueryClient) {
  client = next;
}

export function getQueryClient(): QueryClient {
  if (!client) throw new Error('getQueryClient called before the provider mounted');
  return client;
}

/** Drops every cached response. Called on sign-out; see `AuthContext`. */
export function clearQueryCache(): void {
  client?.clear();
}
