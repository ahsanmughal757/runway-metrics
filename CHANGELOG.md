# Changelog

Behaviour changes that a reader of the code would not predict, and that would be
easy to "fix" back by accident. Anything that changes what the API *accepts* or
what the client *sees* belongs here, whether or not it is a bug fix.

## Unreleased

### Fixed: switching company could show the previous company's numbers

`was:` every page kept its own copy of what it had fetched, in `useState`, keyed
by nothing. Six pages also carried a `useState(0)` whose only job was to be a
retry key for an effect, and no fetch passed an `AbortSignal` - so a slow response
for the company you just left would land on top of the company you are now
looking at, last-write-wins rather than last-request-wins.

`now:` reads go through TanStack Query, and **the company id is the first element
of every tenant-scoped cache key**. That part is the fix rather than a tidy-up: a
cache survives a company switch, so a key that does not name the tenant will
happily serve the previous company's MRR under the new company's name.

The leak was invisible from the server. Every request in it was correctly
authorised, because the header did name the company the server then answered for
- the wrong data was already in the browser. No backend test can see it, which is
why `frontend/src/lib/queryKeys.test.tsx` exists: five cases, each verified to
fail when the company is dropped from the key.

### Fixed: a failed fetch was shown as a loading screen, or as no data at all

`was:` `null` meant "loading" on most pages, and on several a failed fetch left
that same screen up forever. `BenchmarkChart` caught its error and set `null`, so
a dead API rendered "Loading benchmarks..." indefinitely - a reader whose backend
was down was told the app was still working. `NotificationsBell` caught its error
into `[]` and rendered "Nothing yet.", which is indistinguishable from a company
with no activity and points people at a setting that does not exist. The share
view had no empty state at all, so a company with no recorded metrics rendered
nothing below the header. The benchmark percentile marker was also stamped from
the browser clock, so `revokedAt` could be hours from when a credential actually
died.

`now:` loading, error and empty are three separate branches. The first load's
failure is reported with a retry; a background refetch that fails leaves the
last good data on screen, which is still correct as of when it was fetched.
Network failures and server refusals are worded differently on purpose, because
lumping them together is what once told anyone whose session had expired to go
and enable the database. Revocation timestamps and percentile positions are
re-read from the server rather than invented in the browser.

### Fixed: signing out did not clear the previous tenant

`was:` signing out cleared the token. It left the company id in React state, and
left every fetched page in its own `useState`, so a signed-out shell kept
rendering one tenant's numbers - and the next person to open the app on a shared
machine saw them before their own bootstrap resolved.

`now:` the tenant is **derived** from the bootstrap cache entry rather than
stored, so "no session" and "no tenant" are the same state and cannot drift
apart. There is no branch in which a remembered company outlives the response that
established it. Signing out additionally clears the whole query cache. The
memory of *which* company you preferred survives a sign-out, and is validated
against the new session's company list before it is believed - that is a
preference, not a credential.

### Fixed: the app showed a hardcoded identity

`was:` the sidebar read `"DF"` and `"Demo Founder"` - not as a placeholder waiting
to be filled in, but as what was shipped. The user's name is returned by
`/auth/me` and was displayed nowhere in the chrome, so every real user saw another
person's name in the only identity the app has.

`now:` the sidebar reads the session's name, falling back to the email, and the
byline is the real role and company.

### Changed: requests are cancelled, deduplicated, retried, and share one entry per company

`was:` no request was ever cancelled. `/metrics/dashboard` was fetched separately
by the dashboard, the metrics page, the scenarios page, and the top bar's
"as of" byline - four requests, four copies, four chances to disagree.

`now:` one cache entry per company per resource, so an imported snapshot updates
all four with no further request. Cancelled requests abandon their work. A
network error is retried twice with backoff, which is a visible change: a reader
on a bad connection now waits out the retry budget instead of being told
immediately that the server is down, and a genuinely unreachable server takes
longer to report. 4xx is never retried. Mutations are never retried at all - a
`POST /metrics/import/commit` that timed out may well have committed, and
retrying it can double-import.

`was:` (also) the persona comparison kept whichever peer was chosen first, for the
life of the page, even after switching to a company whose peer list did not
contain it - so the chart compared against a company the reader was no longer
looking at, under a dropdown that named nothing they had picked.

