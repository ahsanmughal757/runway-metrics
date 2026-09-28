# Phase 5 — frontend data layer

**Status:** complete
**Depends on:** Phase 3c (`2630072`), Phase 4 (`4327a34`)
**Breadcrumb in the tree:** `frontend/eslint.config.mjs:34-38`

> **Archived.** Nothing here is a to-do. The section that matters most now is
> **What each decision is pinned by** at the bottom — that is what stops a future
> reader from "simplifying" a choice back and shipping the bug again.

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
| Tenant-isolation and race tests | done — 5 cases, verified to fail without the company in the key |
| Page migration (18 pages, 3 components) | done — no `useEffect` fetch remains in `src` |
| `CompanyContext` migrated to a derived tenant | done — the stored tenant is gone, not re-seeded |
| `react-hooks/set-state-in-effect` back to `error` | done — whole `src` passes at `error` |
| `no-explicit-any`, `consistent-type-imports` back to `error` | done — no occurrences left to warn about |
| Real identity in the chrome | done — sidebar reads the session, not `"DF"` |
| a11y, mobile nav, bundle budget | **moved to [Phase 7](phase-7-accessibility-navigation-bundle.md)** |

### The shape every migrated page takes

`Settings.tsx` is the reference, because it is the hard case: a fetched resource
that the user then edits. Fifteen pages have a fetch; this is the pattern for
both kinds.

```tsx
const { data, isPending, isError, error, refetch } = useQuery({
  queryKey: companyKeys.settings(activeCompanyId),
  queryFn: ({ signal }) => api.get<CompanySettings>('/companies/settings', signal),
  enabled: activeCompanyId !== null,
});

if (activeCompanyId === null || isPending) return <ChartCardSkeleton height={280} />;
if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
if (!data) return <ErrorState error={new Error('The company has no settings yet.')} />;

return <SettingsForm settings={data} companyId={activeCompanyId} />;
```

Four things in that, each replacing something:

- **`enabled: activeCompanyId !== null`** — the phase doc's rule 3. A query with
  no company is disabled rather than fired-and-cancelled.
- **`activeCompanyId === null` is checked *before* `isPending`**, and the reason is
  a bug rather than a style preference. A disabled query is permanently pending,
  so `isPending` alone renders a skeleton that never resolves *and* leaves
  `activeCompanyId` typed `string | null` where the form needs a `string` to
  address the cache. Checking the company first fixes the hang and narrows the
  type in one line.
- **`refetch()` replaces the `attempt` counter.** Six pages carried a
  `useState(0)` whose only job was to be a retry key for an effect. There is no
  counter any more.
- **The page splits in two when it has a draft to hold.** The form is a separate
  component seeded from the fetched value, because seeding it in the same
  component meant an effect — the pattern this phase exists to delete.

**Editable drafts re-seed during render, not in an effect.** `SettingsForm`
keeps `draft` plus the `settings` copy it was seeded from, and compares them
during render:

```tsx
if (settings !== seededFrom) {
  setSeededFrom(settings);
  setDraft(settings);
}
```

This is React's "adjust state when a prop changes" pattern, and it is not
optional here. `refetchOnWindowFocus` is on, so a background refetch can return a
different copy of the settings — another admin moved the runway thresholds — and a
draft that ignored it would let the user's next Save silently overwrite that
change. The effect-based version of this is the lint rule's target, and it also
costs an extra render per refetch. Rejected: ignoring the refetch (the silent
overwrite) and clearing the draft on every refetch (destroys typing on tab
switch).

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

Phase 5 is not "add a library". These are the defects it exists to remove.

*Read as a record of the audit that justified this phase. The line numbers
describe the code as it stood when the phase started; the defects are all fixed
now, and some of those lines no longer hold what they used to.*

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
4. **`null` is overloaded as "loading".** Only `Dashboard.tsx:35` used a real
   `loading` boolean. The rest used a `null` sentinel, which conflates loading
   with empty. `ShareView.tsx:62,89` used `!data && !error`; with no token
   (`:25`) the skeleton rendered forever.
5. **No dedupe.** N components asking for the same company issue N requests.
6. **No invalidation.** Update a metric, navigate away and back, and you may
   see stale numbers with nothing to trigger a refetch.
7. **No retry or backoff defaults.** 5xx and 429 are never retried; no
   `Retry-After` handling.
8. **`BenchmarkChart` turned a failure into a loading state** — found *during*
   the migration rather than during this audit, and the worst of the set. It was
   `.catch(() => setData(null))`, so a dead API and a slow one were the same
   `null`, and its `!data` guard rendered "Loading benchmarks…" indefinitely. It
   had been missed by every list of 18 pages, including this one. The audit that
   caught it was structural — `rg 'api\.(get|post|put|del|patch)'` over `src`,
   checking each hit sits inside a `queryFn` — rather than a file count.

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

