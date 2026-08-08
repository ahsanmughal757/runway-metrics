# Runway v3 — Implementation Plan (LLM Spec Format)

> Format: task blocks, not prose. Each task = independent unit of work.
> Feed sequentially or in parallel per DEPS field. Repo root = `/runway`.

---

## CONVENTIONS

```
STACK: backend=NestJS+Prisma+Postgres, frontend=Vite+React+TS+HeroUI+Tailwind+Recharts+framer-motion+lucide-react
PATTERN: ENABLE_DATABASE branches in repository layer only, never controller/service
PATTERN: RolesGuard+CompanyScopeGuard on all company-scoped routes
PATTERN: HeroUI components only, no raw <button>/<input>/<select>/<table>, exception=file input
PATTERN: chart colors from frontend/src/components/charts/chartTheme.ts, no hardcoded hex
PATTERN: toast via useToast() from lib/ToastContext, no inline error strings
STYLE: motion=framer-motion fade/stagger on mount, respect prefers-reduced-motion
```

---

## PHASE 1: DERIVED METRICS (backend, no new UI)

```
TASK: burn-multiple
FILE: backend/src/metrics/metrics.service.ts
ADD_FIELD: DerivedMetrics.burnMultiple: number|null
FORMULA: netBurn / netNewMrr_annualized ; netNewMrr = (current.mrr - prior.mrr)*12
NULL_IF: netNewMrr <= 0
DEPS: none
```

```
TASK: rule-of-40
FILE: backend/src/metrics/metrics.service.ts
ADD_FIELD: DerivedMetrics.ruleOf40: number|null
FORMULA: momGrowthRate_annualized + profitMarginPct
  profitMarginPct = ((mrr - burnRate) / mrr) * 100
NULL_IF: mrr <= 0
DEPS: none
```

```
TASK: quick-ratio
FILE: backend/src/metrics/metrics.service.ts
ADD_FIELD: DerivedMetrics.quickRatio: number|null
FORMULA: (newMrr + expansionMrr) / (churnedMrr + contractionMrr)
NULL_IF: denominator == 0
DEPS: none
```

```
TASK: propagate-types
FILE: frontend/src/lib/types.ts
ACTION: mirror DerivedMetrics additions from backend (burnMultiple, ruleOf40, quickRatio)
DEPS: burn-multiple, rule-of-40, quick-ratio
```

---

## PHASE 2: NEW CHARTS

```
TASK: mrr-waterfall-chart
FILE: frontend/src/components/charts/MrrWaterfallChart.tsx
INPUT: Snapshot (single month, current + prior for start value)
LIB: recharts BarChart, stacked bars w/ invisible "base" series to fake floating segments
SEGMENTS: [startMrr, +newMrr, +expansionMrr, -contractionMrr, -churnedMrr, endMrr]
COLOR: start/end=chartColors.accent, positive=chartColors.positive, negative=chartColors.negative
MOUNT: month selector (default=latest) via HeroUI Select, reuse pattern from Compare.tsx
PLACEMENT: new card on Dashboard, full-width, below MRR Trend
DEPS: none new lib
```

```
TASK: burn-multiple-chart
FILE: frontend/src/components/charts/BurnMultipleChart.tsx
INPUT: Snapshot[] (uses derived.burnMultiple)
LIB: recharts LineChart, ReferenceLine at y=1 (efficient) and y=2 (watch zone) labeled
COLOR: line=chartColors.accent, ref lines=chartColors.muted dashed
PLACEMENT: Dashboard bento grid, col-span-5 (pairs with existing NRR card)
DEPS: burn-multiple
```

```
TASK: rule-of-40-chart
FILE: frontend/src/components/charts/RuleOf40Chart.tsx
INPUT: Snapshot[] (uses derived.ruleOf40)
LIB: recharts BarChart, Cell color per bar: >=40 positive, <40 negative (pattern copy MomGrowthChart.tsx Cell logic)
REF_LINE: y=40 labeled "Rule of 40"
PLACEMENT: Dashboard bento grid, col-span-7
DEPS: rule-of-40
```

