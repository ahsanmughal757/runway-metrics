# Runway — Investor-Grade Metrics for Founders (v2)

Portfolio project #2 (Ledgerly's sibling — same architectural pattern, reskinned).
A founder's metrics dashboard whose real output is a polished **PDF investor
update**, with server-enforced `OWNER`/`ADMIN`/`ANALYST`/`VIEWER` roles over
relational multi-tenant data, and a cohort retention table computed by the
database rather than in JavaScript.

**v2 revamp:** new design system (deeper navy palette, amber 2nd accent,
condensed type scale, motion via framer-motion), a bento-grid dashboard with
KPI→chart drill-down and animated count-up numbers, a command palette (⌘K),
toast notifications, a real notifications feed, configurable runway
thresholds, a member-invite screen, cross-persona comparison, CSV export,
and Login/Signup screens wired to the existing JWT backend.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + TypeScript, HeroUI, Tailwind, Recharts, framer-motion, lucide-react |
| Backend | NestJS + TypeScript (Auth, Companies, Metrics, Cohorts, Reports, Audit modules) |
| DB/ORM | Postgres + Prisma |
| Auth | JWT (`passport-jwt`) with a dev-only `BYPASS_AUTH` guard |
| PDF | `@react-pdf/renderer` |
| CSV | `papaparse` (import), client-side generation (export) |
| Fake data | `@faker-js/faker`, persona-driven generator shared by seed script, CSV export, and the in-memory demo API |

## Running it

This is a pnpm workspace monorepo — one install, one lockfile, one command.

```bash
pnpm install     # installs backend + frontend together
pnpm dev         # starts the API (:4000) and the web app (:5173) together
```

`pnpm dev` runs both processes under `concurrently` with `[api]` / `[web]`
prefixed logs, and shuts both down together on Ctrl-C. Open
http://localhost:5173 — Vite proxies `/api` to the backend, so there is no CORS
or base-URL configuration to touch.

| Script | What it does |
|---|---|
| `pnpm dev` | API + web app together (the main entry point) |
| `pnpm dev:api` | API only (`backend`, `nest start --watch`) |
| `pnpm dev:web` | Web app only (`frontend`, `vite`) |
| `pnpm dev:db` | Starts Postgres via `docker compose` (only needed for full mode) |
| `pnpm build` | `nest build` + `tsc -b && vite build` |
| `pnpm db:migrate` / `pnpm db:seed` | Prisma migrate / seed |

### Zero-setup demo mode (no database — the default)

Leave `ENABLE_DATABASE=false` and `BYPASS_AUTH=true` in `backend/.env`:

```bash
cp backend/.env.example backend/.env
pnpm dev
```

Every API route is live — dashboard, cohorts,
metrics entry, CSV import/export, PDF export, settings, invites, comparison,
notifications — served from the persona-based fake data generator instead of
Postgres. The company switcher (top bar) flips between three seeded personas
(steady grower / hypergrowth-then-plateau / struggling), and the role switcher
demonstrates each of the four permission levels. Press **⌘K** anywhere to jump
between screens.

`BYPASS_AUTH=true` must never be set outside local development —
`src/config/env.ts` throws at boot if it's combined with `NODE_ENV=production`.

### Full mode (real Postgres, real JWT auth)

```bash
pnpm dev:db                     # starts Postgres on :5432
cp backend/.env.example backend/.env
# set ENABLE_DATABASE=true, BYPASS_AUTH=false
pnpm db:migrate
pnpm db:seed                    # seeds 3 demo companies + demo users
pnpm dev
```

Demo logins after seeding: `demo.owner@runway.local` /
`demo.analyst@runway.local` / `demo.viewer@runway.local`, password
`demo-password-123`. The `/login` and `/signup` screens are wired to the real
`auth.controller.ts` endpoints in this mode.

Generate a standalone sample CSV (same generator, no server needed):

```bash
pnpm --filter runway-backend exec ts-node scripts/generate-csv.ts --persona=hypergrowth --out=./sample.csv
```

---

## Tests

```bash
pnpm test            # unit, no database          (backend/test/*.spec.ts)
pnpm test:e2e        # HTTP in-process, no database (backend/test/app.e2e-spec.ts)
pnpm test:db         # real PostgreSQL             (backend/test/db/*.db-spec.ts)
pnpm verify          # lint + typecheck + unit + e2e + build   (no Docker needed)
pnpm verify:full     # the above, plus test:db                (needs Postgres: pnpm dev:db)
```

`test:db` creates and migrates its own `runway_test` database, then truncates
between tests, so it never touches the development data. It is kept out of
`verify` rather than folded in because it needs a running database; if you are
changing anything under `src/`, run `verify:full`.

