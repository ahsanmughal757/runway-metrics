# Phase 7 — frontend accessibility, navigation and bundle

**Status:** not started
**Depends on:** Phase 5 (the data layer — see the split note below)
**Breadcrumb in the tree:** none yet

> **Split out of Phase 5.** These items were originally folded into the data
> layer phase on the reasoning that they "share the reason the data layer was
> introduced, and splitting them across phases would mean touching every page
> twice." That reasoning was wrong on its own terms, and the split was made
> before the Phase 5 work started rather than after it was discovered to be too
> large.

## Why this was split out

Two reasons, and the second is the one that mattered.

**The phase had a done condition that was impossible to state honestly.** Phase
5's definition of done included "flip `react-hooks/set-state-in-effect` to
`error`". That is a mechanical check: the rule is red or it is not. This phase's
done conditions are all judgement — "honoured globally", "a budget exists and is
enforced", "combobox semantics". A checklist of those can be ticked while the
product is still bad, which is exactly the failure mode `AGENTS.md` warns about
when it says a phase doc is "the definition of done".

**The two phases fail independently, and coupling them makes both worse.** A
regression in the data layer should be visible as a red test, not as a failed
accessibility audit that nobody has time to run. Keeping them apart means this
phase can be deferred without putting the data layer at risk, and the data layer
can be finished without waiting on a design judgement about what the navigation
should look like on a phone.

The cost is real and worth recording: both phases touch page components, so some
files are edited in both. That is not the disaster the original note feared —
those are separate hunks in separate concerns, and a merge conflict on a
component is cheap compared to a phase that cannot be finished.

## Scope

Nothing here changes what a page fetches or how. This is the layer above the
data layer: does the app work for someone on a phone, using a keyboard, with
motion turned off, or using a screen reader.

### Navigation

- **Mobile navigation exists below 768px.** `Sidebar.tsx:70` is `hidden md:flex`.
  Below 768px there is no sidebar, no hamburger, no drawer and no bottom nav —
  the only navigation is the ⌘K palette, which is keyboard-only. The app is
  effectively desktop-only despite being responsive everywhere else.
- **`aria-current="page"`** on the active nav item. Today it is conveyed by a CSS
  class and a `layoutId` (`Sidebar.tsx:138-166`) — both visual, both invisible to
  a screen reader.
- **A skip link.** `AppShell.tsx:27` goes straight to `<main>` with no `id`, so
  there is nothing to skip to and no way to offer it.
- **Focus-visible styling.** Keyboard focus is currently not consistently
  visible, which makes the ⌘K palette — the only mobile navigation — hard to
  use even where it does work.

### Dialogs and keyboard

- **`CommandPalette` and `ShortcutsPanel`**: `role="dialog"` but no
  `aria-modal`, no focus trap, no focus restore. Focus escapes to the page behind
  and does not return on close.
- **`ShortcutsPanel` has no close button.** Escape or backdrop only, so a pointer
  user who does not know the shortcut has no visible way out.
- **`CommandPalette` is not a combobox.** Bare `<input autoFocus>` with no
  `role="combobox"`, no `aria-expanded`, no `aria-activedescendant`, and **no
  arrow-key navigation** of its 14-item list. Arrow keys are the expected
  interaction for a listbox and they do nothing.

### Semantics and forms

- **`NotificationsBell.tsx:28-43`** — no `aria-expanded`/`aria-haspopup`, no
  Escape to dismiss.
- **`Import.tsx:70-72`** — a `<div role="button" tabIndex={0}>` that handles
  `Enter` but not `Space`. Fails WCAG 2.1.1 (Keyboard).
- **`CohortTable.tsx`** — no `<th scope>`, no `<caption>`, and the five colour
  tiers in `cellColor()` (`:5-11`) have no legend, so the table's only
  distinguishing channel is one a colourblind reader cannot use.
- **Form inputs**: no `autoComplete` anywhere, so browsers cannot fill them and
  password managers do not offer to save. Form errors (`Login.tsx:62`,
  `Signup.tsx:75`) are bare `<p>` with no `role="alert"`, so a screen reader
  does not announce an error that has just appeared.