```
TASK: quick-ratio-chart
FILE: frontend/src/components/charts/QuickRatioChart.tsx
INPUT: Snapshot[] (uses derived.quickRatio)
LIB: recharts LineChart, ReferenceLine y=4 (healthy SaaS benchmark) labeled
PLACEMENT: Dashboard bento grid, pairs with rule-of-40-chart
DEPS: quick-ratio
```

```
TASK: cohort-ltv-chart
FILE: frontend/src/components/charts/CohortLtvChart.tsx
INPUT: CohortRow[] (existing /cohorts/retention response)
COMPUTE: cumulative revenue per cohort per month-offset = sum(revenueRetention[0..t] * cohortStartingRevenue) approximation
  OR simplest: reuse mrrByMonth already generated server-side, sum per cohort per offset -> new backend field
BACKEND_TASK: cohorts.service.ts getRetentionTable() also return cumulativeRevenuePerCohort: number[] per row
LIB: recharts LineChart, one line per cohort (max 6 most recent), legend=cohort label
PLACEMENT: Cohorts.tsx page, new card below CohortTable
DEPS: cohort-ltv-backend-field
```

```
TASK: cohort-ltv-backend-field
FILE: backend/src/cohorts/cohorts.service.ts
ADD_FIELD: CohortRow.cumulativeRevenue: number[]
FORMULA: running sum of per-cohort revenue across month offsets (already have per-entry mrrByMonth)
DEPS: none
```

```
TASK: metrics-table-sparklines
FILE: frontend/src/pages/Metrics.tsx
ACTION: add sparkline column to History table, mini recharts LineChart per row (last 6 months mrr trend ending at that row)
LIB: recharts LineChart, width=80 height=24, no axes, stroke=chartColors.accent
DEPS: none
```

```
TASK: runway-scenario-slider
FILE: frontend/src/components/RunwayScenarioSlider.tsx
INPUT: latest Snapshot (mrr, burnRate, cash) + derived thresholds
UI: two HeroUI Slider (growth adjustment -20%..+20%, burn adjustment -20%..+20%), live-recompute runwayMonths client-side on change
CHART: recharts LineChart, cash-to-zero projection line recomputed on slider change, baseline dashed line = current projection
PLACEMENT: new page OR Dashboard card — recommend new route /scenarios
ROUTE: frontend/src/pages/Scenarios.tsx + App.tsx lazy route + Sidebar nav item
DEPS: none new lib, pure client-side math mirroring backend deriveForIndex burn/runway formula
```

```
TASK: benchmark-percentile-chart
FILE: frontend/src/components/charts/BenchmarkChart.tsx
BACKEND_TASK: static benchmark dataset, backend/src/fake-data/benchmarks.ts
  export const BENCHMARKS = { churnPct: [p10,p25,p50,p75,p90], nrrPct: [...], burnMultiple: [...] } // hardcoded seed-stage SaaS percentile bands, invented plausible values, label as illustrative
ENDPOINT: GET /metrics/benchmarks (no auth-sensitive data, static)
UI: horizontal bar showing where latest.derived value falls within band, HeroUI Chip "You: 65th percentile"
DISCLAIMER: caption text "Illustrative benchmark bands, not sourced from live market data" — required, do not omit
PLACEMENT: Dashboard, small card near Runway KPI
DEPS: none
```

---

## PHASE 3: NEW PAGES (static/semi-static, high legitimacy-per-effort)

```
TASK: page-integrations
FILE: frontend/src/pages/Integrations.tsx
CONTENT: grid of HeroUI Card, one per: Stripe, QuickBooks, Mercury, Plaid, Xero
EACH_CARD: icon (lucide-react generic icon, no trademarked logos), name, description, Chip "Coming soon" (color=default), Button disabled "Connect"
NO_BACKEND: fully static, no API call
ROUTE: /integrations, add to Sidebar secondaryLinks + CommandPalette commands list
DEPS: none
```

```
TASK: page-billing
FILE: frontend/src/pages/Billing.tsx
CONTENT: current plan Card ("Workspace plan: Growth", static renewal date), usage summary (static: "3 of 5 seats used"), Button "Manage billing" disabled/tooltip "Contact your workspace admin"
NO_BACKEND: fully static
ROUTE: /billing, add to Sidebar secondaryLinks + CommandPalette
DEPS: none
```