**Why the third suite exists.** Both other suites run with
`ENABLE_DATABASE=false` against generated data, which means they cannot see a
broken query, a missing constraint, or a permission check that only exists in
the database path. That is not hypothetical: the cohort retention SQL shipped
with a missing double quote (`c."signupMonth)))::int`), which TypeScript, the
linter, the unit tests and the e2e tests all passed, and which only showed up
when the report was called against a real database. If you add a
`$queryRaw`, a database constraint, or an authorization rule, put it in
`test/db/` — otherwise nothing will catch it.

Behaviour changes that are not obvious from the code are recorded in
[CHANGELOG.md](CHANGELOG.md), including one place where the API now accepts input
it used to reject.

---

## What's new in v2

- **Design system, not a palette swap** — deeper navy (`#0a0e1a`) base, a
  second amber accent for warnings/highlights/comparison series, a condensed
  display type scale for KPI numbers, and a `heroui()` theme (`runwayDark`)
  properly wired through `tailwind.config.ts` so every HeroUI primitive
  inherits it.
- **Bento dashboard with drill-down** — clicking a KPI card scrolls to and
  highlights its matching chart; KPI numbers animate in with `CountUp`
  (respects `prefers-reduced-motion`); cards stagger in on load.
- **Configurable runway thresholds** — `Company.runwayGreenMonths` /
  `runwayYellowMonths` replace the v1 hardcoded 12/6 split, editable on the
  new **Settings** screen and enforced by the same `metrics.service.ts` logic
  that computes the zone.
- **Member Invite screen** — backed by the `Invite` model and the
  `companies/invites` endpoints, with a persisted lifecycle (issue, preview,
  accept, redeem, revoke, expire) rather than the in-memory v1 list.
- **Notifications feed** — a real bell icon fed by `/audit/recent`, backed by
  the existing `AuditLog` model.
- **Cross-persona comparison** — `/metrics/compare/:persona` overlays another
  seeded company's MRR on a chart. Deliberately refuses in
  `ENABLE_DATABASE=true` mode — real cross-tenant reads are out of scope by
  design, not just by omission.
- **Command palette (⌘K)**, **toast system**, **skeleton loading** on every
  async view, and an **error boundary** around routed content.
- **CSV export** on the Metrics history table (client-side, same column
  shape as import) — not just the polished PDF.
- **Login / Signup screens**, wired to the auth endpoints that existed in the
  backend since v1 but had no frontend.
- **Sessions that actually end** — the refresh token is an opaque random value
  in an httpOnly cookie scoped to `/api/auth`, and only its SHA-256 hash is
  stored, so a database dump does not hand over working sessions. Every refresh
  rotates it, and presenting one that was already spent revokes the entire
  rotation family rather than quietly issuing a second token. Logout revokes
  server-side; the **Devices** page lists live sessions — marking the one you
  are currently on — and revokes any of them. The access token stays a
  15-minute JWT in `localStorage` — a stolen one dies on its own, and the
  refresh cookie behind it is what the database protects.
- **Route-level code splitting** via `React.lazy` — each page ships as its
  own chunk.

## What makes this not a gimmick

- **Actually built on HeroUI components** — `Card`/`CardBody`, `Button`,
  `Input`, `Textarea`, `Select`, `Tabs`, `Table`, `Slider`, `Avatar`, `Chip` —
  themed via the custom `runwayDark` HeroUI theme, not raw HTML elements with
  Tailwind classes bolted on. The only native form element left is
  `<input type="file">` behind the CSV drop zone, since HeroUI has no
  file-picker primitive.
- **RBAC is enforced in `PermissionsGuard` and `CompanyScopeGuard`**, on every
  protected route — not hidden by conditionally rendering UI. The role switcher
  in the demo UI only changes *which* server identity gets injected; it never
  bypasses the guard logic itself, and the permissions it renders are re-read
  from the server rather than recomputed in the browser.
- **The access token carries identity only** — `sub` and `email`, never a role
  or a company. `MembershipResolver` asks the database on every request which
  membership is being acted as and what that entitles the caller to, so a
  demotion takes effect immediately instead of when an old token expires.
- **`X-Company-Id` is a request, not a credential** — it selects among the
  caller's own memberships and is rejected otherwise, so it can choose a
  company but can never grant access to one. `companyId` therefore always comes
  from the resolved membership, never from a client-supplied param, closing the
  cross-tenant data leak named as a risk in the PRD.
- **One repository layer branches on `ENABLE_DATABASE`**
  (`metrics.repository.ts`, `cohorts.repository.ts`, `companies.repository.ts`);
  controllers and services above it are identical in both modes.
