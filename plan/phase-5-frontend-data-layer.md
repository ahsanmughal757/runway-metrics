# Phase 5 — frontend data layer

**Status:** not started
**Depends on:** Phase 3c
**Breadcrumb in the tree:** `frontend/eslint.config.mjs:34-38`

> Every page fetches in an effect and stores the result in state. That is the
> pattern the Phase 5 rewrite replaces with a data layer, so holding the gate
> red on it now would only block every other change behind a refactor that is
> already scheduled. Kept visible as a warning, and it goes to `error` when
> those pages are rewritten.

`react-hooks/set-state-in-effect` is downgraded to `warn` at
`frontend/eslint.config.mjs:39` **solely** to unblock other work. Turning it
back to `error` is this phase's definition of done.

There is no data-fetching library: `rg 'react-query|swr|apollo|zustand|redux'`
across `frontend/` returns zero. Every one of the 18 pages hand-rolls
`useEffect` + `useState` + `loading` + `error` + `empty`, mostly incorrectly.

## Open decision — resolve before starting

**TanStack Query, or a hand-rolled `useResource` hook?**

| | TanStack Query | Hand-rolled `useResource` |
|---|---|---|
| Code to maintain | none | ~120 lines, and it will grow |
| Caching / dedupe / background refetch | free | must be written and debugged |
| Cache invalidation after mutation | free | must be written per page |
| Bundle cost | ~13 kB gzip | 0 |
| Fits this repo's style | weaker | stronger |

This repo is notably light on dependencies and its comments argue for
hand-rolled choices (e.g. the single-flight refresh in `api.ts` was written by
hand and is well reasoned). But the frontend already ships an 808 kB entry
chunk, so 13 kB is not the deciding factor either way.

Phase 3c lands the error-state and cancellation fixes that this phase builds on.
Whatever is chosen, do not start before 3c is done.

## Why the current pattern is broken, specifically

Phase 5 is not "add a library". These are the defects it exists to remove:

1. **No cancellation anywhere.** `api.ts:98` passes no `signal`, and there are
   **zero** `AbortController`/`AbortSignal` matches across `frontend/src`. Every
   `.then(setState)` is unguarded, so a response that arrives after unmount
   still sets state.
2. **Stale-response races.** Switching company in the top bar, or switching
   persona on `/compare`, is **last-write-wins, not last-request-wins**. The
   older response can land after the newer one and overwrite it. On a dashboard
   showing the wrong company's MRR, that is a correctness bug, not a cosmetic
   one.
3. **Six fetches with no `.catch`** (fixed in 3c-4) — permanent skeleton.
4. **`null` is overloaded as "loading".** Only `Dashboard.tsx:35` uses a real
   `loading` boolean. The rest use a `null` sentinel, which conflates loading
   with empty. `ShareView.tsx:62,89` uses `!data && !error`; if `!token`
   (`:25`) the skeleton renders forever.
5. **No dedupe.** N components asking for the same company issue N requests.
6. **No invalidation.** Update a metric, navigate away and back, and you may
   see stale numbers with nothing to trigger a refetch.
7. **No retry or backoff defaults.** 5xx and 429 are never retried; no
   `Retry-After` handling.

## Scope

- Migrate all 18 pages off `useEffect` + `useState`.
- Cache keys derived from `activeCompanyId` so switching tenants cannot serve
  another tenant's cached data. **This is the security-relevant part of the
  phase** — a shared cache key across companies would render one tenant's
  financials in another's dashboard.
- Then flip `react-hooks/set-state-in-effect` to `error`
  (`eslint.config.mjs:39`) and clear the `no-explicit-any` and
  `consistent-type-imports` warnings at `:40` and `:42`.
- Default timeouts and `AbortSignal` throughout (from 3c-5).
- Extract the 5 duplicated `localStorage` key literals into one module.

## Also folded in, because they are the same class of work

Not strictly a data layer, but they share the reason the data layer was
introduced, and splitting them across phases would mean touching every page
twice:

- **No mobile navigation.** `Sidebar.tsx:33` is `hidden md:flex`. Below 768px
  there is no sidebar, no hamburger, no drawer, and no bottom nav — the only
  navigation is the ⌘K palette, which is keyboard-only. The app is effectively
  desktop-only despite being responsive elsewhere.
- **Bundle size.** 808 kB entry chunk, 368 kB chart chunk, 280 kB CSS, no
  `build` block in `vite.config.ts` (no `manualChunks`, no `sourcemap`, no
  `target`), no analysis tool, no budget. Per-page lazy loading already works
  and is verified in `dist/assets/` — build on that.
- **`prefers-reduced-motion`.** Exactly one implementation in the whole app
  (`CountUp.tsx:12`), against `framer-motion` page transitions with
  `staggerChildren` throughout and **4 infinite CSS animations** in
  `tailwind.config.ts:63-68` (`shimmer`, `float`, `pulse-dot`).
- **Dialog accessibility.** `CommandPalette` and `ShortcutsPanel` have
  `role="dialog"` but no `aria-modal`, no focus trap, no focus restore.
  `ShortcutsPanel` has **no close button** — Escape or backdrop only. The
  palette is not a real combobox: bare `<input autoFocus>` with no
  `role="combobox"`, no `aria-expanded`, no `aria-activedescendant`, and **no
  arrow-key navigation** of the 14-item list.
- **No `aria-current="page"`** on the active nav item (`Sidebar.tsx:98-124` —
  a CSS class and a `layoutId` only). No focus-visible styling, no skip link
  (`AppShell.tsx:27` goes straight to `<main>` with no id).
- **`NotificationsBell.tsx:28-43`** — no `aria-expanded`/`aria-haspopup`, no
  Escape to dismiss.
- **`Import.tsx:70-72`** — a `<div role="button" tabIndex={0}>` handling
  `Enter` but not `Space`. Fails WCAG 2.1.1.
- **`CohortTable.tsx`** — no `<th scope>`, no `<caption>`, and the 5 colour
  tiers in `cellColor()` (`:5-11`) have no legend.
- **No `autoComplete`** on any form input; form errors (`Login.tsx:62`,
  `Signup.tsx:75`) are bare `<p>` with no `role="alert"`.
- **SEO/meta.** `frontend/index.html` is 18 lines with **no description, no OG
  tags, no Twitter card, no favicon, no `theme-color`, no manifest**, and a
  static `<title>` — `document.title` is never managed, so all 18 routes share
  one title.
- **Real identity in the chrome.** `Sidebar.tsx:82-87` and `TopBar.tsx:113`
  hardcode `"DF"` / `"Demo Founder"` while `SessionUser` sits unread.
- **`ShareView.tsx` has no empty state** and must not be able to sign the user
  out (3c-5).

## Out of scope

i18n (the README names it out of scope), SSR/SSG (an SPA behind a CDN is a
deliberate choice), and PWA/offline.

## Tests

- Extend the runner from 3c-10.
- Per-page: loading, error, empty, and success states. The error and empty
  states are the ones that have never existed.
- Tenant isolation: switching company must not surface cached data from the
  previous company. Write this test.
- Race: a slow response for company A must not overwrite company B's data.
  Write this test too — it is the defect most likely to silently return.

## Definition of done

- [ ] All 18 pages use the data layer. No hand-rolled `useEffect` fetch remains.
- [ ] `react-hooks/set-state-in-effect` is `error` in `eslint.config.mjs`.
- [ ] `no-explicit-any` and `consistent-type-imports` are back to `error`.
- [ ] Tenant-isolation and race tests exist and pass.
- [ ] Mobile navigation exists below 768px.
- [ ] `prefers-reduced-motion` is honoured globally.
- [ ] Every dialog traps and restores focus; the palette has combobox
      semantics and arrow-key navigation.
- [ ] `aria-current="page"` on the active nav item.
- [ ] Per-route `document.title`; meta description, OG, Twitter card, favicon
      and `theme-color` present.
- [ ] Bundle sizes measured and recorded; a budget exists and is enforced.
- [ ] `pnpm verify:full` passes and `pnpm test` now includes the frontend.
- [ ] CHANGELOG.md records the user-visible changes.