```
TASK: page-api-keys
FILE: frontend/src/pages/ApiKeys.tsx
CONTENT: HeroUI Table listing 1 fake key (masked, e.g. rw_live_••••••4f2a), Button "Regenerate" (opens confirm modal, no real action — toast "Key regenerated" on confirm), Button "Create new key"
NO_BACKEND: state is client-local only (useState), acceptable per PRD "name it, don't fake it" — label section caption: "Demo only — keys are not persisted or functional"
ROUTE: /api-keys, add to Sidebar secondaryLinks
DEPS: none
```

```
TASK: page-team
FILE: frontend/src/pages/Team.tsx
BACKEND_TASK: GET /companies/members — return founder+investor memberships for companyId
  ENABLE_DATABASE=true: query CompanyMembership join User
  ENABLE_DATABASE=false: return static 2-row demo list (Demo Founder, Demo Investor)
UI: HeroUI Table: name, email, role (Chip), joined date. Founder-only sees "Remove" action (RolesGuard FOUNDER on any mutating future endpoint; v3 = read-only list, no remove impl)
ROUTE: /team, add to Sidebar secondaryLinks + CommandPalette
DEPS: none
```

```
TASK: page-activity
FILE: frontend/src/pages/Activity.tsx
BACKEND_TASK: extend GET /audit/recent -> GET /audit?page=&filter=entityType — paginated, filterable
  reuse existing AuditService.recent, add optional entityType filter param, limit/offset
UI: full-page version of NotificationsBell content — HeroUI Table or list, filter Tabs by entityType (All/Snapshot/Invite/Report), infinite scroll or Pagination
ROUTE: /activity, add to Sidebar secondaryLinks + CommandPalette
DEPS: none
```

---

## PHASE 4: SCREEN-LEVEL ADDITIONS (modify existing files)

```
TASK: global-date-range-picker
FILE: frontend/src/pages/Dashboard.tsx
UI: HeroUI Select or button-group top-right of page (options: 6mo/12mo/24mo/All), default=12mo
ACTION: slice snapshots array before passing to all charts (client-side, no new API param needed — data already fetched full range)
STATE: useState<'6'|'12'|'24'|'all'>, lift above KPI row
DEPS: none
```

```
TASK: account-menu
FILE: frontend/src/components/TopBar.tsx
ACTION: wrap existing Avatar in HeroUI Dropdown/DropdownTrigger/DropdownMenu
ITEMS: Profile (routes /settings), Workspace (routes /settings), Divider, Log out (calls useAuth().logout(), navigate /login)
DEPS: none
```

```
TASK: chart-annotations
FILE: backend/src/metrics/dto.ts, metrics.controller.ts, metrics.repository.ts
BACKEND: SnapshotInput already has `notes?: string` field — expose in UpsertSnapshotDto (already present), surface in MrrTrendChart as ReferenceDot when notes non-empty
FILE: frontend/src/components/charts/MrrTrendChart.tsx
UI: ReferenceDot at month where snapshot.notes truthy, tooltip shows note text on hover (pattern copy ChurnTrendChart.tsx spike ReferenceDot)
FILE: frontend/src/pages/Metrics.tsx
ACTION: ensure notes input field exists in snapshot form (check current form fields, add HeroUI Input "Notes" if missing)
DEPS: none
```

```
TASK: shareable-readonly-link
FILE: backend/src/reports/ (new) share.controller.ts, share.service.ts
BACKEND: POST /reports/share-link -> generate signed token (jwt short-lived or random uuid stored in-memory map for demo mode), GET /public/dashboard/:token -> returns dashboard JSON, no auth guard, token-gated instead
FILE: frontend/src/pages/InvestorUpdate.tsx or Dashboard.tsx
UI: Button "Copy investor link" -> calls share endpoint, copies URL to clipboard, toast "Link copied"
NEW_ROUTE: frontend public view /share/:token (outside AppShell, minimal read-only render of KPI cards + MRR chart)
DEPS: none, scope as demo-mode only similar to compare endpoint pattern
```

```
TASK: inline-table-editing
FILE: frontend/src/pages/Metrics.tsx
ACTION: replace static TableCell values in History table with click-to-edit: onClick sets editingRowId+editingField state, renders HeroUI Input in place of text, onBlur/Enter calls PUT-equivalent (reuse POST /metrics/snapshot upsert, same companyId+month = update)
GUARD: only when role===FOUNDER
DEPS: none
```

