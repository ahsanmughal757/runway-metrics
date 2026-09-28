# Phase 6 — CI, deploy, observability

**Status:** not started
**Depends on:** Phases 3c, 4, 5

**Note:** this phase left **no breadcrumb in the code**, unlike phases 1–5. Its
scope was reconstructed by elimination and from what the remaining gaps cluster
around. If the original scope was different, this doc is the thing to correct —
which is exactly why it is written down.

## Open decision — resolve before starting

**Deployment target: nginx + compose on a VPS, or a managed host (Fly, Render,
Cloud Run)?**

Evidence for the VPS reading: `main.ts:36-37` disables CSP and COEP with the
rationale that "the API serves JSON only; the SPA is served by nginx, which owns
the document CSP", and `main.ts` binds `0.0.0.0` commenting that "the VPS
firewall and reverse proxy are the real boundary". `scripts/generate-secrets.mjs`
prints "Store these in your secret manager or a gitignored .env **on the
VPS**". So the code assumes nginx, and **no nginx config exists in the repo to
verify it against.**

That assumption is currently load-bearing and unchecked: with CSP disabled on
the API side, the API's security posture depends entirely on a config file
nobody has written.

If the target is a managed host, most of the nginx work below disappears and is
replaced by platform config. Decide first.

---

## 6-1 — CI

**There is no CI at all.** No `.github/` directory, no workflow, no git hooks, no
pre-commit gate.

`pnpm verify` (`package.json:26`) runs lint + typecheck + test + build. It does
**not** run `test:e2e` or `test:db`. So the two suites that would catch
tenancy and authorization regressions are excluded from the default command.

Worse, the suites that *are* in `verify` run with `ENABLE_DATABASE=false` and
`BYPASS_AUTH=true`, so **by construction they cannot catch a broken query, a
missing constraint, or a permission check that exists only in the database
path.** That is precisely the bug class the Phase 1→3 work kept hitting.

`.github/workflows/ci.yml`:

- Run on push and PR.
- `pnpm install --frozen-lockfile`.
- **A `postgres:16-alpine` service container** so `test:db` actually runs.
- `pnpm verify:full` — lint, typecheck, unit, e2e, build, **and** `test:db`.
- `pnpm format:check`, which currently nobody runs and which would rewrite a
  large share of `frontend/src` (`.prettierrc.json` sets `printWidth: 140`; the
  source is hand-wrapped near 120). Expect this to need a dedicated
  format-only pass first.
- Cache the pnpm store.
- Node from `.nvmrc` (`22.12.0`), matching `engines.node`.

The README already justifies why `test:db` exists. This phase makes CI run it.

## 6-2 — containerisation

**No Dockerfile anywhere.** `docker-compose.yml` defines **only**
`postgres:16-alpine`.

- Multi-stage `Dockerfile` for the API: build stage with dev deps, runtime
  stage with `pnpm prune --prod`, **non-root user**, and the Prisma engine +
  generated client present.
- A second target for the frontend: build `dist/`, then serve it. Note the
  frontend has no `Dockerfile` and `vite.config.ts` has no `preview.proxy`, so
  `pnpm preview` cannot currently reach `/api` at all.
- `.dockerignore` — none exists. A missing `.dockerignore` means the whole
  580 kB lockfile, both `node_modules`, and `backend/.env` are in the build
  context. `backend/.env` contains real local credentials.
- **docker-compose:** add `api` and `web` services, drop the obsolete
  `version: "3.8"` key (removed in Compose v2, emits a warning), bind
  `127.0.0.1:5432` instead of publishing to all interfaces, and add a
  `healthcheck` so `pnpm dev:db` does not return before Postgres accepts
  connections. Stop hardcoding `POSTGRES_PASSWORD`; interpolate from env.

## 6-3 — migrations and seed safety

- **No production migration path.** `prisma:migrate` is `prisma migrate dev`.
  There is no `migrate deploy` script, and `start:prod` runs no migration.
  `migrate dev` in production is the wrong command and will be run by someone
  eventually.
- **`prisma/seed.ts:17` hardcodes `DEMO_PASSWORD = 'demo-password-123'`** and
  creates three `@runway.local` accounts with `emailVerifiedAt` set
  (`seed.ts:133`). It is manual-only today, but nothing prevents running it
  against a production `DATABASE_URL` — and combined with the missing deploy
  story, that is the realistic route to known-credential accounts in
  production.
  **Assert `NODE_ENV !== 'production'` in the seed script itself**, and make the
  demo password non-defaultable rather than a constant.