### Fixed: the app told you the wrong thing when a save half-worked

`was:` `Metrics.tsx` used a single `error` slot for two different failures. A save
that succeeded and whose follow-up reload then failed rendered "Could not load
this" above a stale table, and its Retry button called the very function its own
comment said was deliberately not the retry path for the initial load.

`now:` a write that lands is separated from a write that fails, and a background
refresh that fails is not reported as a failed load.

### Fixed: a missing permission was drawn as an empty list

`was:` a user without `apiKeys:manage` was served an empty array, and the page
rendered **"No keys yet."** - a permission rendered as the truth about their
account. `Cohorts` showed a bare red error card with no way to retry.

`now:` both name the permission as such, and offer a retry.

### Fixed: typing in Settings could be lost to a background refresh

`was:` the settings form held an editable draft seeded from the fetched record.
The data layer refetches on window focus, so a refetch returning different
settings - another admin moved a threshold - would race the draft and a Save
could silently overwrite that change.

`now:` the draft re-seeds during render when the fetched record genuinely changes,
which is React's own "adjust state when a prop changes" pattern. It is not
cleared on every refetch, because that would destroy a half-typed form every time
the reader alt-tabbed.

### Internal: the data layer, and what it replaced

`was:` 15 pages and 3 components each hand-rolled `useEffect` + `useState`
fetching, with `cancelled` flags, retry counters, and a `null` sentinel doing
double duty as "loading". `react-hooks/set-state-in-effect` was downgraded to a
warning to unblock other work.

`now:` TanStack Query, with every key built by a factory in `lib/queryKeys.ts` so
"did you remember the company?" is a question with a compile error attached. The
lint rule is back to `error`, along with `no-explicit-any` and
`consistent-type-imports`, and the whole `src` tree passes at that severity - so
none of them is a warning anyone reads past. `CompanyContext` is a deliberate
exception to the "no state from a fetch" rule in exactly one place: it holds the
*preferred* company, which is user intent rather than a fetch result.

Accessibility, mobile navigation, meta tags and the bundle budget were removed
from this phase's scope and moved to Phase 7. The reasoning is recorded in
`plan/phase-5-frontend-data-layer.md`: this phase's done condition is mechanical,
while Phase 7's are judgements a checklist can tick while the product is still
bad, and coupling the two meant a data-layer regression could only be observed
through an accessibility audit nobody has time to run.

### Fixed: share-link tokens were stored in plaintext, and there was no crypto in the codebase

`was:` `CREDENTIALS_MASTER_KEY` was generated, documented, redacted, and
required in production — and used by nothing. There was no `createCipheriv` in
the repository. `ShareLink.token` was a `@unique` column holding the token in the
clear, and that token is the entire credential for
`GET /api/reports/public/dashboard/:token`, an endpoint that is unauthenticated
by design. Anyone with database read access, a stolen backup, or a `SELECT *`
from any future bug got every live share link for every tenant.

`now:` share-link tokens are stored as a SHA-256 `tokenHash` — the only lookup
path, because an encrypted value cannot be indexed and `resolve()` has to stay a
`findUnique` — plus a `tokenCiphertext` holding a versioned AES-256-GCM
envelope, so the product can still show a company the link it already handed
out. The migration hashes in SQL and marks the ciphertext column `pending:`
rather than encrypting there, because encrypting in a migration would commit the
master key to git; `backend/src/scripts/reencrypt-share-tokens.ts` rewrites those
rows, selecting on the marker so a rerun is provably a no-op.

The crypto is AES-256-GCM through `node:crypto` with a per-record random IV, a
versioned envelope (`v1:<keyId>:<iv>:<tag>:<ciphertext>`) so keys can be rotated
without a second migration, and a verified auth tag — a silently accepted
tampered ciphertext is how credential bugs become unauthenticated access.
`CREDENTIALS_MASTER_KEY` is now checked for 64 hex characters rather than 32
characters: a character count is the wrong test for a key, and the old check
passed values AES-256 could not use.

### Added: API keys that actually authenticate