```
TASK: data-as-of-timestamp
FILE: frontend/src/components/AppShell.tsx or TopBar.tsx
UI: small text top-right or in footer: "Data as of {latest.month formatted}" — pull from dashboard response, pass via CompanyContext or lift state
SIMPLEST: add to TopBar, fetch latest snapshot month via lightweight context or duplicate small fetch
DEPS: none
```

---

## PHASE 5: MICRO-INTERACTIONS

```
TASK: chart-export-png
FILE: frontend/src/components/charts/ChartExportButton.tsx (new shared component)
LIB: no new dep — use browser canvas: render recharts SVG -> serialize -> draw to canvas -> canvas.toBlob -> download
ACTION: small HeroUI Button isIconOnly variant="light" icon=lucide Download, top-right corner of each ChartCard header
PLACEMENT: add to ChartCard wrapper in Dashboard.tsx (the local ChartCard helper function), pass chart ref
DEPS: none new lib
```

```
TASK: metrics-row-actions
FILE: frontend/src/pages/Metrics.tsx
UI: HeroUI Dropdown per table row (trigger=lucide MoreVertical icon button), items: Edit (triggers inline-table-editing), Delete (confirm modal, calls new DELETE /metrics/snapshot/:month)
BACKEND_TASK: DELETE /metrics/snapshot/:month endpoint, FOUNDER-only, CompanyScopeGuard
DEPS: inline-table-editing
```

```
TASK: keyboard-shortcuts-panel
FILE: frontend/src/components/ShortcutsPanel.tsx
TRIGGER: "?" keydown (no modifier, only when no input focused), reuse CommandPalette.tsx modal pattern
CONTENT: static list — ⌘K commands, / focus search (if applicable), Esc close modals
DEPS: none
```

```
TASK: theme-toggle
FILE: frontend/src/components/TopBar.tsx
UI: HeroUI Switch isIconOnly-style toggle (Moon/Sun lucide icons), default=dark, toggling adds/removes 'light' class strategy
NOTE: full light theme tokens not required for v3 — toggle can be present + functional stub (persists to localStorage, applies class) even if light HeroUI theme values aren't fully designed; document as "dark-optimized, light theme in progress" if not fully styled
DEPS: none, OPTIONAL scope-cut if light theme tokens not built
```

---

## SEQUENCING (suggested)

```
BATCH_1 (backend derived metrics, no UI risk): burn-multiple, rule-of-40, quick-ratio, propagate-types
BATCH_2 (dashboard charts, highest visible impact): mrr-waterfall-chart, burn-multiple-chart, rule-of-40-chart, quick-ratio-chart, runway-scenario-slider
BATCH_3 (static pages, cheap legitimacy): page-integrations, page-billing, page-api-keys
BATCH_4 (real pages w/ backend): page-team, page-activity, cohort-ltv-backend-field, cohort-ltv-chart
BATCH_5 (polish): global-date-range-picker, account-menu, data-as-of-timestamp, metrics-table-sparklines
BATCH_6 (stretch, higher effort): shareable-readonly-link, inline-table-editing, chart-export-png, chart-annotations, benchmark-percentile-chart
BATCH_7 (optional/cut-if-low-time): keyboard-shortcuts-panel, theme-toggle, metrics-row-actions
```

## NAV/IA UPDATE (apply after Phase 3)

```
FILE: frontend/src/components/Sidebar.tsx
primary_links: Dashboard, Cohorts, Metrics, Import, Compare, Scenarios, Investor Update
secondary_links (Workspace section): Investor Invites, Team, Activity, Integrations, Billing, API Keys, Settings
FILE: frontend/src/components/CommandPalette.tsx
add commands: Scenarios, Team, Activity, Integrations, Billing, API Keys
```

## NON-GOALS (do not implement)

```
- real Stripe/QuickBooks/Mercury OAuth (Integrations page stays static)
- real API key issuance/auth (ApiKeys page stays client-local demo)
- real billing/payment processing
- light theme full token set (optional, stub acceptable)
- benchmark data from real market sources (must be labeled illustrative)
```
