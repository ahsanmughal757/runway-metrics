# Runway — Investor-Grade Metrics for Founders (v2)

Portfolio project #2 (Ledgerly's sibling — same architectural pattern, reskinned).
A founder's metrics dashboard whose real output is a polished **PDF investor
update**, with server-enforced Founder/Investor roles and a cohort retention
table built on a realistically-modeled fake-data generator.

**v2 revamp:** new design system (deeper navy palette, amber 2nd accent,
condensed type scale, motion via framer-motion), a bento-grid dashboard with
KPI→chart drill-down and animated count-up numbers, a command palette (⌘K),
toast notifications, a real notifications feed, configurable runway
thresholds, an investor-invite screen, cross-persona comparison, CSV export,
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
(steady grower / hypergrowth-then-plateau / struggling), and the
Founder/Investor toggle demonstrates the read-only Investor experience.
Press **⌘K** anywhere to jump between screens.

`BYPASS_AUTH=true` must never be set outside local development —
`src/config/env.ts` throws at boot if it's combined with `NODE_ENV=production`.

### Full mode (real Postgres, real JWT auth)

```bash
pnpm dev:db                     # starts Postgres on :5432
cp backend/.env.example backend/.env
# set ENABLE_DATABASE=true, BYPASS_AUTH=false
pnpm db:migrate
pnpm db:seed                    # seeds all 3 personas + demo users
pnpm dev
```

Demo logins after seeding: `demo.founder@runway.local` /
`demo.investor@runway.local`, password `demo-password-123`. The `/login` and
`/signup` screens are wired to the real `auth.controller.ts` endpoints in
this mode.

Generate a standalone sample CSV (same generator, no server needed):

```bash
pnpm --filter runway-backend exec ts-node scripts/generate-csv.ts --persona=hypergrowth --out=./sample.csv
```

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
- **Investor Invite screen** — wired to the `InvestorInvite` model and
  `companies/invites` endpoints that existed in v1 but had no UI.
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
- **Route-level code splitting** via `React.lazy` — each page ships as its
  own chunk.

## What makes this not a gimmick

- **Actually built on HeroUI components** — `Card`/`CardBody`, `Button`,
  `Input`, `Textarea`, `Select`, `Tabs`, `Table`, `Slider`, `Avatar`, `Chip` —
  themed via the custom `runwayDark` HeroUI theme, not raw HTML elements with
  Tailwind classes bolted on. The only native form element left is
  `<input type="file">` behind the CSV drop zone, since HeroUI has no
  file-picker primitive.
- **RBAC is enforced in `RolesGuard` and `CompanyScopeGuard`**, on every
  protected route — not hidden by conditionally rendering UI. The Founder/
  Investor toggle in the demo UI only changes *which* server identity gets
  injected; it never bypasses the guard logic itself.
- **`companyId` always comes from the authenticated session**, never from a
  client-supplied param — `CompanyScopeGuard` rejects any mismatch, closing
  the cross-tenant data leak named as a risk in the PRD.
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
  prisma/schema.prisma       # Company (+ runway thresholds), CompanyMembership, MetricSnapshot, CohortEntry, AuditLog, InvestorInvite
  prisma/seed.ts             # seeds all 3 personas via the shared generator
  src/config/env.ts          # ENABLE_DATABASE / BYPASS_AUTH, single source of truth
  src/fake-data/             # persona configs + realistic generator (snapshots + cohorts)
  src/auth/                  # JWT strategy, AuthGuard (delegates to BypassAuthGuard in demo mode)
  src/common/guards/         # RolesGuard, CompanyScopeGuard — the actual RBAC enforcement
  src/metrics/               # repository (DB/fake branch), derived-metrics math, CSV import, comparison endpoint
  src/cohorts/                # retention table logic (fake-data only, v1)
  src/companies/              # company list, settings (thresholds), investor invites
  src/audit/                   # activity feed backing the notifications bell
  src/reports/                # @react-pdf/renderer investor update document + endpoint
  scripts/generate-csv.ts    # standalone CLI, same generator, no server needed
frontend/
  src/components/            # Sidebar, TopBar, KpiCard, CommandPalette, Toast/Skeleton/EmptyState/ErrorBoundary
  src/components/charts/     # restyled Recharts (no gridlines, gradient fills, spike annotations)
  src/pages/                 # Dashboard, Cohorts, Metrics, Import, Compare, Investor Update, Invites, Settings, Login, Signup
  src/lib/                   # CompanyContext, AuthContext, ToastContext, api client, shared types
```

## Build order (as executed)

**v1:** Schema + toggles → fake data generator → dashboard + trends → cohort
table → roles + investor invite model → CSV import → PDF export.

**v2 revamp:** Design tokens (Tailwind/HeroUI theme) → shared component
layer (Toast, Skeleton, EmptyState, CommandPalette, ErrorBoundary) →
dashboard bento layout + drill-down + count-up + chart annotations → auth
screens → settings (+ backend threshold fields) → investor invite screen +
notifications feed → persona comparison + CSV export → motion pass across
all screens.

Live sockets, an automated test suite, i18n, and real Stripe billing remain
out of scope, named rather than silently skipped.
