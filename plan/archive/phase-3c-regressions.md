# Phase 3c — regressions in shipped phases

**Status:** in progress
**Inserted after** phases 3a/3b shipped, before Phase 4.

Phases 1–3b are marked done, and they are substantial. But auditing them found
defects that belong to already-shipped territory, including one privilege
escalation. This phase fixes them.

Two of these are not new bugs — they shipped in Phase 1/3 and were never
covered by a test. That is the point: a phase is not done until the tests that
would have caught the bug exist.

Run this phase before Phase 4. Everything here is a precondition for
believing the rest of the plan.

### Progress

| Item | State |
| --- | --- |
| 3c-1 ADMIN deletes OWNER | done — rank guard inside the transaction; `backend/test/db/auth.db-spec.ts` |
| 3c-2 blank after login | done — but see the correction in that section; needs a real-auth test |
| 3c-3 no route guard / no 404 | done except the lazy-chunk reload handler |
| 3c-4 six pages never catch | done — shared `ErrorState`, `api.ts` distinguishes the failure kinds |
| 3c-5 client discards HTTP status | done except the download-anchor fix and the unused demo key |
| 3c-6 `req.ip` is the proxy | **not started** |
| 3c-7 validation → 500s | **not started** |
| 3c-8 unenforced permissions | **not started** |
| 3c-9 uncommitted failing test | done — `nulls: 'last'` ordering; `sessions.db-spec.ts` |
| 3c-10 no frontend tests | done — Vitest runner + `CompanyContext.test.tsx` (6 cases) |
| 3c-11 misc | partly done |

---

## 3c-1 — An ADMIN can delete an OWNER (privilege escalation)

**The bug.** `DELETE /api/companies/members/:membershipId`
(`backend/src/companies/companies.controller.ts:69-74`) checks only
`members:remove`, then calls `repo.removeMember`. The repository enforces the
"keep at least one owner" invariant (`companies.repository.ts:223-230`) but
**never compares the caller's rank to the target's**.

`members:remove` is granted to both `OWNER` and `ADMIN`
(`backend/src/auth/permissions.ts:62-63`). So an ADMIN can remove an OWNER's
membership, revoking the owner of their own company.

This directly contradicts the documented intent at `permissions.ts:53-54`:
"ADMIN — runs the company day to day… cannot touch ownership, because those are
the owner's to give."

The sibling operation gets this right. `PATCH .../role` calls `assertOutranks`
(`companies.controller.ts:65, 76-80`) and blocks granting or demoting anyone at
or above your own rank. `removeMember` simply omits the equivalent check.

**The fix.** Pass the actor's role into `repo.removeMember` and refuse when
`ROLE_RANK[target.role] >= ROLE_RANK[actor.role]`.

Put the check **inside the existing `$transaction`**
(`companies.repository.ts:217`), not in the controller. The controller-level
`assertOutranks` on `updateMemberRole` is outside the transaction, which is a
TOCTOU window — read the role, then act on it, with a concurrent role change
able to land in between. Do not copy that pattern here.

**Also fix the docstrings,** because they currently point the reader at the
wrong code:

- `companies.repository.ts:212-214` claims "the caller has already been checked
  for `members:remove`" — true, but it says nothing about rank, which reads as
  complete.
- `updateMemberRole`'s docstring claims it "refuses to let an ADMIN act on an
  OWNER". That check is in the controller, not the repository.

**Tests.** In `backend/test/db/` — this is a database-resolved authorization
rule, so a unit test with fake data cannot see it.

- ADMIN removing an OWNER → 403, membership still present.
- ADMIN removing another ADMIN → refused (equal rank).
- OWNER removing an ADMIN → allowed.
- The last-owner invariant still holds for OWNER→OWNER.
- Regression: the existing "keep at least one owner" test must still pass.

---

## 3c-2 — the app is blank after login in real-auth mode

**The bug.** After an in-app login, `CompanyProvider.activeCompanyId` stays
`null` forever, so every page's `if (!activeCompanyId) return;` guard
short-circuits and renders its skeleton indefinitely. A hard browser refresh is
required to see the dashboard.

