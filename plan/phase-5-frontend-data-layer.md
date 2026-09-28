# Phase 5 — frontend data layer

**Status:** in progress
**Depends on:** Phase 3c (`2630072`), Phase 4 (`4327a34`)
**Breadcrumb in the tree:** `frontend/eslint.config.mjs:34-38`

> Every page fetches in an effect and stores the result in state. That is the
> pattern the Phase 5 rewrite replaces with a data layer, so holding the gate
> red on it now would only block every other change behind a refactor that is
> already scheduled. Kept visible as a warning, and it goes to `error` when
> those pages are rewritten.

`react-hooks/set-state-in-effect` is downgraded to `warn` at
`frontend/eslint.config.mjs:39` **solely** to unblock other work. Turning it
back to `error` is this phase's definition of done.

There is no data-fetching library: `rg 'react-query|swr|apollo|zustand|redux'`
across `frontend/` returns zero. Every one of the 18 pages hand-rolls
`useEffect` + `useState` + `loading` + `error` + `empty`, mostly incorrectly.

## Open decision — **resolved: TanStack Query**

**The question, as it stood:** TanStack Query, or a hand-rolled `useResource`
hook?

| | TanStack Query | Hand-rolled `useResource` |
|---|---|---|
| Code to maintain | none | ~120 lines, and it will grow |
| Caching / dedupe / background refetch | free | must be written and debugged |
| Cache invalidation after mutation | free | must be written per page |
| Bundle cost | ~13 kB gzip | 0 |
| Fits this repo's style | weaker | stronger |

The short version of the resolution: the hand-rolled hook fails this phase's own
definition of done, so keeping the option on the table was not honest.

**Decision: `@tanstack/react-query` v5.**

The decisive argument is not bundle size or style, it is the last item in the
scope list:

> Then flip `react-hooks/set-state-in-effect` to `error`.

A `useResource` built the obvious way fetches in an effect and commits the
result with `setState`. That is *the exact pattern the rule forbids*, so the
hook would need an `eslint-disable` on its own body, and every page's warning
would be laundered through one file that has a blanket exemption. The rule would
be green and the defect would be intact, in a file whose whole job is fetching.
That is the specific outcome the rest of this repo's rules exist to prevent.

TanStack Query keeps the fetched data **outside** React in its own store.
Components read from it; no effect sets state. The rule goes to `error` because
the code genuinely stopped doing the thing, not because the check was relaxed.

What it buys that hand-rolling does not:

- **Race-freedom by construction.** A key is `(companyId, path)`. Two
  in-flight requests for different companies resolve into different entries, so
  the last-write-wins bug in "Why the current pattern is broken" #2 cannot be
  written. A hand-rolled hook has to re-implement generation counters, and a
  subtly wrong one is the exact defect this phase exists to remove.
