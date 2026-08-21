# Backdrop shell — authoring spec

Rebuild Sonora's desktop/mobile frame as a **real Material backdrop**. The current shell already
*looks* like one and isn't, and the gap between the two is the whole task.

**Read `docs/SPEC.md` first.** Its "Hard rules", "House idiom" and "Tokens you will need" sections
apply unchanged and are not repeated here.

## The bounding constraints — read these before anything else

1. **Add new components. Do not modify a single existing one.** Not `AppShell`, not `TopAppBar`,
   not `ContentPane`, not `SideSheet`, not `NavRail`. They stay exactly as they are and keep
   working. The new shell lives beside them.
2. **Do not alter any existing mockup or card.** `ui_kits/desktop/index.html`,
   `ui_kits/mobile/index.html` and every existing `*.card.html` are untouchable. You add *new*
   cards showing example configurations.
3. **No change to page or view logic.** Scroll-position preservation per view, detail pages,
   sub-tab state — all of that must keep working exactly as it does. You are changing which
   surface things sit on, not how they behave.
4. **Do not affect the mobile Now Playing view.** `NowPlaying`, `PlayerSheet`, `NowPlayingPage`,
   `LyricsPage`, `QueuePage` are out of scope and must not be touched or wrapped.
5. Do not edit generated files: `_ds_manifest.json`, `_adherence.oxlintrc.json`, `export/**`.
   They are regenerated afterwards.

---

## What the Material backdrop actually specifies

From <https://m2.material.io/components/backdrop>, quoted:

- *"A backdrop is composed of two surfaces: a back layer and a front layer. The back layer displays
  actions and context, and these control and inform the front layer's content."*
- *"The back layer appears at the lowest elevation (0dp) in an app, filling the entire background.
  It holds actionable content that is relevant to the front layer."* Its components are
  *"navigation, steppers, text fields, selection controls"*.
- *"The front layer always appears in front of the back layer. It is displayed at full width and
  holds primary content."* Elevation **1dp**.
- *"The subheader is a fixed area on the front layer that contains a title and optional
  iconography."* — *"The subheader can be fixed in place, while content below it on the front layer
  scrolls independently."* — *"Both the subheader (A) and scrollable content area (B) on the front
  layer have an elevation of 1dp."*
- *"When using a subheader, content on the front layer can retain its scroll position"* — which is
  exactly why constraint 3 above is satisfiable.
- *"Don't let front layer content extend beyond its container, overlapping the back layer."*
- Shape: *"The backdrop can only be shaped on the top left and top right corners."* Mobile spec:
  rounded **16dp**, front layer elevation 1dp, back layer 0dp.

The spec says nothing about unrounding the front layer on scroll, and nothing about a second
surface between the layers. Both of those are things the current implementation invented.

## What the current shell does, and why it is not a backdrop

Read these three files before writing anything — they are the thing being replaced:

- `components/layout/AppShell.jsx` — rail, then a `--surface-bg-alt` column of `bar` + `ContentPane`, then `sheet`, with `player` docked below.
- `components/navigation/TopAppBar.jsx` — **two** rows. Row 1 is the `--surface-bg-alt` strip (title, search morph). Row 2 is the controls row, and its own comment says it is *"the page surface reaching up behind the bar"*: `background: var(--surface-bg)`, `border-radius: var(--radius-lg) var(--radius-lg) 0 0`.
- `components/layout/ContentPane.jsx` — `--surface-bg`, top corners `calc(var(--radius-lg) * (1 - p))` where `p` is scroll progress, plus a hairline that fades in with `p`.

Four concrete faults, all visible in `.probe/current-shell.png`:

1. **The secondary header is on the wrong layer.** Tabs and the filter `ButtonGroup` are DOM
   children of the app bar, but painted to look like the top of the content. In a backdrop they
   belong to the front layer, as its subheader.
2. **Two surfaces both claim to be the top of the content.** The controls row rounds its top
   corners, and `ContentPane` immediately below rounds its top corners again — a visible notch at
   the left edge where the two curves meet.