- **The fake-data generator models real SaaS shape**, not independent random
  fields: step-wise burn increases (hiring waves), churn spikes tied to
  simulated pricing-change months, a Dec/Jan seasonal dip, and cohort curves
  with steep early drop-off flattening into a long tail. Three personas
  (steady / hypergrowth-then-plateau / struggling) share one generator so the
  seed script, the CSV export, and the `ENABLE_DATABASE=false` API path never
  drift out of sync.
- **Runway uses a 3-month rolling average burn**, not single-month, to avoid
  the number swinging wildly month to month.
- **NRR, MoM growth, and churn are computed server-side** in `metrics.service.ts`
  from raw MRR components (new/expansion/contraction/churned), not stored as
  pre-baked numbers — so CSV-imported or founder-entered data drives the same
  math as seeded data.
- **The PDF is a real render**, not a screenshot of the dashboard — a
  separate `@react-pdf/renderer` document with its own layout, built to be
  something an investor would actually read.

## What's intentionally out of v1 (named, not faked)

Real Stripe/bank integration, multi-currency, AI-written narrative, field-level
encryption, live socket updates, and multi-portfolio VC views — all called out
in the PRD as v1.1+/v2 scope rather than stubbed with fake UI.

## Project layout

```
package.json                  # workspace root — dev/build/db scripts, concurrently
pnpm-workspace.yaml           # packages: [backend, frontend] + pnpm build-approval list
pnpm-lock.yaml                # single lockfile for the whole monorepo
docker-compose.yml            # Postgres only (optional, full mode)
backend/
  prisma/schema.prisma         # User, Company (+ runway thresholds), CompanyMembership, Invite, MetricSnapshot, Customer, CustomerMonthlyValue, ShareLink, AuditLog, Session
  prisma/migrations/           # one squashed baseline; constraints/indexes/triggers that Prisma cannot express
  prisma/seed.ts               # seeds 3 demo companies via the shared generator, with customers as rows
  src/config/env.ts            # ENABLE_DATABASE / BYPASS_AUTH, single source of truth
  src/fake-data/               # persona configs + realistic generator (snapshots + cohorts), for demo mode only
  src/auth/                    # permissions matrix, MembershipResolver, JwtStrategy, AuthGuard (BypassAuthGuard in demo mode)
  src/common/guards/           # PermissionsGuard, CompanyScopeGuard — the actual RBAC enforcement
  src/metrics/                 # repository (DB/fake branch), derived-metrics math, CSV import, comparison endpoint
  src/cohorts/                 # retention grid; the SQL GROUP BY that v1's JSON-per-customer schema could not express
  src/companies/               # company list, settings (thresholds), member roles, invite lifecycle
  src/audit/                   # activity feed backing the notifications bell
  src/reports/                 # @react-pdf/renderer investor update document + persistent share links
  scripts/generate-csv.ts      # standalone CLI, same generator, no server needed
  test/                        # unit + e2e (no database), and test/db/ (real PostgreSQL: invariants, auth/tenancy, cohorts)
frontend/
  src/components/            # Sidebar, TopBar, KpiCard, CommandPalette, Toast/Skeleton/EmptyState/ErrorBoundary
  src/components/charts/     # restyled Recharts (no gridlines, gradient fills, spike annotations)
  src/pages/                 # Dashboard, Cohorts, Metrics, Import, Compare, Investor Update, Invites, Settings, Login, Signup
  src/lib/                   # CompanyContext, AuthContext, ToastContext, api client, shared types
```

## Build order (as executed)

**v1:** Schema + toggles → fake data generator → dashboard + trends → cohort
table → roles + invite model → CSV import → PDF export.

**v2 revamp:** Design tokens (Tailwind/HeroUI theme) → shared component
layer (Toast, Skeleton, EmptyState, CommandPalette, ErrorBoundary) →
dashboard bento layout + drill-down + count-up + chart annotations → auth
screens → settings (+ backend threshold fields) → invite screen +
notifications feed → persona comparison + CSV export → motion pass across
all screens.

**v3 productionization:** the relational rewrite. `Customer` +
`CustomerMonthlyValue` replaced the per-customer JSON blob so retention
becomes a `GROUP BY`; `CompanyMembership` replaced the role on the user;
tokens were cut down to identity only with `X-Company-Id` resolved against the
database per request; invites, share links and audit rows became real tables;
and a real-PostgreSQL suite (`pnpm test:db`) was added because none of the
above is observable from a unit test with a fake data source.

**v4 sessions:** the refresh token moved into an httpOnly cookie as an opaque
random value stored only as a hash, rotated on every use, with reuse treated as
theft. `POST /auth/logout` now exists and revokes server-side, and the Devices
page lists and revokes live sessions. The database suites were also moved onto
the URLs production actually serves, which had been hiding that the refresh
cookie's `Path` never matched the URLs under test.

Live sockets, i18n, and real Stripe billing remain out of scope, named rather
than silently skipped.
