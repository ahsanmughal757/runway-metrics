# AGENTS.md

Instructions for AI agents and humans working in this repository.

## Read before you touch anything

This project is being taken to production grade through a **six-phase plan that
lives in [`plan/`](plan/README.md), not in anyone's context.** A previous plan
was lost because it was only ever discussed in a chat session. Do not recreate
that failure.

1. **[`plan/README.md`](plan/README.md)** — status table and standing rules.
2. **The phase doc for the phase you are working on** — its checklist is the
   definition of done.
3. **[`CHANGELOG.md`](CHANGELOG.md) `## Unreleased`** — behaviour changes that
   are not obvious from the code, and the reasoning behind them. The
   `was:`/`now:` entries explain *why*, which the code alone cannot.
4. `git log --oneline -6` and `git status`.

Work **one phase at a time.** Do not start Phase N+1 until Phase N's doc is
ticked off and moved to `plan/archive/`.

## The plan is a file, not a conversation

- If you learn something that changes the plan, **edit the phase doc first**,
  then change the code.
- Tick checklist items as work lands, not at the end.
- If you find work that does not fit the current phase, put it under **"Found
  while working on this"** in that phase's doc and triage it there. Do not
  silently defer it to a later phase — that is how scope becomes fiction.
- When a phase completes: move it to `plan/archive/`, update the status table,
  and record which test guards each fix.

## Phase breadcrumbs in code are load-bearing

Several source comments name the phase that introduced a decision — e.g.
`backend/eslint.config.mjs:53` ("the Phase 1 fixes"),
`frontend/eslint.config.mjs:35` ("the Phase 5 rewrite"),
`backend/src/config/env.ts` ("it encrypts share-link tokens and any connector
credential added later"), `backend/prisma/schema.prisma:71,261` ("Phase 3").

**These are how phases 1–3b were reconstructed after the plan was lost.** Keep
them accurate. If a phase's scope changes, `rg` for the number and fix the
references. Do not delete one as "stale" — update it.

## This codebase argues in its comments

The house style is a comment that explains the tradeoff, not a comment that
restates the code. "Why accept a used-cookie-only logout" and "why fail closed
on token reuse" are the standard. When you make a security or correctness
decision, document it **at the decision**, including the option you rejected.
If a future reader is likely to "fix" your choice back, say so explicitly.

Match the existing voice: no comments that merely restate code, no TODOs, no
`any`, no silent `catch (e) {}`.

## Verify before you claim done

```bash
pnpm verify:full   # lint + typecheck + unit + e2e + build + real-PostgreSQL suite
```

`pnpm verify` **skips `test:db` only** — it runs lint, typecheck, the backend unit
and e2e suites, the frontend unit suite, and the build. `test:db` is the sole
suite that can see a broken query, a missing constraint, or an authorization
rule that exists solely in the database path. Use `verify:full` whenever you touch
anything under `backend/src/`, a Prisma schema or migration, or a permission.

If you add a `$queryRaw`, a database constraint, or an authorization rule, put a
test in `backend/test/db/`. Otherwise nothing will catch it. The cohort SQL that
shipped with a missing quote and passed every other suite is why that rule
exists.

## Conventions

- **pnpm workspace**, not npm. Node from `.nvmrc` (22.12.0).
- Prettier: single quotes, semicolons, `printWidth: 140`, trailing commas.
- Both packages use flat ESLint config.
- The backend is NestJS with modules per domain (`auth`, `companies`, `metrics`,
  `cohorts`, `reports`, `audit`, `health`, `common`).
- Environment config is validated by zod in `backend/src/config/env.ts`, which
  **refuses to boot** on unsafe production combinations. New env vars go in the
  zod schema, in `backend/.env.example`, and in the redaction list if secret.
- Access tokens carry **identity only**. Company and role are re-resolved from
  the database on every request. Do not put authorization decisions in a token.
- Demo mode (`ENABLE_DATABASE=false`, `BYPASS_AUTH=true`) is served by a fake
  data generator. A change must work in **both** modes, and
  `backend/test/cohorts.repository.spec.ts` exists to stop fabricated data
  reaching a real tenant.

## Security rules

- Never commit a secret, a real `.env`, or a credential. `.env` is ignored but
  `.env.*` is not — check before `git add`.
- Never log a request body: it carries passwords and refresh tokens.
- All SQL is parameterized. There is no `$queryRawUnsafe` in application code,
  and adding one needs a reason in a comment.
- Prefer failing closed. A permission that is declared but unenforced is a
  latent hole, not a harmless omission.
- Do not commit changes that make a security control *configurable into
  insecurity*. `env.ts` exists to prevent that; extend it rather than working
  around it.