3. **The front layer unrounds on scroll.** Corners animate to square as you scroll. A backdrop's
   front layer keeps its shape; it is a persistent surface, not a sheet that docks.
4. **There is no elevation between the layers** — a hairline stands in for the 1dp step.

---

## Build this

Four new components in `components/layout/`, each `.jsx` + `.d.ts`.

### `BackdropShell.jsx`

The frame. Deliberately mirrors `AppShell`'s prop names where the meaning is the same, so a screen
ports by swapping the component.

```ts
back?: ReactNode        // back-layer content: heading row + contextual controls
rail?: ReactNode        // a NavRail. Sits at BACK-LAYER level on desktop. Omit on mobile.
children?: ReactNode     // front-layer content
subheader?: ReactNode    // the front layer's fixed subheader
sheet?: ReactNode
sheetOpen?: boolean
sheetLayer?: 'front' | 'behind'   // desktop side-panel alternative. Default 'front'
player?: ReactNode       // docked across the full width beneath everything
contentMinWidth?: string
scroll?: boolean
scrollKey?: string | number
onProgress?: (p: number) => void
theme?: string
platform?: 'desktop' | 'mobile'
```

- Back layer is `--surface-bg-alt` and **fills the entire background** — the rail is part of it, not
  a sibling column beside it. On desktop the rail must read as continuous with the back layer.
- Front layer is `--surface-bg`, inset from the back layer, at the elevation step below.
- The player stays docked full width across the bottom, as now.

### `FrontLayer.jsx`

The 1dp surface holding primary content.

```ts
children?: ReactNode
subheader?: ReactNode
scroll?: boolean
scrollKey?: string | number
onProgress?: (p: number) => void
squareLeft?: boolean     // only for the sheetLayer='front' case, where a panel abuts it
squareRight?: boolean
platform?: 'desktop' | 'mobile'
```

- **Top corners are `--radius-lg` and never unround.** No scroll-linked radius. This is the single
  most important behavioural difference from `ContentPane`.
- Casts a **slight** shadow onto the back layer — the 1dp step. Use `--shadow-sm` or `--shadow-xs`;
  it should read as a lift, not a drop shadow. Nothing heavier.
- Owns the scrolling and the per-view scroll memory. **Port `ContentPane`'s scroll logic across
  as-is** — the `saved`/`lastKey` ref bookkeeping, the `useLayoutEffect` restore with the
  `requestAnimationFrame` retry, the `pageScroller()` lookup for `scroll={false}`, and the
  `onScrollCapture` guard that ignores horizontal shelves. That code exists because each piece
  fixed a real bug; re-deriving it will reintroduce them. Copy it, keep its comments.

### `FrontLayerHeader.jsx`

The subheader — *"a fixed area on the front layer"*, same 1dp surface as the content below it.

```ts
children?: ReactNode        // a TabBar, a ButtonGroup, a SearchField, whatever the screen needs
tabs?: boolean              // the content is a tab bar, which draws its own indicator
progress?: number           // 0–1 scroll progress from FrontLayer
platform?: 'desktop' | 'mobile'
```

**The divider rule, exactly:**

- When `tabs` is **false**, a hairline fades in with scroll progress along the subheader's bottom
  edge — the same scroll-linked affordance `ContentPane` has today.
- When `tabs` is **true**, no hairline. A tab bar already draws an underline indicator, and two
  horizontal rules stacked is noise.
- **The divider must not span the gutters.** It is inset to the content measure — left and right
  by the page's horizontal padding — so it reads as belonging to the content column rather than
  cutting the surface in half. This is the opposite of `ContentPane`'s current full-bleed hairline.

### `BackLayer.jsx`

The 0dp surface carrying headings and contextual controls.

```ts
title?: string
leading?: ReactNode
trailing?: ReactNode
controls?: ReactNode    // contextual controls that BELONG on the back layer (see below)
platform?: 'desktop' | 'mobile'
```

