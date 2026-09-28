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
| **3c** | **Regressions in shipped phases** | **in progress** | [phase-3c-regressions.md](phase-3c-regressions.md) |
| 4 | Credential encryption (AES-256-GCM) + real API keys | not started | [phase-4-credential-encryption.md](phase-4-credential-encryption.md) |
| 5 | Frontend data layer | not started | [phase-5-frontend-data-layer.md](phase-5-frontend-data-layer.md) |
| 6 | CI, deploy, observability | not started | [phase-6-ci-deploy-observability.md](phase-6-ci-deploy-observability.md) |

Phase 3c is a late insertion. Phases 1–3b shipped with defects that were only
found by auditing them afterwards — one of them a privilege escalation. It runs
before Phase 4.

## Why phases 1–3b are in `archive/`

Phases 1–3b are complete, so their detail is history. But the *reasoning* is
not: the tests that pin each fix are the only thing preventing those bugs from
quietly coming back. `archive/phases-1-3b.md` records what each phase
established and **which test guards it**, so the next reader does not
"clean up" a test without learning what it is for.

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
| Frontend data layer: TanStack Query, or a hand-rolled `useResource` hook? | Phase 5 | no |

Phase 3c and Phase 4 do not depend on either answer.