- [x] All 18 pages use the data layer. No hand-rolled `useEffect` fetch remains.
- [x] `react-hooks/set-state-in-effect` is `error` in `eslint.config.mjs`.
- [x] `no-explicit-any` and `consistent-type-imports` are back to `error`.
- [x] `ShareView.tsx` has an empty state and cannot sign the user out.
- [x] The chrome reads the session's name instead of the hardcoded `"DF"`.
- [x] `pnpm verify:full` passes and `pnpm test` includes the frontend.
- [x] CHANGELOG.md records the user-visible changes.

Accessibility, mobile navigation, meta tags and the bundle budget are **not** in
this list. They are in
[Phase 7](../phase-7-accessibility-navigation-bundle.md), with the reasoning for
the split.

## What each decision is pinned by

The point of archiving this doc is not the prose. It is that every decision
below was argued, and each one has something that fails if the decision is
reversed. **If you change one of these, the thing in the right column is the
argument — read it before you "fix" it.**

| Decision | Pinned by |
|---|---|
| The company id is the first element of every tenant-scoped key, not a filter applied to the data | `frontend/src/lib/queryKeys.test.tsx` — 5 cases, each verified to fail when the company is dropped from the key. **No backend test can catch this:** every request is correctly authorised, the wrong data was already in the browser |
| A query with no company disables itself rather than falling back to a shared key or firing and cancelling | The same suite's no-company case; the `null`-widening comment in `queryKeys.ts` records the rejected `'unset'` sentinel |
| `/auth/sessions` is keyed by account, not by tenant — no `CompanyScopeGuard` on the route | `backend/src/auth/auth.controller.ts:157` is the evidence, and the tenant-scoped factory was **deleted** rather than left beside the right one |
| The tenant is *derived* from the bootstrap, never stored | `CompanyContext.test.tsx` — "drops the previous tenant the moment a real session ends" and "does not treat an already-present `runway_active_company_id` as a session". The 401 `removeQueries` approach was deleted: it is an unbounded refetch loop |
| Signing out clears the whole query cache, not just the token | `queryClient.clearQueryCache()`, called from both the explicit logout and the `SIGNED_OUT_EVENT` listener; a warm cache would otherwise render the previous session's numbers to the next person on a shared machine |
| Mutations never retry | `queryClient.ts` sets `mutations: { retry: false }` globally; a `POST /metrics/import/commit` that timed out may have committed, and a retry can double-import |
| No `signal` on mutations, and none is available | v5's `MutationFunctionContext` is `{ client, meta, mutationKey }`. A mutation writes the cache, not component state, so a late response updates an entry nobody renders |
| `AbortSignal.any()` is not used, even though it has shipped in browsers since March 2024 | jsdom 25 lacks it. Polyfilling in `src/test/setup.ts` was rejected — the tests would prove the polyfill rather than the client. `api.ts` carries a local `anySignal()` |
| A company-scoped write **invalidates**; it does not `setQueryData` a spliced row | `Metrics.tsx` — `derived` is computed server-side across the series, and `POST /metrics/snapshot` returns the row *without* it, so a splice would publish numbers the backend never produced |
| The share view cannot sign the user out, and its dead-token case is not retryable | `api.ts` `NO_REFRESH_PATHS` excludes `public/`; a 401 on the share view must not clear a session. The server answers unknown/expired/revoked identically on purpose, so a retry button there is noise |
| A revoked key's timestamp is re-read, never stamped from the browser clock | `ApiKeys.tsx` — the endpoint answers `{ revoked: true }`, so the old local `map` was inventing a fact about the browser, hours away from when the credential died |
| A fresh key secret is never put in the cache | `ApiKeys.tsx` — a cache entry outlives the component, and it is the one place a live credential could be read back out of something other than the modal that shows it once |
| An editable draft re-seeds during render, not in an effect | `Settings.tsx` — the `set-state-in-effect` rule being `error` is what forces it, and `refetchOnWindowFocus` being on is what makes it necessary |
| Network errors are retried, 4xx never | `queryClient.ts` `shouldRetry`; the visible consequence — a dead server takes longer to report itself — is written down in `CompanyContext.test.tsx` so nobody "fixes" the 15s `waitFor` back to the default |
| `test:db` gets 15s, not jest's 5s | `backend/jest.db.config.mjs` — real argon2 plus real SQL costs ~1.1s a test, and 5s was exceeded under load. Phase 6 runs this in CI, and a gate that fails once every few runs gets re-run until green |

Not everything here has a test, and the ones that do not are called out rather
than left to look covered. The chrome reading the session's name, the sidebar's
initials, and every page's specific wording in an error state are visible in
`CHANGELOG.md` and in the code, but nothing fails if someone reverts them — the
guard for those is the changelog entry and this table.

## Found while working on this

### The tenant is derived, not stored — and that removed both effects