- **`ShareView.tsx` has no empty state**, and must not be able to sign the user
  out (3c-5). Carried over from Phase 5's list; it was a data-state defect, not
  an accessibility one, so it stays with the data layer and is not repeated in
  this phase's done conditions.

### Motion

- **`prefers-reduced-motion` honoured globally.** There is exactly one
  implementation in the whole app (`CountUp.tsx:12`), against framer-motion page
  transitions with `staggerChildren` throughout and **four infinite CSS
  animations** in `tailwind.config.ts:63-68` (`shimmer`, `float`, `pulse-dot`).
  Infinite animation is the case that matters: it never stops on its own, so a
  reader who has asked for less motion gets it in perpetuity.

### Meta and identity

- **`frontend/index.html`** is 18 lines with no description, no OG tags, no
  Twitter card, no favicon, no `theme-color` and no manifest. A static
  `<title>` means all 18 routes share one title, and `document.title` is never
  managed.
- ~~**Real identity in the chrome.** `Sidebar.tsx` hardcoded `"DF"` / `"Demo
  Founder"` while `SessionUser` sat unread.~~ **Done in Phase 5** — the sidebar
  reads the session's name, falling back to the email, and the byline is the real
  role and company. It was a Phase 3c leftover: the session's name has been
  available since the token landed. It stayed in Phase 5 rather than here because
  it is a data-state omission, not an accessibility judgement.

### Bundle

- **Bundle size is measured and has a budget.** 808 kB entry chunk, 368 kB
  chart chunk, 280 kB CSS, and no `build` block in `vite.config.ts` at all — no
  `manualChunks`, no `target`, no analysis tool, no budget. Per-page lazy loading
  already works and is verified in `dist/assets/`; build on that rather than
  replacing it.
- **A budget is enforced, not just recorded.** A number in a document does not
  fail a build. Whatever records it has to be something `pnpm verify:full` runs.

## Out of scope

i18n (the README names it out of scope), SSR/SSG (an SPA behind a CDN is a
deliberate choice), and PWA/offline. Also out of scope: redesigning the visual
style. This phase makes the existing interface reachable; it does not make it
look different.

## Tests

- The keyboard cases are the ones worth automating, because they are the ones a
  reviewer will not click through: focus enters a dialog and stays inside it,
  focus returns to the trigger on close, the palette's arrow keys move an active
  option, Escape closes.
- `prefers-reduced-motion`: a test that renders under a matching `matchMedia` and
  asserts the animation is not applied. This is the only way it stays fixed,
  because a global CSS change is invisible to every other test.
- Meta: an assertion that each route sets a distinct `document.title`. Cheap, and
  it catches the copy-paste failure mode.
- No automated coverage is required for the colour legend or the bundle budget;
  those are checked by running the checks, not by a test.

## Definition of done

- [ ] Mobile navigation exists below 768px.
- [ ] `aria-current="page"` on the active nav item.
- [ ] A skip link, and a `<main id>` to point it at.
- [ ] Every dialog has `aria-modal`, traps focus, and restores it on close.
- [ ] `CommandPalette` has combobox semantics and arrow-key navigation.
- [ ] `ShortcutsPanel` has a visible close control.
- [ ] `NotificationsBell` reports its expanded state and closes on Escape.
- [ ] `Import.tsx`'s `role="button"` responds to Space.
- [ ] `CohortTable` has `<th scope>`, a caption, and a legend for the tiers.
- [ ] `prefers-reduced-motion` disables the framer-motion transitions and all
      four infinite CSS animations.
- [ ] Inputs have `autoComplete`; form errors have `role="alert"`.
- [ ] Per-route `document.title`; description, OG, Twitter card, favicon and
      `theme-color` present.
- [ ] Bundle sizes measured, recorded, and enforced by something `verify:full`
      runs.
- [ ] The hardcoded `"DF"` / `"Demo Founder"` in the chrome read the session.
- [ ] `pnpm verify:full` passes.
- [ ] CHANGELOG.md records the user-visible changes.