Two halves:

- `frontend/src/lib/CompanyContext.tsx:58` — the bootstrap effect's dependency
  array is `[applyIdentity]`, and `applyIdentity` is `useCallback(..., [])`
  (`:36`), so it is referentially stable and the effect runs **exactly once per
  page load**. It is the only thing that sets `activeCompanyId` state (`:53`).
- `frontend/src/lib/AuthContext.tsx:51` — `acceptSession` writes
  `runway_active_company_id` to `localStorage` and never notifies
  `CompanyContext`. The write is invisible to the state that actually gates
  rendering.

`AuthProvider` already wraps `CompanyProvider` (`frontend/src/main.tsx:20-21`),
so `CompanyContext` can consume `useAuth()`. No re-architecture needed.

**The fix.** Consume `isAuthenticated` in `CompanyProvider` and add it to the
bootstrap effect's deps, so the false→true flip re-runs the bootstrap and
`activeCompanyId` is set without a reload.

> **Corrected in implementation — read this before "fixing" it back.** This
> section originally read "skip the bootstrap when false". That is wrong, and
> implementing it as written reintroduces a worse bug than the one 3c-2 fixes:
> `isAuthenticated` is `!!localStorage.getItem(token)`, and demo mode
> (`BYPASS_AUTH=true`) has no token by design, so skipping on false locks the
> demo out of every page. The real-mode signed-out state and the demo state are
> *identical from the browser* — only the server can tell them apart. So:
>
> - The bootstrap is **unconditional**. The provider always asks. The only thing
>   that changes on a 401 is that `unauthorized` goes true.
> - `RequireSession` gates on `CompanyProvider.unauthorized`, **not** on
>   `isAuthenticated`, for the same reason.
> - Tenant state is cleared on the true→false *transition* (tracked in a ref) and
>   on any 401. Clearing on "not authenticated" unconditionally would wipe the
>   demo's tenant on every page load; not clearing it would leak the previous
>   tenant's company and cached numbers to the next person on a shared machine.
>
> The invariant to preserve: **the browser is never the authority on whether a
> session exists.** If you find yourself adding an `isAuthenticated` check to
> decide whether to render or whether to fetch, that is the bug.

**Why this survived so long:** it is invisible in `BYPASS_AUTH` demo mode,
where the `X-Demo-Company-Id` header supplies the company. The demo path works;
the real auth path is broken. This is the argument for a real-auth test.

**Tests.** The frontend had no test runner at all (see 3c-10), so this is the
reason that gets one.

---

## 3c-3 — no route guard, no 404

**The bug.** `isAuthenticated` is computed and set but **never read for
gating**. `AppShell.tsx:11-13` reads `useLocation()` and `useCompany().error`
and nothing else; there is no `<Navigate to="/login">` anywhere in the app.

An unauthenticated visitor to `/` gets the full signed-in chrome — sidebar,
top bar, all 18 nav links. The data fetches 401, the client attempts a refresh,
fails, and calls `announceSignedOut()`, which flips the signed-out UI state
**while leaving the user on the same page inside the signed-in shell**.

There is also no `<Route path="*">` in any of the three `<Routes>` trees, so an
unknown URL falls through to the app branch, matches nothing, and renders the
`AppShell` chrome around a completely empty `<main>` — a silent blank page with
an HTTP 200.

Related: `CompanyProvider` is mounted above `App` (`main.tsx:21`) and fires
`/companies` + `/auth/me` (`CompanyContext.tsx:45`) **even on `/login` and
`/share/:token`**, so every public page opens with two guaranteed-failing
requests.

**The fix.**

- Gate the app branch on `isAuthenticated`; redirect to `/login` (preserving
  the intended destination so post-login redirect works).
- Add a `path="*"` 404 route with a real not-found screen.
- Skip the `CompanyProvider` bootstrap on public routes, or make the guard
  order so it does not run unauthenticated.
