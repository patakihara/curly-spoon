# `16c-7-W` — migrate `apps/web/src/styles/app.css` off `--m3-*`

**Written 2026-08-21, not yet dispatched.** Base on `main` at or after `d809fd1`.

**Web-only, and that is the parity rule applied rather than skipped.** Android finished the
equivalent substrate work in `16b-2-A` / `16f-A-1` / `16f-A-2`: `apps/android` has zero
`dynamicColor`/`dynamicLightColorScheme` usage — the only mention is a comment recording that Sonora
_replaced_ wallpaper-derived Material You — and every `MaterialTheme.colorScheme.*` read resolves
through the Sonora-populated scheme. So this wave takes **no `-A` pair**. **A `-P` is still owed**
once web catches up: `16c-1-P` and `16c-2-P` were both folded forward and no later `-P` closed that
loop.

## Why this is its own wave, and bigger than the docs said

`app.css` is `apps/web`'s global stylesheet and holds roughly **85 live `var(--m3-…)` reads** — more
than any single `packages/ui` wave has handled. It has never been named as a wave; it was only noted
as existing and untracked, because the "remaining consumers" list counted `packages/ui` components
only.

**The existing description understates it.** A note in `ROADMAP.md` calls this "onboarding/settings
page-level CSS". The real selector list spans **Now Playing, the mini player, the nav-rail search,
the queue view, sleep timer, lyrics, chapter list, bookmarks, the card grid and error surfaces** —
app-wide chrome. **Re-measure before scoping; do not scope against that sentence.**

## Scope

- **You own `apps/web/src/styles/app.css`** and its test `apps/web/src/styles/layoutOverflow.test.ts`,
  plus any new test file you add under `apps/web/src/styles/`.
- **Do not touch** `packages/**` (the primitives are done — `16c-6-W` finished the last seven),
  `apps/server/**`, `apps/android/**`, `docs/**`, workflows, manifests, lockfiles.
- **It is one file, so it cannot be split by file boundary.** If it will not fit in well under ~150
  turns, split by **selector group** across two sequential waves — never two concurrent agents, which
  would conflict on every hunk.

## Leave these alone — they are deliberate, documented decisions

1. **`--m3-touch-target-min`** (5 call sites here) — a permanent app-wide accessibility floor with no
   Sonora equivalent.
2. **The `.m3-type-*` typography-role scale** — every 16c wave has deferred it; closing it is
   `16c-8`, a separate cross-cutting wave. Leave every occurrence.
3. **Any `--m3-surface-container*` kept with a comment explaining why**, e.g. a floating surface that
   must read one step brighter than arbitrary content beneath it (the `Menu.css` precedent). If you
   add such a deferral, say so explicitly in the report and in the file.

## Read the design authority before substituting

`docs/design/SONORA.md` is the design authority. **Read `docs/design/sonora/primitives/README.md`
first** — Sonora's own components reference `--m3-*` names that mean something _different_ in this
app, and that README carries the substitution table.

Follow the idioms `16c-6-W` established rather than inventing new ones: fallbacks in the established
form (`var(--surface-card, rgb(20, 20, 20))`, `var(--surface-fg, rgb(225, 225, 225))`), and
`--radius-*` / `--shadow-*` for shape and elevation.

## The three failure modes this wave must actively guard against

**1. A component can render completely unstyled and pass every test.** Playwright asserts on testids
and text, never computed styles. So run this mechanical check and report its output: extract every
custom property your diff **introduces**, and confirm each is defined in
`packages/ui/src/styles/sonora-tokens.css` or `sonora-theme.css`. An introduced-but-undefined token
is a bug — fix it, never ship it.

**2. `layoutOverflow.test.ts` parses this file as text** and pins specific selectors' rule bodies.
Playwright cannot see that class of breakage. **`pnpm vitest run apps/web` is mandatory**, not
optional, and if you change a pinned rule you must update the pin deliberately and say so.

**3. A shared class's `selected`/`active` state is a call-site question.** `16c-6-W` shipped
`ListItem`'s selected row as a solid accent fill; it was mechanically correct and wrong, because
`16e-nowplaying` had **already overridden that exact class** in this very file for the queue view,
and `ChapterList` inherited the loud treatment with no override. **This file contains those
overrides.** Before changing any `--selected` / `--active` / `--current` rule here, check what the
corresponding `packages/ui` component now paints, and make the two agree — or state why they should
differ.

**Contrast, and one pairing to avoid.** `--accent-contrast` on `--accent` fails WCAG AA at the
shipped default (4.23:1 at violet; nine of seventeen presets fail even the 3:1 UI floor). It is an
open question with Sofia (queue `c9887cb`). **Do not introduce new text-on-accent-fill pairings in
this wave.** Where a rule needs a selected/active surface, prefer a tonal `--surface-card` step with
inherited `--surface-fg`, which is what both the queue view and `ListItem` now use.

## Before you finish

```
pnpm format
pnpm typecheck
pnpm lint
pnpm vitest run apps/web        # mandatory — see failure mode 2
pnpm vitest run packages/ui
```

**Do not run Playwright** — one hardcoded port, one stateful single-tenant BFF; the orchestrator runs
it from the main checkout.

**Commit before running anything long**, never background a run and wait for a notification, never
push, never commit to `main`, and **never make an `Agent` call of any kind**. Commit on your worktree
branch; the orchestrator rebases onto the tip and `--ff-only` merges.

First action in your worktree: `git reset --hard <current main tip sha>`, verified with `git log -1`,
then `pnpm install --frozen-lockfile` once. Never `pnpm add`.

## Report

1. Branch, sha, `git status --short` (clean).
2. **A re-measured count**: live `var(--m3-…)` reads before and after, and what each survivor is
   (which of the three deliberate categories, or a new deferral with its reasoning).
3. The introduced-token check — every property introduced, and its definition site.
4. Every `--selected`/`--active` rule you touched, and whether it now agrees with its `packages/ui`
   counterpart.
5. `pnpm vitest run apps/web` result, and any `layoutOverflow.test.ts` pin you changed, with why.
6. Anything contradicting this spec — say it plainly. Specs here have been wrong before, and this
   project treats a doc claiming a gap and a doc claiming parity as equally untrustworthy.

## Orchestrator's own follow-up after merging

Run the full `--project=app` Playwright suite **and** `ui-desktop`/`ui-mobile` at `--workers=2`, and
**wait for CI** — a green local run is not evidence about a CSS-delivery change. `14a-2` passed
188/188 locally and failed twice on CI on a layout-stability assertion, and that history is the
reason this paragraph exists.