- `--surface-bg-alt`, no rounding, no elevation.
- Judgement call you must make explicitly and record in your report: the M2 back layer holds
  *"navigation, steppers, text fields, selection controls"* that **control the front layer**. A
  filter `ButtonGroup` arguably qualifies. But Sofia's instruction is that the secondary header
  moves to the front layer. Resolve it this way: **anything that scrolls away with the content or
  names a section of it belongs to the subheader; anything that reconfigures what the front layer
  is showing may sit on the back layer.** Support both — `BackLayer.controls` exists for the latter
  — and demonstrate both in a card.

---

## The desktop side panel — build both alternatives

`sheetLayer` selects between them. Both must work and both must be shown.

### `sheetLayer="front"` (default) — panel in front of the front layer

Looks as the shell does today: the panel is a full-height column to the right of the front layer.
A divider between the panel and the front layer, and a divider between the panel and the back
layer. The front layer squares its right corner where the panel abuts it.

### `sheetLayer="behind"` — panel behind the front layer

- **Both front-layer top corners stay rounded.** Nothing squares.
- The front layer casts its shadow **onto the panel** — the same slight lift, now landing on a
  surface instead of on the back layer. This is the alternative's whole point: the depth ordering
  becomes visible.
- The panel's **horizontal divider stops spanning the gutter** — inset, like the subheader's.
- The panel's **vertical divider appears only in the header** — not down the panel's full height —
  and does **not** span the top/bottom margin or padding. A short rule in the header band only.

---

## Cards

Three new cards, in `components/layout/`. Same rules as `docs/SPEC.md`'s Cards section: copy
`components/core/buttons.card.html` literally, `@dsCard` first line, pinned CDN scripts with
integrity unchanged, dark + light `Themed()` wrapper, realistic self-hosted-library content
(reuse Driftwave / Halcyon Bloom / Static & Signal / The Glass Archivist / Rosa Elin).

| File | name | Must show |
| --- | --- | --- |
| `backdrop-anatomy.card.html` | Backdrop Anatomy | Back layer, front layer and subheader labelled, with the 1dp step and its shadow visible; the front layer's permanently-rounded top corners; the rail continuous with the back layer |
| `backdrop-subheader.card.html` | Front Layer Subheader | A subheader carrying tabs (no divider) beside one carrying a connected `ButtonGroup` (scroll-linked divider, inset from the gutters). Show the divider both at rest and at scroll — a `progress` prop makes that a static demo |
| `backdrop-side-panel.card.html` | Side Panel — In Front vs Behind | The two `sheetLayer` alternatives side by side, with the corner, divider and shadow differences legible |

A card is a static demo — where a state (scrolled, panel open) is what you need to show, pass the
prop directly rather than requiring interaction.

---

## Verifying — this is not optional

The mirror now has 41 components bundled locally and the shell renders. Use it.

```
python3 docs/check_tokens.py      # every var() resolves; CoverArt parents are containing blocks
node docs/build_bundle.js         # transpiles every component — a FAIL means invalid JSX
node docs/render_cards.mjs        # loads every card in Chromium: page errors, console errors,
                                  # empty roots, unresolved namespace names. Must end "N/N".
```

`.probe/current-shell.html` renders the **existing** shell; `.probe/current-shell.png` is what it
looks like. Make an equivalent probe for the new one and **compare the two screenshots yourself**
before reporting. Every textual check passed on a previous wave while the flagship component was
rendering as a solid block — reading the code is not evidence about a layout change.

Two things the harness knows that you should not rediscover:
- `CoverArt` fills its parent with `position:absolute;inset:0`; any container holding it needs
  `position:relative`.
- A `{/* comment */}` is only valid in JSX *children* position. As the first thing inside a
  parenthesised expression it is a syntax error — use a plain `/* */`.

## Report

Under 400 words: the 8 new file paths plus 3 cards; the exact final line of the render run; how you
resolved the BackLayer-vs-subheader judgement call; and anything in Sofia's description you could
not satisfy, stated plainly rather than glossed. Do not paste file contents.