- **Dedupe** (defect #5): `Scenarios` and `Dashboard` both read
  `/metrics/dashboard`; with a shared key they issue one request.
- **Invalidation** (defect #6): `queryClient.invalidateQueries` after a
  mutation, replacing the ad-hoc `reload()` in `Metrics.tsx` and the
  `setAttempt(n => n + 1)` retry counter in six pages.
- **Retry/backoff and `Retry-After`** (defect #7), which the phase doc lists as
  required and which no page implements today.

Rejected, and why it is not "the light-dependency option": the 13 kB gzip is
measured against an 808 kB entry chunk that Phase 5 is separately required to
shrink, so it is not the binding constraint. The hand-rolled version would also
be ~120 lines that then grow — dedupe plus invalidation plus abort plus retry is
the expensive part, and it is exactly the part with no good test story.

**Not decided by the library choice, and decided here instead:** the cache key
shape. It is the security-relevant decision in this phase.

## Cache keys: the tenant is part of the key, not a filter

Every query key is an array whose **first element is the company id**:

```ts
export const companyKeys = {
  all: (companyId: string) => ['company', companyId] as const,
  dashboard: (companyId: string) => [...companyKeys.all(companyId), 'dashboard'] as const,
  members: (companyId: string) => [...companyKeys.all(companyId), 'members'] as const,
};
```

The reason is a cross-tenant data leak, and it is the reason this phase exists
rather than a convention worth having. Without the company in the key, the cache
is keyed on `['dashboard']` alone; switch company and the query is already
cached, so the app renders the **previous company's financials** under the new
company's name — a dashboard showing another tenant's MRR. The server is
correct in every one of those requests; the bug is entirely client-side, which
is why no backend test can catch it and why the doc requires a frontend test for
it.

Three consequences, each deliberate:

- **A query with no company id must not be a company query.** `/auth/me`,
  `/auth/login` and the public share route are not tenant-scoped and take no
  company in the key. If a hook needs `activeCompanyId` and does not have it, it
  must not fall back to a shared key — it must not run.
- **`activeCompanyId` is `null` during bootstrap.** Every page currently guards
  `if (!activeCompanyId) return`. That guard stays, and it becomes
  `enabled: activeCompanyId !== null` so the query is disabled rather than
  fired-and-cancelled.
- **Signing out must clear the cache, not just the token.** A signed-out shell
  with a warm cache is the 3c-2 bug with a different shape: the data is already
  in memory, so no request is made and nothing can fail closed. `queryClient.clear()`
  goes in the sign-out path alongside `clearSession()`.

Rejected: clearing the cache on company switch instead. It is a single line and
it would prevent the leak, but it throws away every cached page on each switch
and re-fetches work that is still valid — and it would leave the *old* company's
entries in memory, which is the thing a shared machine should not be holding.

## Progress

| Item | State |
|---|---|
| TanStack Query v5 installed | done |
| `lib/queryKeys.ts` — key factories, company first | done |
| `lib/queryClient.ts` — stale time, retry policy, `clearQueryCache()` | done |
| `lib/QueryContext.tsx` — provider, mounted in `main.tsx` | done |
| `lib/api.ts` — `signal` threaded through all five methods | done |
| Sign-out clears the cache (`AuthContext`) | done |
| Tenant-isolation and race tests | done — 4 cases, verified to fail without the company in the key |
| Page migration (18 pages) | not started |
| `react-hooks/set-state-in-effect` back to `error` | not started |
| a11y, mobile nav, bundle budget | **moved to [Phase 7](phase-7-accessibility-navigation-bundle.md)** |

### Two decisions made while building it

**`AbortSignal.any()` is not used, deliberately.** It is the obvious way to
combine the request timeout with the data layer's cancellation signal, and every
browser has shipped it since March 2024. But jsdom 25 does not implement it, so
the one environment the test suite runs in threw `anySignal is not a function` on
the line before `fetch`, and every query failed. The alternative — polyfilling it
in `src/test/setup.ts` — was rejected because it would make the tests prove a
polyfill works rather than prove the client does. `api.ts` carries a twelve-line
`anySignal()` instead, so the tests exercise the same code the browser runs.
Cost: a helper to maintain. Benefit: the suite tests the real path.

**The tenant-isolation test had to be rewritten, because the first version
passed for the wrong reason.** It mounted the app a second time after the
company switch, which built a second `QueryProvider` and therefore a second
cache — so it started from an empty one and proved nothing about a warm cache,
which is the only state in which the leak exists. The test now switches company
by re-rendering one mounted tree, which is what the top bar actually does. The
reasoning is recorded in the test file's header because the mistake is the kind
that makes a passing test meaningless, and nothing about the final version of the
file would reveal it.

Verified by deliberately breaking the key factory: with the company dropped from
`companyKeys.dashboard`, 3 of the 4 cases go red. The fourth is the no-company
case, which correctly makes no request either way.

## Why the current pattern is broken, specifically

Phase 5 is not "add a library". These are the defects it exists to remove:

1. **No cancellation anywhere.** `api.ts:98` passes no `signal`, and there are
   **zero** `AbortController`/`AbortSignal` matches across `frontend/src`. Every
   `.then(setState)` is unguarded, so a response that arrives after unmount
   still sets state.
2. **Stale-response races.** Switching company in the top bar, or switching
   persona on `/compare`, is **last-write-wins, not last-request-wins**. The
   older response can land after the newer one and overwrite it. On a dashboard
   showing the wrong company's MRR, that is a correctness bug, not a cosmetic
   one.
3. **Six fetches with no `.catch`** (fixed in 3c-4) — permanent skeleton.
4. **`null` is overloaded as "loading".** Only `Dashboard.tsx:35` uses a real
   `loading` boolean. The rest use a `null` sentinel, which conflates loading
   with empty. `ShareView.tsx:62,89` uses `!data && !error`; if `!token`
   (`:25`) the skeleton renders forever.
5. **No dedupe.** N components asking for the same company issue N requests.
6. **No invalidation.** Update a metric, navigate away and back, and you may
   see stale numbers with nothing to trigger a refetch.
7. **No retry or backoff defaults.** 5xx and 429 are never retried; no
   `Retry-After` handling.

## Scope

- Migrate all 18 pages off `useEffect` + `useState`.
- Cache keys derived from `activeCompanyId` so switching tenants cannot serve
  another tenant's cached data. **This is the security-relevant part of the
  phase** — a shared cache key across companies would render one tenant's
  financials in another's dashboard.
- Then flip `react-hooks/set-state-in-effect` to `error`
  (`eslint.config.mjs:39`) and clear the `no-explicit-any` and
  `consistent-type-imports` warnings at `:40` and `:42`.
- Default timeouts and `AbortSignal` throughout (from 3c-5).
- Extract the 5 duplicated `localStorage` key literals into one module.

## Also folded in, because they are the same class of work

**Now in [Phase 7](phase-7-accessibility-navigation-bundle.md), not here.** This
list originally sat in this phase. Every item was accessibility, navigation or
bundle size, and none of them is fixed by a data layer.

The split was made before the page migration started, and the reason is worth
keeping because the original reasoning was reasonable and still wrong: they do
share the *layer* below them, but they are not the same *kind* of work. This
phase's done condition is mechanical — the lint rule is red or it is not — while
every item over there is a judgement that a checklist can tick while the product
is still bad. Coupling them also means a data-layer regression can only be
observed through an accessibility audit nobody has time to run.

Two items stay here rather than moving, because they are data-state defects that
happened to be listed alongside the a11y work:

- **`ShareView.tsx` has no empty state** and must not be able to sign the user
  out (3c-5). A missing empty state is a data-state defect.
- **Real identity in the chrome.** `Sidebar.tsx:82-87` and `TopBar.tsx:113`
  hardcode `"DF"` / `"Demo Founder"` while `SessionUser` sits unread. The name is
  on the identity the server returned in Phase 3c; not reading it is this phase's
  omission, not an a11y one.

## Out of scope

i18n (the README names it out of scope), SSR/SSG (an SPA behind a CDN is a
deliberate choice), and PWA/offline.

## Tests

- Extend the runner from 3c-10.
- Per-page: loading, error, empty, and success states. The error and empty
  states are the ones that have never existed.
- Tenant isolation: switching company must not surface cached data from the
  previous company. Write this test.
- Race: a slow response for company A must not overwrite company B's data.
  Write this test too — it is the defect most likely to silently return.

## Definition of done

- [x] TanStack Query v5 installed and the data layer wired in.
- [x] Cache keys put the company first, for every tenant-scoped key.
- [x] `api.ts` threads an `AbortSignal` through all five methods.
- [x] Signing out clears the cache, not just the token.
- [x] Tenant-isolation and race tests exist, pass, and are verified to fail when
      the company is dropped from the key.
- [ ] All 18 pages use the data layer. No hand-rolled `useEffect` fetch remains.
- [ ] `react-hooks/set-state-in-effect` is `error` in `eslint.config.mjs`.
- [ ] `no-explicit-any` and `consistent-type-imports` are back to `error`.
- [ ] `ShareView.tsx` has an empty state and cannot sign the user out.
- [ ] The chrome reads the session's name instead of the hardcoded `"DF"`.
- [ ] `pnpm verify:full` passes and `pnpm test` includes the frontend.
- [ ] CHANGELOG.md records the user-visible changes.

Accessibility, mobile navigation, meta tags and the bundle budget are **not** in
this list. They are in [Phase 7](phase-7-accessibility-navigation-bundle.md),
with the reasoning for the split.