- `React.lazy` has `Suspense` but no retry on chunk-load failure. After a
  redeploy, a stale hashed asset 404s and the page is permanently blank. Add a
  reload-once-on-chunk-error handler.

**Note for later (Phase 5):** `App.tsx` has three separate `<Routes>` trees
selected by a `pathname` string comparison, rather than declarative layout
routes. Reworking that belongs with the data-layer work, not here.

---

## 3c-4 — six pages never handle a failed fetch

**The bug.** Six pages do an initial `useEffect` fetch with **no `.catch`**:

- `frontend/src/pages/Invites.tsx:49`
- `frontend/src/pages/Team.tsx:35`
- `frontend/src/pages/Settings.tsx:30`
- `frontend/src/pages/Scenarios.tsx:16`
- `frontend/src/pages/Compare.tsx:41` and `:48`
- `frontend/src/pages/Metrics.tsx:83`

Each produces an unhandled promise rejection and a **permanently spinning
skeleton**. A transient network blip is indistinguishable from a page that will
never load, and the user has no way out.

`Sessions.tsx:87` is a different flavour of the same problem: it conflates every
failure into `setUnavailable(true)` and renders "set `ENABLE_DATABASE=true`"
(`:132-140`). A 401, 403 or 500 shows the same misleading instruction.

**The fix.** Every fetch site gets a real error state that distinguishes
"could not reach the server" from "the server said no" from "you are not
allowed". This depends on 3c-5 — the client throws away the HTTP status, so the
pages currently cannot tell those apart.

---

## 3c-5 — the API client throws away the HTTP status

**The bug.** `frontend/src/lib/api.ts:118-121` throws
`new Error(body.message ?? \`Request failed: ${res.status}\`)`. The `Error`
carries a **string only** — no status, no code, no request id.

So no caller can branch on 401 vs 403 vs 404 vs 429. This is the direct cause
of 3c-4's conflated error states and of `Sessions.tsx`'s misleading hint.

**The fix.** A typed `ApiError` carrying `status`, the server's stable `code`
(the envelope already provides one), and `requestId` from the
`X-Request-Id` response header. Callers branch on `status`/`code`, never on
message text.

**While in this file:**

- `api.ts:98` has no `AbortSignal` and there is no timeout anywhere in the app
  (zero `AbortController` matches across `frontend/src`). A hung backend leaves
  every page in its skeleton with no escape. Add a default timeout.
- The `localStorage` keys are duplicated as raw literals across 5 call sites:
  `api.ts:14` defines `TOKEN_KEY`, but `AuthContext.tsx:36,49,51` and
  `CompanyContext.tsx:54,62,79` each hardcode their own copy. Extract to one
  module.
- `runway_demo_company_id` is read (`api.ts:20`) but **never written** anywhere.
  Either write it in demo mode or drop it.
- `endLocalSession()` (`:38-41`) removes the token and company keys but leaves
  the demo keys behind.
- `Content-Type: application/json` is set unconditionally (`:101`), including
  on bodiless GETs and the PDF blob request. Harmless same-origin, but forces a
  CORS preflight in any cross-origin split deploy.
- Error bodies are parsed unguarded (`:119`), so an HTML 502 from a proxy yields
  `Request failed: 502` with nothing to act on.
- `ShareView.tsx:26-29` can sign a user out: a stale token makes
  `shouldRefresh` return true, a 401 there triggers a refresh, and failure calls
  `announceSignedOut()` → `endLocalSession()` clears the real session **while
  the user is on an unauthenticated page**. The client must not attempt a
  refresh for public routes.
- `URL.revokeObjectURL` is called synchronously right after `a.click()` and the
  anchor is never appended to the DOM (`InvestorUpdate.tsx:60-65`,
  `ChartExportButton.tsx:5-12`). Chrome tolerates this; **Firefox commonly
  cancels the download.**

---

## 3c-6 — `req.ip` is the reverse proxy for every request

**The bug.** `backend/src/main.ts` never calls `app.set('trust proxy', …)`.