- Confirm the migration story for the Phase 4 `ApiKey` table and the Phase 3
  session columns on a real Postgres, in CI, on every push.

## 6-4 — the serving layer

Required regardless of target, because the build is currently unservable as
shipped:

- **SPA fallback.** `frontend/dist/index.html` references `/assets/...` with no
  `base` config, so the app must be served from the domain root — and no rewrite
  config exists anywhere in the repo. **Every deep link 404s on refresh**:
  `/metrics`, `/devices`, `/cohorts`, all of them. There is also no client-side
  404 route (fixed in Phase 3c-3), so it fails silently either way.
- **Security headers for the document.** `main.ts:36` disables CSP on the API
  because nginx is supposed to own the document CSP. Write that config.
- **gzip/brotli, cache headers.** Hashed assets are immutable and should say so;
  `index.html` must not be cached.
- Terminate TLS and redirect, given `COOKIE_SECURE` is required in production
  (`env.ts:154-158`) and the refresh cookie will not be sent over plain HTTP.
- Do **not** expose Postgres. The compose port bind change in 6-2 is the fix.
- Configure `trust proxy` to match the real hop count — Phase 3c-6 adds the
  setting, this phase supplies the correct value.

## 6-5 — observability

Already in place, and good: `nestjs-pino` with buffered logs, `requestIdMiddleware`
applied first so every response carries `X-Request-Id`, an
`AllExceptionsFilter` with a stable error `code`, a 5xx→`error` / 4xx→`warn` log
split, redaction (`common/logging/redaction.ts`), and `/health` +
`/health/ready` (readiness does `SELECT 1`).

Missing:

- **No error reporting.** Nothing aggregates client or server errors. The only
  sink today is `console.error` in `frontend/src/components/ErrorBoundary.tsx:17`.
  Wire up Sentry or equivalent for both halves.
- **No metrics.** No Prometheus endpoint, no request-rate/latency/error-rate
  series, no tracing. An investor-facing dashboard with no way to see that it is
  down is a gap.
- **Audit-write failures go nowhere.** `audit.service.ts:130-135` logs at error
  level, but nothing consumes it. An audit trail that silently stops recording
  is worse than no audit trail, because it looks like it is working.
- Consider surfacing a count of auth failures and rate-limit hits — they are the
  signals that matter most here, and both are already computed.

## 6-6 — `.gitignore` and repo hygiene

`.gitignore` is 7 lines and matches `.env` **exactly**, so `.env.local`,
`.env.production` and `.env.development` are all unprotected — only
`backend/.env` happens to be covered today.

Add: `.env.*` with a `!.env.example` negation, `coverage/`, `.nyc_output/`,
`test-results/`, `playwright-report/`, `junit.xml`, `*.local`, `.vscode/`,
`.idea/`, `.claude/`, `.cursor/`, and agent state directories.

**Specifically:** `project_context.json` (214 kB) is sitting untracked at the
repo root and is **not** ignored. One `git add -A` from being committed.

Also: `README.md:240` documents 10 pages; there are 18. The README script table
(`:42-49`) omits 13 of the root scripts. There is no deployment section at all.
Update the README as part of this phase, not before.

## Definition of done

- [ ] CI runs on every push and runs `test:db` and `test:e2e`, not just
      `verify`.
- [ ] `pnpm format:check` passes in CI.
- [ ] A non-root multi-stage Dockerfile builds the API; a second target builds
      and serves the frontend.
- [ ] `.dockerignore` exists; `backend/.env` cannot reach a build context.
- [ ] `migrate:deploy` exists and `start:prod` does not run `migrate dev`.
- [ ] The seed refuses to run with `NODE_ENV=production`.
- [ ] Deep links work on a hard refresh. Verified by hand, not assumed.
- [ ] The document has a CSP, TLS is terminated, and `COOKIE_SECURE` works in
      the real deployment.
- [ ] Error reporting is live for both halves and a test error is visible in
      the dashboard.
- [ ] `/health/ready` is wired to whatever orchestrator runs the container.
- [ ] Postgres is not reachable from outside the host.
- [ ] `.gitignore` covers `.env.*`, coverage output, and editor/agent state.
- [ ] README documents deployment, and its page and script counts are correct.
- [ ] `pnpm verify:full` passes in CI.
