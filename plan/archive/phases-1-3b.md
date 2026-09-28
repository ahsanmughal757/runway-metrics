# Phases 1–3b (complete)

Reconstructed after the original plan was lost to session context. The subject
matter of each phase was recovered from phase breadcrumbs left in the code and
confirmed against git history; the guard tests are read from the tree.

These phases are done. Nothing here is a to-do. What follows each entry is the
part that matters: **which test prevents the fix from regressing**, so nobody
deletes a test that looks redundant.

---

## Phase 1 — data correctness, security defaults, test harness

**Commit:** `ccf4b64` "Fixed data correctness and security defaults, added
backend test harness"
**Breadcrumb:** `backend/eslint.config.mjs:53` — "rules that keep the Phase 1
fixes from quietly regressing"

Established the baseline this project was missing:

- A real unit + e2e test harness (`backend/test/*.spec.ts`, `app.e2e-spec.ts`)
  running with `ENABLE_DATABASE=false` against the fake data source, so the
  suite needs no Postgres and runs in seconds.
- Security defaults fixed: `BYPASS_AUTH` + `NODE_ENV=production` now refuses
  to boot (`backend/src/config/env.ts`), placeholder secrets are rejected
  (`.env.example` documents several, so this matters).
- Lint rules added to hold the fixes in place, not just apply them.

**Guards:** `backend/test/env.spec.ts` (env validation, including the
placeholder-secret and empty-vs-absent cases), plus the whole unit suite.

---

## Phase 2 — relational multi-tenant rewrite

**Commit:** `cb6d80c` "Rebuilt the data layer on a relational multi-tenant
schema with database-enforced permissions, invites, share links and cohorts"
**Breadcrumb:** `backend/test/metrics.service.spec.ts:161` — "The Phase 2 fix"

The structural change everything else rests on:

- `Customer` + `CustomerMonthlyValue` replaced a per-customer JSON blob, so
  retention became a `GROUP BY` the database can do instead of JavaScript.
- `CompanyMembership` replaced a role column on the user.
- Tokens were cut down to identity only; company and role are re-resolved from
  the database on **every request** (`backend/src/auth/membership.resolver.ts`).
  This is what structurally eliminates stale-privilege-after-demotion and
  cross-company-token-acceptance.
- Invites, share links and audit rows became real tables.
- A real-PostgreSQL suite (`backend/test/db/`) was added, because none of the
  above is observable from a unit test with a fake data source.
- The audit row now commits **inside the same transaction as the write**
  (`audit.service.ts` `recordIn`). Previously the mutation committed on its own
  and the audit row was a separate best-effort write, so a failure in between
  left the numbers changed with no record of who changed them.

**Guards:** `backend/test/metrics.service.spec.ts:160` ("audits inside the same
transaction as the write"), `backend/test/cohorts.repository.spec.ts` (pins the
"never invent customers in DB mode" invariant — that one once shipped
fabricated MRR into a real tenant's UI), and the whole of `backend/test/db/`.

---

## Phase 3a — rotating refresh sessions, httpOnly cookies, reuse detection

**Commit:** `9abf406` "Added rotating refresh sessions with httpOnly cookies,
reuse detection and a device management screen"
**Breadcrumbs:** `backend/prisma/schema.prisma:261` ("Consumed by Phase 3"),
`backend/src/common/filters/all-exceptions.filter.ts:53` ("in Phase 3, refresh
tokens")

The refresh token moved from the JSON body to an httpOnly cookie as an opaque
random value, stored only as a SHA-256 hash, rotated on every use, with reuse
treated as theft. `POST /auth/logout` now exists and revokes server-side. The
Devices page lists and revokes live sessions. The database suites were moved
onto the URLs production actually serves, which had been hiding that the
refresh cookie's `Path` never matched the URLs under test.

**Guards:** `backend/test/db/sessions.db-spec.ts`, and the `## Unreleased`
CHANGELOG entry from `9abf406` which argues the fail-closed-on-reuse tradeoff
in full. Read it before changing refresh behaviour.

**Known incomplete:** `User.emailVerifiedAt` is decorative. The column exists
(`schema.prisma:71`, "Phase 3 enforces it on the first sign-in") and the seed
sets it, but there is no verification token, no endpoint, and no mailer, and
nothing gates login on it.

---

## Phase 3b — the simultaneous-refresh race

**Commit:** `8adb097` "Fixed simultaneous refreshes both succeeding and
defeating reuse detection"
**Breadcrumb:** the test in `backend/test/db/sessions.db-spec.ts` and the
CHANGELOG entry under the same commit

`SessionsService.rotate` read the session, then updated it. Under PostgreSQL's
default READ COMMITTED isolation those are two separate statements, so two
refreshes of the same token could both read `revokedAt: null` and both mint a
replacement — which defeats the reuse detection from 3a entirely.

Fixed with a compare-and-swap: the token is claimed with
`updateMany({ where: { id, revokedAt: null } })` before any replacement row is
created. Exactly one transaction changes the row; the other matches nothing,
sees `count: 0`, and treats the attempt as reuse.

The client half of this problem was fixed in 3a:
`frontend/src/lib/api.ts` holds a single in-flight refresh promise and shares
it across all waiters, because a client firing four parallel refreshes after
four parallel 401s would otherwise trip reuse detection and revoke its own
family. The comment at `api.ts:48-57` explains why; the server-side CAS above
is what makes it hold even when the client is not the one being careful.

**Guards:** the "two simultaneous refreshes" tests in
`backend/test/db/sessions.db-spec.ts`.
