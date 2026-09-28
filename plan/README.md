# Production plan — Runway

Six phases to take this portfolio project from "impressive demo" to
"production grade". This folder is the **single source of truth** for that
plan. It is committed to git on purpose: the plan must not depend on any
agent session's context to survive.

## Read this first, every session

The previous plan was lost because it only ever existed in a chat session's
context. That is the failure mode this folder exists to prevent. Before doing
any work in this repo:

1. Read this file (status table, immediately below).
2. Read the phase doc for the phase you are working on.
3. Read `## Unreleased` at the top of [../CHANGELOG.md](../CHANGELOG.md) — it
   records behaviour changes that are not obvious from the code, and it is
   where the last session's reasoning is.
4. `git log --oneline -6` and `git status`.

Do not start a new phase without confirming phases before it are done.

## Status

| Phase | Subject | Status | Doc |
|---|---|---|---|
| 1 | Data correctness, security defaults, backend test harness | **done** (`ccf4b64`) | [archive/phases-1-3b.md](archive/phases-1-3b.md) |
| 2 | Relational multi-tenant rewrite, DB-enforced permissions | **done** (`cb6d80c`) | [archive/phases-1-3b.md](archive/phases-1-3b.md) |
| 3a | Rotating refresh sessions, httpOnly cookie, reuse detection, devices | **done** (`9abf406`) | [archive/phases-1-3b.md](archive/phases-1-3b.md) |
| 3b | CAS token claim, fixes the simultaneous-refresh race | **done** (`8adb097`) | [archive/phases-1-3b.md](archive/phases-1-3b.md) |
| **3c** | **Regressions in shipped phases** | **done** (`2630072`) | [archive/phase-3c-regressions.md](archive/phase-3c-regressions.md) |
| 4 | Credential encryption (AES-256-GCM) + real API keys | **done** (`4327a34`) | [archive/phase-4-credential-encryption.md](archive/phase-4-credential-encryption.md) |
| 5 | Frontend data layer | **done** | [archive/phase-5-frontend-data-layer.md](archive/phase-5-frontend-data-layer.md) |
| 6 | CI, deploy, observability | in progress | [phase-6-ci-deploy-observability.md](phase-6-ci-deploy-observability.md) |
| 7 | Frontend accessibility, navigation, bundle | not started | [phase-7-accessibility-navigation-bundle.md](phase-7-accessibility-navigation-bundle.md) |

Phase 3c was a late insertion. Phases 1–3b shipped with defects that were only
found by auditing them afterwards — one of them a privilege escalation. It ran
before Phase 4, and moved to `archive/` once its checklist was ticked.

**Next up is Phase 6** (CI, deploy, observability), once Phase 5's commit lands.
Phase 5 resolved its open decision in favour of TanStack Query v5, migrated every
fetch in `src` onto it, and flipped `react-hooks/set-state-in-effect` back to
`error` — the whole tree passes at that severity, so the rule is a gate again
rather than a warning. The one thing worth knowing before starting Phase 6 is
carried over from Phase 4: share-link tokens backfilled by the migration carry a
`pending:` marker and stay unreadable until
`pnpm --filter runway-backend exec tsx src/scripts/reencrypt-share-tokens.ts`
runs, and nothing fails loudly if you skip it. That belongs in the deploy runbook.

**Phase 7** was split out of Phase 5, whose doc originally carried a list headed
"Also folded in, because they are the same class of work" — mobile navigation,
focus traps, `prefers-reduced-motion`, meta tags, bundle budget. Those are
judgement calls that a checklist can tick while the product is still bad, and
Phase 5's own done condition is mechanical (a lint rule is red or it is not).
Coupling them meant a data-layer regression could only be observed through an
accessibility audit nobody had time to run.

## Why completed phases go in `archive/`

A completed phase's detail is history, but the *reasoning* is not: the tests
that pin each fix are the only thing preventing those bugs from quietly coming
back. `archive/phases-1-3b.md` records what each of those phases established
and **which test guards it**. `archive/phase-4-credential-encryption.md` does
the same in a table, because that phase's decisions are exactly the kind a
future reader would "simplify" back — encrypt-only share tokens, OWNER-only key
issuance, a scope list that includes `apiKeys:manage`. Read the guard table
before changing one of those.

## How this folder is maintained

- One file per phase. A phase file is written **before** the phase starts, and
  its checklist is ticked **as** the work lands, not after.
- When a phase completes: move it to `archive/`, update the status table, and
  add the guard tests to the archive doc.
- If a phase's scope changes, the doc changes first. The code follows the doc.
- Anything discovered mid-phase that does not fit the phase goes in the phase
  doc under **Found while working on this** and is triaged there, not silently
  deferred into a later phase.

## Standing rules for every phase

These are not per-phase preferences; a phase that violates them is not done.

- **`pnpm verify:full` passes** before a phase is called done. That is
  lint + typecheck + unit + e2e + build + the real-PostgreSQL suite.
- **`test:db` is not optional.** `backend/test/db/` is the only place a broken
  query, a missing constraint, or a database-only authorization rule can be
  caught. The cohort SQL that shipped with a missing quote and passed every
  other suite is the canonical example.
- **Behaviour changes go in `CHANGELOG.md`** under `## Unreleased`, in the
  existing was/now voice. A reader of the code should not be able to find a
  change and be surprised by it.
- **No new `any`, no `TODO`, no silent `catch (e) {}`** in shipped code. The
  lint rules exist; they are downgraded in exactly two places, both noted
  inline with the phase that owns turning them back to `error`.
- **Document security decisions in the code, at the decision.** This repo's
  value is that the comments argue. "Why accept a used-cookie-only logout" or
  "why fail closed on token reuse" are the kind of note that must not be lost
  in a session.
- **Comments that name a phase must stay accurate.** Several phase
  breadcrumbs in the tree are how phases 1–3b were reconstructed after the
  plan was lost. If a phase's scope changes, grep for its number and fix the
  references.

## Open decisions

Block the phases listed, and only those.

| Question | Blocks | Decided? |
|---|---|---|
| Deployment target: nginx + compose on a VPS, or a managed host (Fly/Render/Cloud Run)? | Phase 6 | no |
| Frontend data layer: TanStack Query, or a hand-rolled `useResource` hook? | Phase 5 | **yes — TanStack Query v5**, see below |

**TanStack Query v5.** Decided in `phase-5-frontend-data-layer.md`. The deciding
argument is Phase 5's own done condition: flip
`react-hooks/set-state-in-effect` to `error`. A hand-rolled `useResource`
fetches in an effect and commits the result with `setState` — the exact pattern
the rule forbids — so it would need a blanket `eslint-disable` on its own body.
The rule would go green and the defect would be intact, in the one file whose
whole job is fetching.

The deployment target is the only open decision left.

There is no "visual refresh" phase. An earlier revision of this conversation
referred to one and it was never written down, so it is not planned work. Phase 7
is a different thing: the accessibility, navigation and bundle items that used to
be folded into Phase 5, split out. Raise a visual refresh as a new phase if it is
wanted.