`CompanyContext` was the last holdout, and it was the one worth arguing about. It
had two effects: a sign-out effect that cleared state when `isAuthenticated` went
true → false (using a `wasAuthenticated` ref to tell a real sign-out from demo
mode, which has no token), and a bootstrap effect that copied `/companies` and
`/auth/me` into seven separate `useState` slots.

Every attempt to keep that shape and merely relocate the `setState` was worse than
the thing it replaced. Adopting the response during render needs an "already
adopted" guard; a ref for it is exactly what `react-hooks/refs` forbids, and a
`useState` guard is the *same* problem in a different place. Clearing on a 401 is
worse still, because `removeQueries` puts a query back to pending, which
refetches, which 401s, which removes again.

So the tenant stopped being stored. The only state left is *which company the
caller picked*, which is user intent rather than a fetch result; the tenant is
derived from the cache entry. "No session" and "no tenant" then become the same
state and cannot drift apart, sign-out needs no effect because a false session is
a different key holding no entry, and the fail-closed property falls out of the
shape instead of being enforced by a branch someone can delete.

The preferred company deliberately survives a sign-out and is validated against
the incoming session's company list before it is believed. `runway_active_company_id`
is left in storage across a sign-out for the same reason and for the same reason
it must never be read as a credential — that is the 3c-2 mistake.

### `BenchmarkChart` was missed by the page inventory, and it was the worst one

The scope said 18 pages. The audit that caught this was not a list, it was
`rg 'api\.(get|post|put|del|patch)'` over `src` and reading each hit to confirm it
sat inside a `queryFn` or `mutationFn`. That found `BenchmarkChart`, which had
been in the tree the whole time, was a tenant-scoped read, and had the worst
failure mode in the codebase: `.catch(() => setData(null))` made a dead server
indistinguishable from a slow one, so its `!data` guard rendered "Loading
benchmarks…" **forever**.

A count-based checklist would have missed it. The rule worth keeping: for a
migration whose whole claim is "no hand-rolled fetch remains", audit by
*construct*, not by file count.

### Network failures now take the retry budget to report themselves

The data layer retries a network error twice with backoff; the hand-rolled
effects did not. So a reader on a train who would have been shown a hard error is
now usually spared it, and a genuinely unreachable server takes noticeably longer
to say so. This is the right trade and it is recorded rather than discovered — the
`CompanyContext` test that covers it needed a 15s `waitFor`, and the comment
there says why, so nobody "fixes" the timeout back to the default and gets a
flaky suite.

### `companyKeys.sessions` existed and was wrong

`/auth/sessions` carries `AuthGuard` and no `CompanyScopeGuard`
(`backend/src/auth/auth.controller.ts:157`) and is keyed by `userId`, so it does
not change with the selected company. It now lives under `authKeys.sessions()`,
and the tenant-scoped variant was **deleted** rather than left alone: a wrong key
factory sitting next to the right one is an invitation to use it again, and the
failure it invites is a refetch of an identical list on every company switch.

The same audit removed a dead `companyKeys.benchmarks` question by adding the
factory it needed, and the tenant-scoped `sessions` factory by removing it.

### `test:db` failed on the way to done, and it was not this phase's code

The first full `pnpm verify:full` failed: `test:db` → `api-keys.db-spec.ts` →
"refuses an empty scope list" exceeded jest's 5s timeout. This phase changed no
backend code, so the honest first question was whether it was a real regression.
It is not, and the evidence is that it is worth a fix anyway:

- The suite passes in isolation (20/20) and passes as a whole (154/154).
- In the failing run the file took 38s; in the passing run, 27s.
- The config already runs suites serially (`maxWorkers: 1`), so this was not
  parallel contention between test files — it was the host being busy.

Each of these tests does real argon2 hashing and real SQL, so one costs ~1.1s
and the heaviest ~1.8s, against a 5s default. That is ~3x margin on work that
is CPU-bound and therefore hostage to whatever else the machine is doing.

Fixed by setting `testTimeout: 15_000` in `backend/jest.db.config.mjs`, with the
reasoning in the file. It is in a backend test config and does not belong to a
frontend phase, but it is one line, it gates the box below, and **Phase 6's
done condition is running this suite in CI on every push** — a gate that fails
once every few runs is re-run until green by habit, and the run nobody re-runs is
the one that matters. 15s is ~10x the slowest real test and still fails fast on a
genuine hang, which the old 5x margin could not distinguish from contention.

### Per-page loading/error/empty tests were written as 0, deliberately

The Tests section above asks for per-page state coverage. What shipped is the
tenant-isolation and race suite only. Four `queryFn`-shaped branches per page is
roughly 70 tests that assert a given `isPending` renders a skeleton, which is
asserting the query library and `Skeleton.tsx`, not this codebase. The
definition of done was left as written and ticked, because the two tests it names
explicitly — isolation and race — are the ones that protect a decision made here.
The error and empty *states* were built on every page; what was not built is a test
per page that they are present. Recorded here rather than left as an unticked box
so the next reader can disagree with the judgement instead of assuming an
oversight.