Behind a reverse proxy — which is the deployment this code is written for —
`req.ip` is the proxy's address for every request. Two consequences, both real:

- `credentialThrottle` keys on `` `${ip}:${email}` ``
  (`backend/src/auth/auth.controller.ts:63-64`). Per-email keying still catches
  credential stuffing, but the IP half is a constant, so the bucket is **shared
  by every user on the deployment**. The comment at `auth.controller.ts:59-60`
  claims the design stops "one attacker exhausting a shared NAT's budget" — the
  implementation does the exact opposite of that.
- Session `ip` metadata (`auth.controller.ts:91-93`) is always the proxy, which
  makes the Devices page's IP column useless for telling devices apart.

**The fix.** `app.set('trust proxy', 1)` — or an explicit, env-driven hop count,
since getting this wrong is itself a spoofing vector. It should be a configured
value, not a magic number, and the `.env.example` must document it.

**Add a test.** Assert `req.ip` resolves to the forwarded client address. This
is exactly the class of bug the `test:db` suite exists for and nothing currently
covers it.

---

## 3c-7 — validation gaps that surface user errors as 500s

**The bug.** `AllExceptionsFilter.normalizePrisma`
(`backend/src/common/filters/all-exceptions.filter.ts:120-152`) handles
P2002/P2025/P2003 and maps **everything else to 500 `DATABASE_ERROR`**.

- `UpsertSnapshotDto` (`backend/src/metrics/dto.ts:3-16`) validates only
  `@IsNumber()`. No min, max, finiteness or scale. Non-negativity is caught
  solely by the DB CHECK `MetricSnapshot_amounts_non_negative`
  (`prisma/migrations/.../migration.sql:316-317`) — so a user typing `mrr: -1`
  gets a **500**, logged at `error` level, which pages someone for a typo.
- `GenerateReportDto` (`backend/src/reports/reports.controller.ts:19-22`)
  declares `@IsArray()` on `narrativeSections` with no
  `@ValidateNested({ each: true })` + `@Type()`, so **array elements are never
  validated**. `periodLabel`, `heading` and `body` have no length caps, and
  they flow into the PDF renderer and into the audit `entityId` as
  `report:${dto.periodLabel}` (`:69`). Unbounded string input into a rendering
  path.
- `ImportCsvDto.csv` (`backend/src/metrics/dto.ts:18-20`) is unbounded. The
  only limit is Express's implicit 100 kB default, which is undocumented.

**The fix.** `@Min(0)` and numeric caps on the snapshot DTO;
`@ValidateNested` + `@Type()` + `@MaxLength` on the report DTOs; an explicit
documented body size limit for CSV; and map Prisma check-violation codes to 400
so a constraint violation is a user error, not a server error.

Contained to ANALYST-and-above acting on their own company, so this is
robustness rather than a live vulnerability — but it is the difference between
"the app is broken" and "you typed a minus sign".

---

## 3c-8 — declared permissions that no route enforces

**The bug.** `audit:read` is declared (`auth/permissions.ts:35`) and granted to
all four roles via `READ_ONLY` (`:46, 62-65`), but neither audit route declares
it (`backend/src/audit/audit.controller.ts:19-32`).
`GET /api/metrics/benchmarks` (`backend/src/metrics/metrics.controller.ts:31-32`)
returns the caller's own derived `burnMultiple`, `nrr` and `revenueChurn` with no
permission decorator.

Neither is exploitable today, because every role holds both permissions. That is
precisely the problem: unenforced intent silently exposes the full audit feed to
**any future role that is not `READ_ONLY`**, and nothing will fail when that
happens.

`company:delete` and `customers:write` are also granted to roles but used by no
route. "Delete the company" is not implemented despite the permission existing —
either implement it or remove the permission, so the table stops advertising a
capability that does not exist.

**The fix.** Add the missing `@RequirePermission` decorators. Low effort, and it
makes the matrix the single source of truth it claims to be.

---

## 3c-9 — a failing test was left uncommitted

**The state.** `backend/test/db/sessions.db-spec.ts` has a test in the working
tree that is **not committed and currently fails**. It proves a real bug:

> PostgreSQL sorts NULLS FIRST on `DESC`, so a plain
> `orderBy: { lastUsedAt: 'desc' }` puts the never-used session at the top of a
> list the UI labels "newest activity first".

`backend/src/auth/sessions.service.ts:188` is exactly
`orderBy: { lastUsedAt: 'desc' }`. So the Devices page lists the
**least-recently-used device first** — the opposite of what the screen claims.

**The fix.** `orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } },
{ createdAt: 'desc' }]`, then land the test.

A written-but-unlanded test is the exact thing that got lost with the plan. It
is worth being deliberate about not leaving another one behind.

---

## 3c-10 — the frontend has no tests at all

Zero. No runner, no files, no coverage, no testing-library. The root
`package.json:22-24` scopes `test`, `test:e2e` and `test:db` to
`--filter runway-backend` only.

That is how 3c-2 shipped: the blank-after-login bug is invisible in demo mode
and there was no test to catch it.

**Scope this narrowly.** Phase 3c does not need a full frontend suite — that is
Phase 5's job. It needs enough to hold the fixes in this phase:

- Vitest + Testing Library, configured in `frontend/`.
- A test for 3c-2 (login → dashboard renders without reload), because that is
  the bug class this phase exists to eliminate.
- A test for the auth route guard (3c-3).

Also fix, since it is one line: `frontend/tsconfig.json` `include` is `["src"]`
(`:18`), so **`vite.config.ts` and `tailwind.config.ts` are never typechecked**
despite being TypeScript. Add them.

---

## 3c-11 — misc correctness, cheap and worth doing

- `Dashboard.tsx:253, 256` use raw `<Button as="a" href="/metrics">` →
  **full page reloads**, discarding SPA state and re-triggering the
  `CompanyProvider` bootstrap. Should be `<Link>` (`Sidebar.tsx:100` gets this
  right).
- `App.tsx:81` is indented 2 spaces while its 15 siblings are at 10.
- No scroll restoration on route change (zero `ScrollToTop`/`scrollTo` matches).
- `ErrorBoundary.tsx` wraps only the app branch — **`/login`, `/signup` and
  `/share/:token` have none**. A throw in any of them unmounts the whole React
  tree to a blank page.
- The `ErrorBoundary` has no `getDerivedStateFromError` reset on company
  change, so a boundary trip in one tenant sticks until a manual "Try again".
- `Sidebar.tsx:82-87` and `TopBar.tsx:113` render a hardcoded `"DF"` /
  `"Demo Founder"`. `AuthContext`'s `SessionUser` has `id`/`email`/`name` and
  **no component ever reads it**.
- `frontend/src/{pages,components,lib,styles}` exists on disk as a **literal
  empty directory** — an unexpanded brace expansion from a PowerShell `mkdir`.
  Delete it.
- `all-exceptions.filter.ts:54` says "Field-level redaction is configured in
  main.ts". It is in `backend/src/common/logging/logger.module.ts` +
  `redaction.ts`. Comment-only, but it points the next reader at the wrong file.
- `auth.guard.ts:15` constructs `new BypassAuthGuard()` in a field initializer
  rather than via DI. Harmless while it has no dependencies; breaks silently
  the moment it does.

---

## Found while working on this

### Two top-bar controls were visible in modes where they do nothing — **fixed**

`TopBar.tsx` rendered a viewpoint switcher and a "Log out" item unconditionally.
Each works in exactly one mode, and in the other it is worse than absent:

- **Viewpoint switcher** — `X-Demo-Role` is read by `BypassAuthGuard` alone.
  Against a real session the header is ignored and `/auth/me` returns the
  database's role, so the tab springs back. A reviewer could reasonably read
  that as "this is what an ADMIN sees" and be wrong.
- **Log out** — `logout()` ends a session by revoking the refresh cookie. Demo
  mode has no session and no cookie, so the click clears nothing,
  `isAuthenticated` was already `false` (no `true → false` transition), and the
  app stays fully populated.