`was:` the API Keys page rendered a convincing table of keys generated by
`Math.random`, with no backend behind it. Sub-copy admitted this ("Demo only —
keys are not persisted or functional"), which is better than silence and not much
better.

`now:` `GET /companies/api-keys`, `POST /companies/api-keys` and
`DELETE /companies/api-keys/:id` exist behind `apiKeys:manage`, and a key is a
real credential. Send it as `X-Api-Key` and `AuthGuard` accepts it. The secret is
shown exactly once, at creation, because it is stored as a SHA-256 hash and the
database cannot produce it again.

`OWNER` and `ADMIN` can both issue keys. `OWNER`-only was the original proposal
and was rejected: an ADMIN can already do everything except delete the company
and change ownership, so gating on owner alone would have pushed real
integrations into sharing the owner's password. A key may hold any subset of the
existing permission vocabulary **except** `apiKeys:manage` — otherwise a key
could mint a replacement for itself with every scope, which turns revoking one
into a race. The database CHECK constraint enforces the same list, so a direct
write cannot bypass it.

A key presents an identity with no `userId` and no role, which is why
`RequestUser` gained optional `apiKeyId` and `actorLabel` and `PermissionsGuard`
now checks a key's own scopes rather than a role. The rejected alternative was
minting a synthetic `User` row per key, which would have made `AuditLog.changedBy`
a valid id and invented an account that appears in the members list and inherits
whatever role it is later changed to. Audit records for a key are attributed to
the human who created it, with the key id in the diff.

The page no longer offers "regenerate". A secret cannot be re-read, so
regenerating would mean minting a replacement and silently leaving the old key
live; it is now revoke, then create, with both steps explicit.

### Fixed: a member could promote themselves above the OWNER, and demote the OWNER

**Was:** `PATCH /companies/:id/members/:userId` and
`DELETE /companies/:id/members/:userId` checked `actorRole !== 'OWNER'` and
nothing else. A company's **ADMIN** could therefore:

- promote themselves to `OWNER` (`PATCH` only checked that the target was not
  already `OWNER`, so the new role was accepted and written);
- demote or remove the **OWNER** entirely.

Both checks ran *outside* the transaction, against a role read before it. A
concurrent `PATCH` could also interleave between the check and the write, so even
the OWNER-only check was not a guarantee — it was a check of a value that was
allowed to change.

**Now:** `CompaniesService.removeMember` takes `actorRole` and re-reads both
actors' roles *inside* one transaction, and `updateMemberRole` repeats the
proposed-role check in the same place. Both use a shared `assertOutranks` that
throws `ForbiddenException`.

The rule is rank, and it is checked against the database rather than against a
role carried in a token:

- an actor may only manage a member of strictly lower rank;
- a member may only be assigned a role strictly below the actor's own;
- nobody may create, alter, or remove an `OWNER` — the role exists so that
  ownership transfer is a deliberate act, and if an ADMIN can grant it, the role
  is decoration.

Rank comparison lives in SQL (`members.role_rank < actorRank` via a `CASE`
expression over the enum) so it cannot drift from the enum. The rejected
alternative was re-reading the actor's role at the top of the handler and
trusting it for the transaction's lifetime: that trusts a value another request
can change mid-flight, which is the bug this replaces.

Tests: `backend/test/db/auth.db-spec.ts`, 36 passing against a real PostgreSQL.

### Fixed: the session list showed the wrong order, hiding the one you just used

**Was:** the list of active sessions was ordered by `createdAt desc`, so signing
in on a new device put it at the top. `lastUsedAt` was recorded on every request
but never used to sort. Nothing was *wrong*, but the list is meant to answer
"what am I signed in on, and which is this one", and the most-recently-used
session — the one you are looking at — was not identifiable.

**Now:** ordered by `lastUsedAt desc`, `nulls last` (a session that has never
made a request still belongs at the bottom, not the top), then `createdAt desc`
as a tiebreak so two sessions created in the same millisecond have a stable
order.

Tests: `backend/test/db/sessions.db-spec.ts`, 31 passing.

### Fixed: signing in did not load the company, and the guard could not recover

**Was:** `CompanyProvider`'s bootstrap effect returned early when
`isAuthenticated` was false, on the theory that a signed-out browser has no
tenant to load. In demo mode (`BYPASS_AUTH=true`) the app serves full fake data
with no token, so **every** page loaded empty, with no way in.

It is also not fixable from the browser's side: demo mode and signed-out are
byte-identical to the client. Anything that infers a session from the absence of
a token is wrong regardless of how reasonable it looks.

**Now:**

- the bootstrap runs unconditionally, and
- `RequireSession` gates on `CompanyProvider.unauthorized` — a signal the
  provider only sets when the API *rejected* the request — instead of on
  `isAuthenticated`;
- tenant state is cleared on the `true → false` transition of
  `isAuthenticated` (tracked by ref, because the effect must not re-run on every
  value) and on any `401`;
- a network failure sets `offline`, **not** `unauthorized`, so a proxy error
  shows "can't reach the server" rather than bouncing the user to a login page
  for a session they still hold.

The invariant, which is the thing to preserve: **the browser is never the
authority on whether a session exists.**

Test: `frontend/src/lib/CompanyContext.test.tsx` — six cases covering demo
mode, a rejected bootstrap, an offline bootstrap, sign-in after a rejection, and
session teardown. Restoring the old early return turns all six red.

### Fixed: a failed persona switch showed the previous company's numbers

**Was:** `Compare.tsx`'s persona-compare effect had no `.catch`. A failed
persona switch left the *previous* persona's series in state while the selector
showed the *new* one — confidently attributing another company's MRR to the
wrong persona. Same class of bug on every page whose initial fetch had no
failure branch: the page showed its skeleton forever, with no error and no
retry.

**Now:** every initial fetch sets a real error state and renders a shared
`ErrorState` (it distinguishes "couldn't reach the server" from "the server
rejected this" and offers retry). `Compare` clears its series on *every*
persona switch, not only on success, and guards against a late response from a
superseded switch. `Sessions.tsx` no longer claims the database is disabled for
every failure — it says that only for the `403`/`404` that actually means demo
mode.

### Fixed: two top-bar controls were shown in modes where they do nothing

**Was:** the top bar always rendered a viewpoint switcher and a "Log out" item.
Each works in exactly one mode, and in the other it is worse than absent:

- The **viewpoint switcher** sends `X-Demo-Role`, which only `BypassAuthGuard`
  reads. Against a real session the server ignores the header and returns the
  role from the database, so the selected tab springs back. A reviewer could
  reasonably read that as "this is what an ADMIN sees" and be wrong — the role
  came from the membership row, not from the control.
- **Log out** ended a session by revoking the refresh cookie. Demo mode has no
  session and no cookie, so the click cleared nothing: `isAuthenticated` was
  already `false`, so the `true → false` transition the tenant-clearing effect
  keys off never fired, and the app stayed fully populated. A sign-out that
  visibly does not sign you out is worse than none — it implies the session
  model works.

**Now:** `GET /auth/me` returns `demo`, and each control renders only where it
does something. The switcher is demo-only; sign-out is real-session-only.

`demo` comes off the identity `BypassAuthGuard` injects and is never read from
request input, so a real caller cannot promote itself into demo mode and turn
on a control the server would ignore. It is threaded through `RequestUser`
rather than read from `BYPASS_AUTH` in the service, because `auth.guard.ts` is
documented as the only file that branches on that flag.

The client cannot derive this: a healthy demo and a signed-out browser are both
simply "no token". **The browser is never the authority on whether a session
exists** — the same rule as the bootstrap fix above, and the reason this needed
a server change rather than a `localStorage` check.

### Fixed: no 404 route, and deep links to removed pages rendered blank

**Was:** the router had no catch-all, so any unknown path rendered an empty
outlet. `NotFound.tsx` existed and was never registered.

**Now:** registered as the wildcard route.

### Added: a frontend test runner

`pnpm test` did not touch `frontend/` at all — every regression above shipped
green. `frontend/` now has Vitest + Testing Library, and the root `test` script
runs both packages. `frontend/tsconfig.json` now includes the config files,
which is how an invalid `defaultTheme` in `tailwind.config.ts` was caught: it
named a custom theme, but the plugin only accepts `"light" | "dark"`. No runtime
change — `applyTheme()` selects the custom palette via the class it toggles on
`<html>`, so the bad value was already being ignored.

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
