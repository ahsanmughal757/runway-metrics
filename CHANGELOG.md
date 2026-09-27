# Changelog

Behaviour changes that a reader of the code would not predict, and that would be
easy to "fix" back by accident. Anything that changes what the API *accepts* or
what the client *sees* belongs here, whether or not it is a bug fix.

## Unreleased

### Added: rotating refresh sessions, and a logout that really logs out

**Was:** `POST /auth/login` returned a 15-minute access token and nothing else.
`frontend/src/lib/api.ts` already called `POST /auth/refresh`, which did not
exist, so that call 404'd, the retry failed, and every user was silently signed
out after 15 minutes. The frontend's "log out" button cleared `localStorage`
only: the `logout()` comment said outright that it was "not a security
boundary", and it was not.

**Now:**

- `POST /auth/register` and `POST /auth/login` also set an httpOnly cookie
  (`runway_rt` by default, `Path=/api/auth`, `SameSite=Lax`, `Secure` in
  production). The refresh token is not in the JSON body and is not reachable
  from JavaScript.
- Only the SHA-256 hash is persisted, in the `Session.tokenHash` column that
  the baseline migration already had.
- `POST /auth/refresh` rotates: the presented token is revoked and replaced
  with a new one in the same `familyId`, sharing the original `expiresAt` so a
  30-day login cannot slide into forever.
- Reusing a spent token revokes the **whole family** and returns 401. This is
  the property worth arguing about: a stolen cookie that the thief uses first
  locks the real user out, and vice versa. The alternative — silently issuing a
  second token — means a stolen cookie is undetectable until someone notices.
  Failing closed is the point.
- `POST /auth/logout` revokes the family server-side and clears the cookie with
  matching attributes. An already-issued access token keeps working until it
  expires; revoking a stateless JWT is not something this schema can do.
- `GET /auth/sessions` lists live sessions (userAgent, ip, createdAt,
  lastUsedAt, expiresAt) and `DELETE /auth/sessions/:id` revokes one. Both
  require a database; in `BYPASS_AUTH` demo mode they return the same
  `ENABLE_DATABASE` conflict the other credential routes do, and the **Devices**
  page says so rather than showing an empty list.
- Every row carries `isCurrent`, resolved by matching the request's refresh
  cookie against `Session.familyId`. Without it the list cannot say which entry
  is the device you are reading it on, and revoking the wrong row signs *you*
  out — a page about account security that breaks your session on a misclick
  teaches people to distrust it. It follows the cookie, not the access token:
  two devices holding the same access token are told apart correctly.
- A refresh for a **deactivated** account revokes every session belonging to
  that user, not only the family that presented the token.

**Affects:** every `ENABLE_DATABASE=true` deployment needs
`COOKIE_SECURE=true` in production — `env.ts` refuses to start without it.

**Watch for:**

- `ip` and `userAgent` are **recorded, not enforced**. An IP that changes is
  normal on mobile, and binding sessions to one would sign people out on
  cellular. They exist for the device list to show.
- Concurrent refreshes are a real hazard, not a theoretical one: each refresh
  spends its token, so a client that fires four parallel refreshes after four
  parallel 401s would trip reuse detection and revoke its own family. The
  frontend therefore holds a single in-flight refresh promise
  (`frontend/src/lib/api.ts`) and shares it across all waiters. The *server*
  also resolves the race on its own — see below, because the client fix alone
  was not sufficient.
- The client no longer attempts a refresh for 401s from `/auth/login`,
  `/auth/register`, `/auth/refresh` or `/auth/logout`, or when there is no token
  to refresh. A wrong password must not mint a token.

### Fixed: two simultaneous refreshes could both succeed, defeating reuse detection

**Was:** `SessionsService.rotate` read the session, then updated it. Under
PostgreSQL's default READ COMMITTED isolation those are two separate statements,
so two refreshes of the same token could both read `revokedAt: null` and both
proceed to mint a replacement.

**Now:** the token is claimed with a compare-and-swap —
`updateMany({ where: { id, revokedAt: null } })` — before any replacement row is
created. Exactly one transaction changes the row; the other matches nothing,
sees `count: 0`, and treats the attempt as reuse, revoking the family.

**Why it mattered:** this was not a theoretical edge. The test that pins it
found that two concurrent refreshes both returned 200 and left the family with
**two live sessions** sharing one `familyId`. That is the outcome reuse
detection exists to prevent, and it was passing silently — the one bug in this
feature that a stolen token could have exploited directly, since a thief
racing the real user is exactly this request pattern. It also defeated the
feature for benign two-tab races, which would have looked like random logouts.

**Affects:** `SessionsService.rotate` only. No API or schema change.

**Watch for:** the loser revokes the family, which includes the replacement the
winner was just handed, so both callers end up signed out. That is intended and
is the same fail-closed trade as the sequential case; the client-side
single-flight is what keeps it from happening to someone who simply had two tabs
open.

### Changed: email addresses are trimmed at the request edge, not rejected

**Was:** a value padded with whitespace was refused with a bare
`400 email must be an email`, because `@IsEmail()` validated the raw string
before the service normalised it.

**Now:** the DTO trims first, so the address is accepted and stored normalised.

**Why:** the padded value is what you actually get from a mail client or a
spreadsheet cell, and a 400 for a stray space is a support ticket rather than a
security control. `normalizeEmail()` in `backend/src/common/email.ts` already
trimmed; the validation layer was simply running ahead of it.

**Affects:** every endpoint that takes an address — `POST /auth/register`,
`POST /auth/login`, `POST /companies/invites`, `POST /invites/redeem`.
Implemented as `@Transform(Trim)` from `backend/src/common/email.ts`.

**Watch for:** the database still refuses unnormalised addresses
(see the baseline migration), which is the backstop this change relies on. If a
future write path skips `normalizeEmail`, the transform is not a substitute for
it — `Trim` handles whitespace, `normalizeEmail` handles case.

### Fixed: cohort retention query was a syntax error

`cohorts.repository.ts` built `EXTRACT(... FROM c."signupMonth)))::int` — one
closing double quote short. TypeScript, the linter, the unit tests and the e2e
tests all passed; only the report called against a real database failed, with
Prisma `P2010` / PostgreSQL `42601` reported as an opaque `DATABASE_ERROR`.

Fixed, and covered by `backend/test/db/cohorts.db-spec.ts`. This is the reason
`pnpm test:db` exists as a separate suite — see the Tests section of the
README.

### Changed: the database suites now call the URLs production serves

`backend/test/db/harness.ts` mounted the app without `setGlobalPrefix`, so every
suite called `/auth/login` and `/auth/refresh` while the server only ever
answers on `/api/auth/login` and `/api/auth/refresh`. The routes were the same
handlers, so the mismatch was invisible — until the refresh cookie arrived, whose
`Path=/api/auth` never matched the URLs the tests were calling.

The harness now applies the same prefix with the same `health` exclusions as
`main.ts`, and the suites were updated to match. This closes a gap where a
routing or cookie-scoping mistake would have passed the database suite and
failed in production. It is worth noticing what the gap hid: the session tests
were asserting on a cookie the browser would never have sent to those URLs.

**Affects:** `test/db/*.db-spec.ts` request paths only. `/health` and
`/health/ready` remain unprefixed, matching the exclusion in `main.ts`, because
that is where orchestrators probe.