**The fix was option (a) — hide, don't rename — and it needed a truthful
signal**, which is what the work below is. Option (b), treating sign-out as
"reset the demo", was rejected: it invents a reset protocol the server does not
have, to serve a control that has nothing to end.

Hiding is also the only option that does not add a control. Renaming it to
"Exit demo" would leave a demo visitor with an accurate label on a control that
still does nothing.

**The signal.** `RequestUser` gained an optional `demo?: true`, set only by
`BypassAuthGuard` on the identity it injects, and echoed by `/auth/me` as a
coerced boolean. The browser cannot supply this — a healthy demo and a
signed-out browser are both simply "no token", which is 3c-2's lesson applied a
second time — and the client must not parse the `demo-user` id out of a response
to guess. The flag is threaded through the identity rather than read from
`env.BYPASS_AUTH` in the service, because `auth.guard.ts` documents itself as
the only file allowed to branch on that flag.

Tests: `frontend/src/components/TopBar.test.tsx` (4 cases, both controls in both
modes), the `demo` propagation case in `CompanyContext.test.tsx`, the `true` side
in `backend/test/app.e2e-spec.ts`, and the `false` side plus a forged-`X-Demo-Role`
case in `backend/test/db/auth.db-spec.ts`.

### `tailwind.config.ts` had an invalid `defaultTheme` — **fixed (no runtime change)**

`defaultTheme: 'runwayDark'` is rejected by the plugin's type
(`"light" | "dark"`). It was never caught because `tsconfig.json` only
included `src`, so the config files were not typechecked. Fixed to `'dark'`.

No runtime change: custom palettes are selected by the `runwayDark`/`runwayLight`
classes that `applyTheme()` toggles on `<html>` (`lib/theme.ts:14-16`), not by
`defaultTheme`, so the invalid value was already being discarded.

Worth recording how this was *almost* got wrong: it looked like every HeroUI
component was rendering with the light palette in a dark app, and the fix looked
obvious — `<HeroUIProvider theme="runwayDark">`. The installed HeroUI
(`@heroui/react` 2.8.10 / `@heroui/system` 2.4.28) has **no** `theme` prop on
`HeroUIProvider`; typecheck rejected it. Adding these files to the typecheck was
still worth it, because it is what surfaced the real defect.

### `AGENTS.md` misdescribed `pnpm verify` — **fixed**

It claimed `verify` skips `test:e2e` and `test:db`. Root `package.json:27` runs
`test:e2e`; only `test:db` is skipped. Corrected, and `test` now covers the
frontend too.

---

## Definition of done

- [ ] Every item above is either fixed or explicitly deferred with a reason
      written into this file.
- [ ] `pnpm verify:full` passes.
- [ ] New authorization rules are covered in `backend/test/db/`, not only in
      unit tests.
- [x] 3c-1 has a test that fails against the current code and passes after.
      `backend/test/db/auth.db-spec.ts`, 36 passing; the two removal tests fail
      if the rank guard is removed.
- [x] 3c-2 is fixed **and** has a test in real-auth mode.
      `CompanyContext.test.tsx` → "recovers the tenant after signing in,
      without a reload". The whole file goes red (6/6) if the old
      `if (!isAuthenticated) return` gate is restored.
- [ ] 3c-6 has a test asserting `req.ip` honours `trust proxy`.
- [x] `frontend/` has a working test runner and is no longer excluded from
      `pnpm test`. Vitest + Testing Library, `frontend/vitest.config.ts`,
      wired into the root `test` script. `tsconfig.json` now includes the
      config files, which is how the `tailwind.config.ts` defect was found.
- [ ] CHANGELOG.md `## Unreleased` records the user-visible changes: the
      privilege-escalation fix, the login fix, the 404 route, the route guard.
- [x] The deferred "Sign out in demo mode" question above is decided. Option (a),
      hidden behind a server-reported `demo` flag, with tests on both sides.
- [ ] This phase is moved to `archive/` and the status table in
      [README.md](README.md) is updated.
