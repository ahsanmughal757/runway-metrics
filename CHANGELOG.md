# Changelog

Behaviour changes that a reader of the code would not predict, and that would be
easy to "fix" back by accident. Anything that changes what the API *accepts* or
what the client *sees* belongs here, whether or not it is a bug fix.

## Unreleased

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
