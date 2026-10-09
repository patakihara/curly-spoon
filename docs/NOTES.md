# Session notes — Backdrop navigation mockup

## Files
- `api/api.d.ts` — the contract (v15.0.0), language-neutral source of truth · `api/invariants.js` + `Invariants.dc.html` — 105 behavioural rules, plus the web platform check (lint)
- `core/` — the engine: `navigation.js` (state + intents), `layout.js` (state + design → what to draw / how it moves), `interaction.js` (interaction states; `playerAction` → player commands + queued event), `player.js` (optional playback)
- `app/` — `app.json` (AppConfig), `texts/<locale>.json` (en, fi, de, pt, he), `load-app.js`, `fake-backend.js` (mock catalog + fixtures; generated filler for scroll testing)
- `design/` — `design.json` (manifest), `tokens.json`, `choreography.json`, `motions/<kind>.{json,md}`, `components/<id>/{.json,.md,.d.ts}`, `load.js`, `build.js` (→ `generated/web/tokens.css`, `generated/android/DesignTokens.kt`, each `.d.ts`), `overrides.js` (Specs Editor patches)
- `platforms/web.json` — components + motion kinds the web shell implements · `platforms/web/motions.js` — every motion player (fade through, shared element, expand surface, enter app, drop into peek, state-driven CSS transitions, scroll-driven rule) · `platforms/lint-web.js` — flags look-and-feel literals and motion code in the shell
- `Backdrop Nav Skeleton.dc.html` — the web shell: only arranges component instances and says when motions run; no values of its own
- Component DCs (one per design component): FrontLayer, AppBarPage, NowPlayingSheet, UpNextSheet, PeekCard, DededeLayer, AccountLayer, IconButton, Button, Chip, Tab, NavItem, ListItem, ListRow, GridCard, ContentBlock, Symbol, Label, Logo, Title, PanelRow, Morph, Fab, DetailHeader, NowPlaying, TabBar, FilterChips, SearchField, Dropdown, RangeField, SuggestionRow, Placeholder, StaleBanner, EmptyState, Carousel, Menu, Dialog, Snackbar, DrawerItem, Artwork, TrackInfo, SeekBar, Row, Bar, EdgeHandle, NavBar, NavRail, Drawer, Scrim, SignIn, Splash, AppBarSheet. Interactive ones share `interactive.js`.
- `Components.dc.html` (every component × state, from design) · `Specs Editor.dc.html` (edit design values live) · `Backdrop Nav Skeleton v1.dc.html` (frozen pre-model version)

## Vocabulary
- **Deck** — nav bar / rail destination: Browse, Library, Search. Each keeps its own stack.
- **Layer** — surfaces outside the decks: **Now playing** (nowPlaying; sheet with peek = mini player), **Settings** (Dedede; circular reveal), **Menu** (drawer; on wide layouts the rail expands), **Account** (fullscreen).
- **Back layer / front layer** — Material backdrop. Back layer = named regions (header, actions, basicAction, panel); front layer = header + content. Back layer **concealed** / **expanded**; config `collapse`: partial | full.
- **Detail pages** — backdrop pages (artist: back header with detail info, play buttons below, filters) and app-bar pages (album: top row on back-layer colours + sheet with album info and a bottom row: search + play button).

## Navigation behaviour (decided)
- Decks keep independent stacks; switching never touches others; Search resets on opening. New pages push onto the active deck.
- Back: Android back and browser back behave the same on touch; Now playing pops its own pages but is never in browser history; Settings is. The in-app ← / ✕ is the `up` intent.
- Scroll is kept per page and resets when content changes. Collapse-first (15.0): the first scroll collapses a page's bar (the page grows), then the content scrolls; back up, the content returns first, then the bar expands — no extra scroll room needed.
- Local search: 🔍 morphs into a field (also on scroll); ✕ inside it clears and closes it (`searchClosed` keeps it shut while scrolled until 🔍 or scroll-to-top).
- Play / Next / Last buttons (album bottom row, artist actions region) queue tracks; they no longer open the Now playing sheet.

## Layout / presentation
- Devices: Phone 360 (touch), Tablet 720 (touch), Window 720 (pointer), Desktop 1100 (pointer).
- Compact: bottom nav bar; Now playing peek above it → bottom sheet. Wide: navigation rail (Menu expands it); Now playing = side sheet (beside / modal / auto-hiding edge) with a floating peek card.
- Settings expands circularly from its button; covers nav bar / rail, never a beside sheet.
- Front headers 48px (no FABs anywhere now). App bar page: top row 64, sheet from 204 down to 144 on scroll, shadow on its bottom edge.

## Motion (all in design: choreography + motions; played by platforms/web/motions.js)
- Backdrop push / pop (expandFromItem): content fades through; the shared image escapes any clip, then arcs into place (and back on pop); on push the new header, actions and filters slide in after it, staggered.
- App-bar push / pop (expandSurface): the front-coloured surface grows from the front layer into the page's sheet (not the top row); the page fades in. Popping to another deck collapses into that deck's front layer.
- Deck switch: fade through. Layers / sheet / drawer / rail / reveal: state-driven transitions from their choreography rules.
- Queue (event queued → dropIntoPeek): the item's image forms over the original, shrinks onto its top corner, slides, falls into the peek (onto its image · beside it then tucked behind · after its last control, which slide aside and back with a cover + shadow), the peek bounces.
- User scroll moves bars directly (no transition); scroll restores after a page change keep that change's motion.

## API design principles (agreed)
- Separate **config** (fixed), **state**, and **policy** ("metastate": preserve vs reset, defaults, scope) — policy mirrors state shape.
- Typed **input state**: FilterState / TabState / SearchState.
- Content comes from **data** via `dataSource` refs (`ContentData`, `ItemData`); anything may be data but nothing is forced to be (Bororo main filters are config).
- BackdropPageConfig nests BackLayerConfig + FrontLayerConfig; AppBarPageConfig separate. Header properties independent of content type.
- Back layer has `layouts.concealed` / `layouts.expanded` over regions; regions in both stay put, others fade (only animate if they moved).
- Layers: LayerPresentation includes content; layer pages are a fixed set, content partly from data.
- `fromRect` is view-only (motion), not model state.
- Contract v1.1.0 adds: versioning (semver, majors must match), content states (loading/empty/error/offline + retry), focus (trap + restore), single window everywhere.

## Architecture discussion
- Layers: contract (`api.d.ts`) → model (pure, no UI) → presentation (pure geometry/visual values) → design (tokens, components, choreography) → per-platform view/motion.
- Portable to any language: re-implement model against the contract; invariants are the conformance test (portable via JSON fixtures / generated tests).
- Considered Rust core (UniFFI → Kotlin, WASM → web, native desktop). Decision: keep `api.d.ts` as the contract source; Rust is optional later for a shared core / fast desktop; UI stays native per platform. Audio playback is platform-side; player model is portable.
- Flutter rejected (text selection, web IME).
- Real project: Kotlin + web, design system → design → code pipeline. Flexible parts (components, layouts, visuals, motion) live in specs/presentation, not the contract.
- Backend: real backend uses Zod. Plan: keep Zod backend-only; export OpenAPI/JSON Schema; generate client types (Kotlin/TS/Rust). Client-side contract stays `api.d.ts`; optional JSON Schema validation for config/specs.

## Logo (design only, no contract change)
- Geometry from logo.fig: tokens `size.logo.unit` 24, `size.logo.width/height` 237 × 365, `radius.logoBar` 12; visual `bars` = rest heights in units `2 5 13 7 3 11 2`.
- Motion kind `levels` (design/motions): level-meter loop while `playing`; logo uses it on key `levels` (trigger loop, ms = motion.duration.medium, 1–13 units). Reduced → instant. Figma's Easing variable didn't import; uses motion.easing.standard.

## v14.0.0 / v13.0.0 (approved items 1–12)
- Header API was a shape (`Bar`), not a component; slot rules were hard-coded per region name. Now roles carry slot contracts and every component-like part is a role-typed ref (bars, peeks, layouts, FAB, content states, splash, overlays).
- Caret back in the front header (mandatory, `last: disclosure`); back header end = user button (disabled for now); hamburger (edge variant, clipped) beside the logo opens the Menu drawer.
- Player reachable from config (closes the old "logo playing" blocker too: `{ player: 'status', equals: 'playing' }` can drive `logo.playing` — not wired yet).
- Now playing = app-bar page with body + inner sheet (user's pick); Up next rows play their index; Lyrics / Related from the fake backend; ⋮ opens Recently played / Saved.
- FAB play opens Now playing via choreography `layerOpened nowPlaying → containerMorph`.
- Item 10 also covers backdrop pages: person header region `expandedHeight` 216 with a `detailHeader` in the bar's `expanded` slot.
- Fixes after review (no contract change): front header 48 / app bar 56; a header with a FAB grows by `size.fab.edge` (20) at its bottom only. FAB circular, centred on that edge under the search icon, drawn inside the page's content layer so it moves / fades with its page. Back header draws its `expanded` slot (person: art, name, subtitle, counts), collapsing with scroll; the bar title fades in as it collapses.
- 14.0.0 (approved): caret on the start side (SlotContract `first`). Front header 48px (back from 40 at the user's request; caret / search / view switch md); FAB bars +20 at the bottom only; FAB circular, centred under the last end item; peek 48; hamburger half off the edge (logo unmoved); detail info stays when the back layer expands; morph animates icon ⇄ field (container width / radius / fill, field fades in after the split); scroll-driven moves have no transitions; symbol morph only when the same placement changes icon.
- Tapping the active tab toggles (config, every tabbed page: back.expanded on { paramReselect: <tab param> } → toggle — Library tab, person section; Now playing sheet on tab). The person page had no reselect reaction before — it did nothing.
- Wide: logo + hamburger at the top of the rail, Settings / Account at its bottom (config: navigation.wide slots top / bottom; navRail declares them). Back-header hamburger is compact-only. Menus (⋮) on wide open as an anchored popup under their button; compact keeps the bottom sheet. Carousel entries / content blocks padded 10 with radius.md (no gaps; row starts at 16 − padding). Collection pages (albums, books, shows) draw the app bar's expanded slot (detailHeader) instead of the shell's own block; the title fades in and the FAB rides its bottom edge, pinning to the bar when collapsed.
- 14.1.0 (approved): the rail hamburger expands the rail (menu layer, wide 'rail'): one-line pills (icon + label), not modal (content pushed aside), back / hamburger collapse it. Logo stays in the back header on wide too.
- Sweep fixes: local search field spans the bar (title and other end items give way; placeholder readable on light bars); app-bar search spans too; front header ink fills the header (no press scale on listItem); front layer is its own stacking context (its overlays never show through app-bar pages); text-id leaks in aria labels fixed (nav items, clear search, next track); search Enter submits and conceals the back layer (verified).
- Rail review (tablet): collapsed bottom items are centred 48px circles (were left-clipped pills); expanded = pills with labels; floating peek: its controls painted above the Now playing sheet (z-index escaped the card) — fixed by isolating the card; it stays visible as configured (persistsWhenOpen). Filter panel headers mono, uppercase.
- NEXT (user, top priority): nothing in the mockup may be drawn inline — every piece becomes a component DC (rule in CLAUDE.md). Done: IconButton, Button, Chip, Tab, NavItem, ListItem, ListRow, GridCard, ContentBlock, Logo, PanelRow, Symbol, Label, Morph, Fab, DetailHeader (variants shape + layout), Title (variant size sm / lg), GroupHeader, AlphaIndex, NowPlaying (peek, floating card and the bar above an expanded queue are one 48px component; peekCard visuals for the card surface), TabBar, FilterChips (+ choiceChips; `wrap` in panels), SearchField, Dropdown, RangeField, SuggestionRow (shell switched; their sizes / colours moved to design visuals, new tokens color.backLayerDivider / backLayerFill; dropdown / rangeField border now color.chipOutline as drawn). Then (shell switched, values moved to design visuals / tokens): Placeholder, StaleBanner, EmptyState (+ errorState variant), Carousel, Menu, Dialog, Snackbar, DrawerItem, Artwork, TrackInfo, SeekBar, Row, Bar (header / frontHeader / appBar page | layer), EdgeHandle, NavBar, NavRail, Drawer (new design component `drawer`), Scrim, SignIn (signInPage), Splash. Surfaces (front / back layer, sheets, fullscreen layers) take fills, scrims and shadows from their design visuals; mini-player and peek controls come from the layer presentation's peek header slots (config) instead of shell code. The never-shown tracking header was removed. Components page previews every one of them (plus the item placeholder forms). generated/ rebuilt; rules 102 / 102. Fix: full-size Scrim mounts swallowed every click (the mount box covers the screen even while the scrim is off) — each Scrim now sits in a pointer-events:none wrapper; the scrim turns events back on only when shown. Left in the shell by design: the side panel (debug harness, not app UI) and mock artwork colours (fake backend).
- RULE (user): no mockup-only changes. (Done in this pass — the list below is kept for history.) Values that were hard-coded in the web shell:
  - Now playing sheet: white fill, shadow, handle padding 10 / gap 6, tab inset 16, tab height 48, queue row 48 (thumb 40, pad 4), queue current-row fill, mini player (64 high, art 44) → design components (bottomSheet / tabBar / queueRow / nowPlaying) + config (mini-player controls as refs).
  - Rail: collapsed item 48 circle, expanded pill 48 / padding 12 / gap 12, label size → navRail / drawerItem visuals.
  - Subtitle / filter-header mono font per place → read font.subtitle token.
  - Menu popup sizes, carousel heading inset, detail header fonts, alpha index, FAB size / edge offsets, front-header title font, app-bar title font.
- Screenshot caveat: the DOM-rerender screenshots don't draw masks (logo) and mis-stack some z-indexed children; check in the browser before "fixing" those.
- Components page rebuilt: real DC instances per forced state for interactive components; drawn previews for every other component (grouped). Heavy (≈100 instances) — consider lazy sections.
- Open (mockup / platform):
  - Shared image: open and back on backdrop pages (both directions); app-bar pages fly on open only. Flight timing from the choreography (sharedMs, sharedEasing). FAB → Now playing container morph still not drawn.
  - Backdrop push / pop (expandFromItem, design): no growing surface any more — old content (back + front) fades out, the page opens, new content fades in (ms · split · easingOut / easingIn · scaleIn); the front layer moves to its new top meanwhile; the image flies card → detail on push and detail → card on pop (sharedMs · sharedEasing). The motion id keeps its old name.
  - Layer mistakes (platform code holding design / config values): carousel heading inset 16, rail item padding 12 / pill 48, menu popup row 44 / font 14, detailHeader title / meta font sizes, alpha index sizes, FAB 40 / edge offsets, front-header title font 14. These belong in design visuals (tokens) and should move there.
  - Person page: expandedHeight 272 (config) — the info needed room; detailHeader artSize 96, gap 8, padBottom 24 (design).
  - Now playing reviewed: no divider under its app bar; tab labels one line; tapping the current tab toggles the sheet (config: sheet.expanded on paramReselect tab → toggle; core emits expandedChanged for sheet reactions); expanded sheet leaves a mini player (art, title, play / next) above it; empty Up next says "Nothing playing". Album title vs subtitle overlap seen in screenshots: measured in the browser — no overlap (title 159–183, subtitle 187–201); a screenshot-tool wrap artifact. Shared image on app-bar opens measures the laid-out target and flies with transforms (was choppy).
  - Subtitles everywhere are monospace (token font.subtitle; not nav labels): list rows, grid cards, content blocks, carousel headings, detail header subtitle + meta, app-bar detail, Now playing (page + mini + peek), account. The shell still hard-codes the family per place — to read from the token.
  - Now playing sheet: white, same shadow as the other sheets, peek 69 (handle + tabs, config), anchored to the bottom; tabs inset 16 with one divider (selected underline overlaps it); queue rows without dividers; with the sheet open the app bar collapses and the mini player sits at the top.
  - Fixed: transitions stayed off after a scroll (fade-through and front-layer move looked gone); detail info wasn't part of the back-layer fade.
  - Up next drag-to-reorder: `move` intent exists; no drag UI / emitting path (needs a role event — propose).
  - symbolMorph runs in IconButton on icon change; NavItem / drawer icons don't morph yet.
  - Components page: previews for the new components (symbol, morph, fab, dropdown, rangeField, seekBar, artwork, trackInfo, row, queueRow, drawerItem, frontHeader) and the older ones still missing.
  - api.rs: still 11.0.1 — regenerate for 15.0.0.
  - Logo looks like a white block only in DOM-rerender screenshots (masks not drawn); the mask and PNG load fine in the browser — not a bug.
  - Wide layouts not reviewed after the change.

## v12.0.0 (built overnight, approved)
- Item 4 fixed: page templates (shelf, person, collection) in app.json; fake backend sends only data (fields: title, subtitle, image, domain, track / tracks, collectionCount / trackCount, entries). Recursion 1–3 kept (Box in Rust; cheap).
- Browse: carousels (shelves) in a scroller; tapping a shelf opens it as a backdrop child (sort chips, local search, grid). Hosts removed (no data for them); podcasts' Show options drop people.
- Library: re-tapping the active tab expands the back layer (paramReselect). Local search: an icon in the front header / app bars, a thin squarish field once the content scrolls or after a tap; bound to the page's `find` param; the data source filters.
- Open (not done tonight):
  - Regroup api.d.ts top-down (approved) — still dependency-ordered with interleaved sections.
  - Components page: previews for every registered component (carousel, localSearch, menu, nowPlaying, suggestionRow, choiceChips, layouts…).
  - Component DCs share interaction code by copy (IconButton, Button, Chip, Tab, NavItem, ListItem, ListRow, GridCard, ContentBlock each have base()/ripple). Plan: one helper (interactive.js) loaded in helmet; each DC delegates.
  - Dialog buttons: ix passes component 'button' + variant; hover looked missing — check the dialog surface's state-layer role.
  - Shelf pages draw people square (one presentation per shelf); api.rs is a 11.0.1 snapshot (regenerate).
  - Carousel entries aren't individually tappable (the carousel opens its shelf).

## v11.0.1
- api.d.ts is dependency-ordered (define before use). Cycles are inherent (recursive conditions / values; pages ↔ items ↔ intents ↔ actions): one forward reference each, marked 'recursive'. The §N sections now interleave.
- Open (approved, with 12.0): regroup api.d.ts so sections read top-down (shared shapes first).
- Decision: api.d.ts stays the readable source of truth; Rust (api.rs) is a mechanical rendering of it — the boilerplate is generated, not written. Dart rejected for the contract (no untagged unions / flatten; JSON needs code generation).
- api/api.rs: Rust rendering of api.d.ts (generated, for comparison only; not built). Recursion there = Box on the recursive fields — cheap; reason to keep conditions / prop / visual recursion.
- 12.0 proposal: items name page templates instead of carrying page configs (breaks the ItemData → PageSpec → … → OpenIntent cycle); keep recursion 1–3.

## v11.0.0 decisions
- What a component shows (title, subtitle, image) and does when the item opens nothing (play) is component business: ItemData is { id, opens, …fields }, presentations bind $item.*.
- Behaviour vs motion: axis = direction only; ParamSpec.motion names the choreography rule. Config picks a name, design owns the look.
- nowPlaying: platform component (like trackedTitle), not a derived value.
- api.d.ts style: no anonymous object types in fields; unions of named members.

## App restructure (no contract change)
- Decks: browse (one-of filter f: all / music / audiobooks / podcasts + sort in the panel; generic scroller), library (tab: music / audiobooks / podcasts; picking a tab expands the back layer via policy on; panel: show (people / collections / tracks, labels per tab), genre (choices), year / released (per tab) — options from data sources keyed by tab, all scoped per tab; kind picks the presentation), search (q + suggestions repeat in the panel; list / grid).
- Mock catalog in app/fake-backend.js; people open backdrop profile pages (sections: collections / tracks / similar), collections open app-bar pages (tracks, ⋮ menu: play, add to queue, copy link).
- Design: choiceChips (one-of chips), suggestionRow, menu (overlay), gridCard shape variant (square / circle via artRadius). Item DCs draw artwork from the item id (no images in ItemData).
- Mockup: chips / chip groups / suggestions in panels; menu overlay; copyLink shell action (clipboard + snackbar); Nonono peek shows the playing track (shell); app-bar overlay shows the page's real content; placeholder stripes and fake toggles removed.
- Done in 11.0: param motions by name (browse f / sort, library kind / genre / year: swap = fade through; tabs and profile sections: slide); items bind $item fields; tracks play on tap; Nonono peek title = nowPlaying.

## v10.0.0 decisions
- URL = one destination (gate > recorded layer > deck). Routes: bororo / libibi / serere, dedede, sign-in / welcome.
- Slugs: lowercase; runs of non-letter/digit/'.' → '-'. Item ids like 'Bororo — Entry 1' → 'bororo-entry-1'. Sibling slugs must be unique (rule).
- Query: only the top page's url params; lower pages' params are lost on reload (accepted). Text values lowercase, spaces '+'.
- Samples: /bororo/bororo-entry-1 · /serere?q=hello+world · /libibi?tab=b · /dedede/fliboo · /sign-in.

## v9.0.0 decisions
- List / grid / generic were engine kinds; now presentation: a view param + presentations (layout + item components). Libibi / Serere / list-or-grid child pages: `view` (list | grid, data: false; Libibi per tab). Bororo and generic pages: a single `default` scroller.
- Responsive grid: gridLayout visuals (150px min on compact, 200px on wide, ≤ 6 columns, 2px gap). Phone shows 2 columns, desktop 4+.
- `viewSwitch` steps through the view options; the shell computes the next option from role input.

## v8.0.0 decisions
- The back layer API was too opinionated (filters / tabs / search). Pages now hold typed params; controls bind to them (role input, `accepts`). Header, basic action and panel are layout: regions of a RegionSet; the deck back layer is its strict form.
- Tab motion comes from the param, not the UI kind: `axis: true` → paramChanged carries a direction → choreography `{ paramChanged, axis }` → sharedAxis.
- State paths: `params.<name>` everywhere (conditions, binds, scope, persist). Expanded stays engine state (layout depends on it); params may set it through policy `on`.
- Search predictions on top of filters: draft + submitted params (`bind: { change, submit }`, `data: false` on the draft), a repeat over a suggestions source, `back.expanded.on` paramChange. Not added to the sample (ask first).
- Mockup: the basic action renders the bound control by component (filterChips / tabBar / searchField) from role input; child tab pages conceal on a tab pick through policy `on` (was shell code).
- Logo: below 64px the platform draws the design's pre-rendered mark (design/assets/logo-small-4x.png, visuals smallImage / smallBelow) as a mask in the content colour; the bars (and their levels loop) only above. Pixel snapping was tried and looked worse.
- Open: the mockup draws panel rows only as text (no bound controls in panels yet); Specs Editor / Components preview don't show params.

## v7.1.0 decisions
- Placeholders pulse (design only): `motion.placeholder` (pulse, loop, motion.duration.pulse 1200, smooth) on listItem (→ listRow, gridCard, contentBlock), tabBar, filterChips. Component motion keys are free names; the template's trigger says when. Comment in api.d.ts fixed in 7.1.1.
- `placeholderList` removed (unused since 7.0): design manifest, web manifest, component folder.
- Splash appears (design: states entering → enabled; logoOpacity 0 → 1 fade, logoScale 0.8 → 1 move; extraLong2 = 800ms, decelerate). `launch.minMs` 2400 → 1000.
- enterApp reworked (design only): fade through — cover fades out (medium), then back content, front (+stagger), nav (+2·stagger), peek (+2·stagger + peekStagger 80ms) each fade in rising 40px (extraLong, emphasizedDecelerate). Logo flight long (300), emphasized; the screen and the front layer reach the bottom edge of the phone; the nav bar and peek sit on top and occlude it (front content is padded to end above them). The phone background is the back-layer colour: the back layer is the bottom-most surface, so nothing light shows anywhere before the layers above it arrive. Logo levels: beat long + `smooth` easing; stopping settles over `settleMs` (long). New tokens: easing emphasized / emphasizedDecelerate / smooth; extraLong 450 → 500.
- `ChoreoPattern` now covers every event the choreography uses (`launched`, `sessionChanged`, `urlChanged`, `retryRequested`, `focusRestore`, `exit`). `sessionChanged` takes optional `signedIn` (the session after the change): sign-in → `enterApp`, sign-out → fade through. `enterApp` loses its exit-only params.

## v7.0.0 decisions
- Opening (design, no API change): splash shows the logo in `color.accent`, its levels loop running (no text; label is the accessible name); `launch.minMs` 2400. New motion `enterApp` for `launched` and `sessionChanged`: logo stops and moves + shrinks onto the back-header logo while the cover fades (back layer first), front slides up, then rail / nav bar / Nonono peek. Sign-in page shows the logo instead of the circle and plays the same motion. Launch while signed out: the splash logo moves onto the sign-in logo. Sign-out stays a fade through. Tokens: `color.accent`, `motion.duration.extraLong`, `motion.duration.stagger`; splash's `pulse` indicator removed.
- Launch splash; texts as TextRefs in 5 locales (he = RTL); placeholders required for data components.
- Mockup: splash + launched fade-through (Simulate restart / Reset replay it); sign-in ↔ app fade-through (sessionChanged); Language switch in the side panel (dir on the app; tab indicator logical, sharedAxis mirrored); placeholders per item form (list / grid / generic) from the design's placeholder visuals; content-state, dialog, snackbar and gate texts localized.
- App-bar push: the front layer no longer moves. The page and a surface beneath the front layer are clipped to one shape that animates from the front layer's rect + corners to the content area (corners → cornerTo); pop reverses it. Approved by the user — keep as is.
- Open (mockup): full RTL geometry (rail / side sheet / Nonono card on the other side, mirrored directional icons); remaining hard-coded side-panel / peek strings.

## v6.0.0 decisions
- Motion moves to the design, like components: `design/motions/` declares kinds; choreography (events) and component `motion` (visual changes, press) use them; platforms declare which kinds they implement. The API keeps only the generic descriptor shape and the rules.
- App-bar child fade-through scales the incoming page from 0.92 (`scaleIn`).

## v5.0.0 decisions
- Hide on scroll is for the **back-layer** header (sample: Libibi); the front-layer header never hides.
- Tapping the back layer (outside controls) toggles it.
- Panels size to their content (shell measures, layout stacks, capped so the front header stays visible).

## v4.0.0 decisions
- Back-layer header: right side is always a caret (disclosure role), every backdrop page; it rotates with back.expanded on the expandedChanged timing.
- Panel content reacts to the basic action (slots + includes conditions). Sample: per-filter rows, per-tab rows, recent searches / tips.
- App-bar child: one motion — the front layer grows over the content area (not nav) while its content fades out and the page fades in; it stays grown under the page, and pop reverses it. The mockup drives it with Web Animations on the nodes.
- URL carries filters, tab and query (routes.input 'all'); input replaces the URL; only a search starting adds a history entry, and back clears the search before popping.

## v3.1.0 decisions
- Status states are API (§20): derived by the core from the action (selected, busy, error), the control's value (checked, indeterminate) and input (dragged). Busy blocks activation but isn't disabled. Design keys visuals on declared statuses.

## v3.0.0 decisions
- Naming: model → `core/navigation.js`, presentation → `core/layout.js`. Layers: api (rules) → core (engine: navigation, layout, interaction) → app (config) + design (looks, motion) → platform (draws).
- Player stays in the API as an **optional** domain; `Wire.sync` removed.
- Colour by surface role, size by placement variant, layout facts as conditions in design values; navigation component per layout class in config; all motion from choreography.
- Every turn that changes the API is a release; this one is major (removals / renames / a required config field).

## v2.1.0 decisions
- Every turn that changes the API is a release (CLAUDE.md).
- Mockup: interactive controls are real component instances (one .dc.html per component). The shell only builds their props (slot path, resolve, look, activate); no global interaction table.
- Placement identity: a component instance is its slot path; interaction state is keyed by it. Root cause of the stuck-press, ripple carry-over and shared-hover bugs: identity was built ad hoc per call site.

## v2.0.0 decisions
- The app is a JSON document (AppConfig + design). No functions in config: `encodePage` removed, URL segments = percent-encoded item ids.
- Division of powers: API = roles + state + behaviour (a component-like thing is in the API only if the engine's behaviour depends on it). Config = which roles, arrangement, policies, which component fills each slot. Design = what components look like. Presentation = where/how things move. Platform = draws.
- Headers are slots filled with ComponentRefs (component + props + action + when + slots); values via state paths, derived values, conditions — no expressions.
- Roles: the API can demand a kind of component in a slot (tabBar, filterChips, searchField, item, interactive). Components declare `implements`; the engine supplies role props and maps role events to intents; config only picks the component.
- Design system split: one folder per component (roles, props, states, component tokens in .json; usage in .md; .d.ts generated, extending the parent's props). Tokens that are also groups were renamed `….default` (`state.hover.opacity.default` etc.). `gridTile` removed (duplicate of `gridCard`).
- Inheritance: `extends` (roles union, props/visuals merged, own values win) resolved by `design/load.js`; `variant: true` = drawn by the parent's code. Children: logo (variant of iconButton), chip / tab / navItem (button), listRow / gridCard / contentBlock (listItem). Specs Editor edits the raw design, so a parent change reaches its children; inherited cells show "↑ value".
- Platforms out of the design: no `platforms` in components; each platform publishes a manifest; the rule checks only what the config uses.
- State layers: tinted with the component's content colour ('content'), strength per component (subtle for large surfaces), shape from the component's `radius` visual. Press = ripple from the press point (`ripple` visual + `motion.ripple.duration`; off with reduced motion). Basic-action parts are `chip` and `tab`.
- Pointer focus (after a click) has no state layer; only keyboard focus shows one (layer + ring).
- Specs Editor saves a patch (only changed tokens, visuals, platforms, transitions) under `backdrop-nav-specs-patch`; everything else always comes from design/.

## Open (old list — see the latest sections for current open items)
- Logo `playing` (design prop) is not set by the app yet. Since 13.0 config can reach it (`{ player: 'status', equals: 'playing' }`); only the app.json wiring is missing.
- ListItem surfaces (front header, Nonono peek / card / title) use an interaction layer over the surface; nested controls sit above it.
- Back-layer region heights and sheet sizes are config (layout decisions per app); fine as is unless the design should own them.
- Questions for the lead: backend stack, API definition method, where nav lives today, design system → code path, automated checks, playback per platform, desktop plans.
- Map real backend schemas onto §3/§16 data types once the repo is available.
- Possible: config editor section in Specs Editor; screen-reader announcements; notifications.

## v1.2.0 decisions
- §20 InteractiveComponent: six states (enabled, disabled, hover, pressed, focus, keyboardFocus). Disabled = action null (not implemented) or unsupported (unknown type / dangling ref). Idempotent actions stay enabled. Mockup: every unimplemented control is disabled.
- Reselect: depth > 1 → pop to base with motion (`popped`, `depth`); at base → lifecycle event `reselect` on the base page; policy decides (sample: scroll to top + collapse). Only the base page fires `reselect`.
- Actions span domains (nav / player / shell). Mockup: every app control goes through `resolveInteraction`; side-panel debug tools are not app controls.
- Return keeps `back.expanded`: popping back shows the page as the user left it (rule checks every deck × device).
- Tabs: shared-axis X transition from the `inputChanged` event; indicator slides.
- Layer `policy.open` is live (deckSwitch closes the layer if configured; sample: none).

## Hard-coded values check (platforms/lint-web.js)
- Scans the web shell for colours, px lengths (except 0 / 1px), ms durations, easing curves and numeric fallbacks after design lookups. Skips lint:off … lint:on regions (simulated devices, fake-backend artwork, debug side panel), data-harness elements and hint-size placeholders. Shown on Invariants.dc.html under "Platform check"; currently clean (0).
- Removed in this pass: the growing surface (bAnim), all design fallbacks (|| 48, || 140 …), loading-stub colours, hard-coded dialog / snackbar strings (now texts), rail leftovers, the never-shown tracking header values. New design values: frontLayer scroll thumb (size, inset, timing), fabEndPad; alphaIndex slotWidth / insetBottom / offsetTop; bottomSheet handleRadius; header / frontHeader / appBar spanInset, detailFade, detailShrink, titleFadeFrom; label slotWidth; localSearch minWidth / width / slotPad; iconButton offsetTop (edge); gridLayout scrollbarGutter; token color.backLayerAlt (palette tweak).
- Not caught by the check: plain unit-less numbers in arithmetic (it only flags fallbacks); review those by hand.

## Motion runtime (platforms/web/motions.js)
- Every motion player lives in platforms/web/motions.js (phased fade through / fade / sharedAxis, cover fade, shared element flight, expandSurface, enterApp, timing + easing). The shell only says when (event, elements, commit) — no motion code in Backdrop Nav Skeleton. platforms/web.json `motionRuntime` points at it; lint-web.js checks it too (clean).
- Shared element: elements mark themselves `data-shared="image"` (GridCard, ListRow, ContentBlock, Carousel entries, DetailHeader). The flight waits for the target after the commit and follows it per frame; size and corners interpolate directly (radii clamped to half the box), so circles stay circles. Fixed: the ghost stayed frozen (target lookup ran before the new page existed) and turned square (scale transform distorted the corners).
- Still in the shell, not yet moved: drawer / sheet / rail transitions driven by CSS transitions in the template (durations read from design); circular reveal clip. Candidate for the next pass.
- State-driven transitions (layers, sheet, drawer, rail, circular reveal, app-bar page, expand moves, scroll thumb, placeholder pulse, splash logo) now come from motions.js (css / cssAll / cssFor / flash / pulse) per event — the template only binds `mx.*`. pulse gained design params `low`, `stagger`. lint-web.js has a shell-only `motion` rule (no .animate / style.transition / literal transition lists in the shell) — clean.
- App-bar page → another deck's base (back to start deck, back across decks, nav switch): expandSurface reverse (page clips down + rounds into the destination front layer, which stays put) instead of fade through + front layer sliding.
- Fixed: choosing another song flashed every play/pause control — the player passes through 'loading' and the config's `{ player: 'status', equals: 'playing' }` icons flipped to play and back. Config now uses `any [playing, loading]` (6 places).

## Mock catalog (app/fake-backend.js)
- Generated filler for scroll testing: +4 albums per artist and 20 more artists (9–14 songs per album, every album ≥ 10 songs); +3 books per author and 12 more authors; +16 episodes per show and 10 more shows. Deterministic word lists; names unique. Search's empty-query results interleave people and collections (24).

## Corner shape
- Squircle corners (radius.shape / radius.shapeScale) tried and removed at the user's request; corners are round. Kept from that pass: contentBlock.artRadius, listRow.thumbRadius, menu.handleRadius (literal radii moved from the DCs into design).

## App bar page (14.2)
- Top row + AppBarSheet (album info shrinking with the sheet, bottom row: search + play buttons). Gate pages (sign-in, onboarding) keep ←; their headers have no expanded / bottom slot, so they draw only the top row (no sheet).
- Open: the field's width needs the buttons' measured width (one extra render after the buttons change).
- Fixed: app bar page icons were dark on the dark top row — header items on deck app-bar pages now sit on surface backLayer (top row) / frontLayer (bottom row), so their colours come from those providers (shell surfaceOfTheme).
- Fixed: opening an app-bar page grew the front-coloured surface to the very top. expandSurface takes `surfaceTo` (motions.js): for a page-form bar with a sheet the surface lands on the sheet (below the 64 top row, sheet corners); the page itself still clips to the full area and fades in. Same in reverse on pop. Checked: surface clip ends at inset(64px … round 16px 16px 0 0).
- Fixed: the first app-bar page open drew placeholders while its component files (AppBarSheet, DetailHeader, Button, ListRow) loaded; the shell now fetches those files at start (no hidden instances — mounting propless components logged an error).
- Fixed: first app-bar page open after load — the content box was placed with the previous top-row height (0) and then slid to 64 over the top row; the top-row height is now set before the content box is placed.
- Fixed: intermittent console error on load — Logo.dc.html read prevState in componentDidUpdate, which the DC runtime doesn't pass; it now compares against its last synced vis / motion.
- Fixed: first app-bar page open showed an empty sheet (its DCs mounting late) — the shell keeps one hidden AppBarSheet instance (real props) so its files are set up before the first open. Its hidden detail image is outside backRef / ovRef, so scoped shared-image lookups never pick it.

## Queue animation (14.3)
- dropIntoPeek in platforms/web/motions.js; checked in the preview: Next slides the peek text aside and back, Last slides the last control aside and back, Play drops onto the peek image. The shell finds the source image (the tapped item's, else the page's detail image) and the visible peek.
- If the peek isn't visible (Now playing sheet open), no animation runs.
- Artist page: play buttons in an `actions` back region below the details (button tone inverse on the back layer). Search deck components warmed up at start.
- dropIntoPeek `corner` param (top | bottom); sample design: top.
- Detail pages always scroll far enough for their bar to fully collapse: the front content (backdrop) and the app-bar page list sit in a wrapper with min-height 100% + the collapse distance (back header expandedHeight − height; app bar expandedHeight − height). Checked: an artist with few albums scrolls 216 (collapse 192), a short album collapses its sheet to 144.
- dropIntoPeek `last`: all controls slide aside together (controlStagger), with a cover in the peek's colour under the leading control (clips the text, coverShadow).
- dropIntoPeek: controls move rightmost first (both ways); the cover's shadow appears only once its edge passes the text's glyphs; the travelling image casts `dropShadow`.
- dropIntoPeek: subtler coverShadow; closing over the queued image shades its leading edge (shade / shadeWidth, clipped to the image).
- Fixed: the front layer's scroll thumb was painted under the content (now z-index 2 inside the front layer). The app-bar page list has its own thumb, running in the visible part below the sheet.
- Fixed (artist push / pop while scrolled): the shared image ghost starts / ends clipped to the visible part of a card hidden under the front header (sharedFlight `clip.from / clip.to`); the page's scroll restore no longer turns off the front layer's slide — motions.js owns the rule (restoreScroll / userScrolled / forMove: user scroll moves bars without a transition, a restore doesn't count as user scroll); the shell only calls it.
- Shared image clip: the cut edge's corners round in with the opening (inset … round 0 → shape radius), no spikes where a straight cut meets a circle.
- Fixed: grey boxes on first open (any component whose file is still loading — group headers, alpha index, search parts) — those are the DC runtime's loading placeholders; the shell's body reset hides them (load errors still show). The warm-up instances stay, so first-open layout doesn't jump.
- Shared image: no more corner rounding hack — a partly hidden image slides clear of its clip, then curves into place (sharedEscape, sharedArc); landing under a clip mirrors it. Artist push: header, actions, filters slide in after the image, staggered (enterDelay / enterStagger / enterMs / enterDistance).
- Local search: ✕ inside the open field (localSearch `end` slot, config: iconButton close → setParams { find: '', searching: false }; text find.close in 5 locales). Scrolling still opens the field; ✕ also sets the page param `searchClosed`, which keeps it closed while scrolled until 🔍 is tapped again or the page scrolls back to the top (policy resetOn scrollTop, plus the page's own search resets). (I first removed the scroll-open by mistake — restored.) Checked: album page search opens, ✕ closes it.
- Local search ✕ now matches the field's text colour: it sits on surface localSearch, which provides content / contentVariant = the text colour (was the layer's secondary ink #444).

- Shared image rewritten from scratch (motions.js sharedFlight): start = the source as seen (rect, radius, inset clip down to its visible part — cut by data-occluder bars / peek / nav bar and clipping containers); end = the target the same way, measured once it exists with its incoming page's motion skipped to the end (atRest). One Web Animations keyframe pair on a copy (left / top / size / radius / clip-path), sharedMs + sharedEasing; real images hidden until it lands; same both directions. The shell's old clip argument and visibleRectIn are gone.
- dropIntoPeek: fall duration = fallScale (12) × √(drop height px) from where the fall starts (fallMs removed). The corner it shrinks onto is raised to minFallHeight (60) above the destination if lower — part of the shrink move, not a separate rise; clipped by the peek during that move (inline clip, cleared after). Empty peek (nothing playing): its image hidden until the falling image lands (NowPlaying data-empty / data-filled-at).
- dropIntoPeek: the landed image rides the peek's bounce (composite add on its transform), which starts only once it lands; the peek's image and the copy stay aligned; `now` removes the copy after the bounce.
- Fixed (my mistake): the controls stopped covering the image in `last` — the fall / rise animations held a clip-path (fill forwards) that beat the close clip; no held clip any more.

- Demo slow motion (motions.js, debug only): every duration in a descriptor passed to the runtime × 2^step, step in localStorage `backdrop-nav-slow-motion` (0 = real speed). Control: "Slow motion" stepped slider in the side panel under Layout width (1× – 16×); changing it re-renders the shell so render-bound CSS transitions pick it up. (Demo.dc.html wrapper removed.)

## 15.0.0 — collapse-first scroll (approved)
- core/layout.js: `barView` → + distance; `contentOffset(page, specs)`. Rules +2 (105).
- Shell: `bindCollapse` (wheel / touch while the bar isn't fully collapsed → scroll intent, preventDefault; a touch gesture that began collapsing keeps scrolling the content by hand), `pageScroll` (native scroll → collapse + offset), restores use contentOffset (clamped to the scrollable range). App-bar list spacer = current sheet height. Extra scroll room removed (front content and app-bar list); padding behind peek / nav bar untouched.
- Not checked on screen: trackpad momentum across the collapse boundary (leftover delta of the collapsing wheel event is dropped).

- Fixed: album (app-bar) pop had no shared image — collapseFrom never ran the flight though the design declared `shared: image`. It now flies the detail image back into the item it was opened from (choreography popped appBar `sharedDirection: reverse`; expandSurface declares sharedDirection).

- Shared image easing: new token motion.easing.inOutSoftEnd = cubic-bezier(.45,0,.1,1) (ease in and out, softer landing) on all four push / pop rules. Soft landing in both directions.

- dropIntoPeek: dropShadow softened to 0 2px 6px rgba(0,0,0,.18) (kept after landing). Alignment: the destination was measured while the peek could still be mid-bounce / mid-slide from an earlier drop — those animations are cancelled before measuring. Next misalignment (my mistake): the live-follow fall kept measuring the peek's image after the hit, i.e. mid-bounce, and handed that bounced position to the tuck — removed; the fall goes to the destination measured at the tap.

- dropIntoPeek next: on landing the copy moves into the peek, just behind its image (z below the art), bounces as part of it, then slides under the art, which covers it — no clip (the clip left a hairline at the art's edge) — and casts tuckShadow on it during the slide. Fixed: cancelling the copy's animations dropped its corner radius back to the source's — now set to the peek image's radius.

- dropIntoPeek is one throw from the tap: the copy's centre follows a single parabola (original's centre → apex → destination's centre; one parabola in space; the run along it eased with throwEasing (accelerate, fast out linear in — as the old fall; standard (slow in) was my mistake) over throwMs (extraLong) — physical gravity timing was tried and dropped, too fast at the end; fallScale removed). Apex: the tiny square's top at the original's top, or minFallHeight above the destination if higher — it always goes up first; it shrinks on the way up and is tiny by the apex. Clipped by the peek while rising. Params corner / shrinkMs removed (the rise time sets the shrink).


- Make-room slides (next: text aside; last: controls aside) had started at the apex time under gravity (0 when there was no rise) — they now start when the image is tiny, as after the old shrink.

- dropIntoPeek: throw duration back to ∝ √(drop height, apex → destination): fallScale 29 (300 px ≈ 500 ms; throwMs removed). Slides back to normal (next: text; last: controls + cover) slow in: closeEasing = decelerate, used for the text return and the image sliding under the art (next) too.

- dropIntoPeek last: the image's clip (and the shade) now follow the trailing control's edge exactly (keyframes where the overlap crosses 0 / size, same easing and delay) — before, a linear 0 → size over the whole close lagged behind the control. Next: slides back use tuckEasing = standard (slow out, ends at rest). Note: decelerate also ends at rest (zero end velocity), but starts at full speed.

- dropIntoPeek last: the cut under the sliding control is done with transforms (an overflow-hidden window moving right, the image inside moving left by the same amount) instead of an animated clip-path — the clip-path ran on the main thread and stuttered against the controls' composited transforms once it tracked their edge.

- Detail page push / pop (backdrop) rewritten from scratch: motions.js `detailTransition` runs the whole sequence (lift + old content out → commit → front surface moves top0 → top1 with WAAPI while visible, new content in + stagger, image copy flies from the source's visible part to the target's, measured after the render settles). Shell: `detailMove` only commits (front layer CSS transition off meanwhile) and hands over elements; a render queue runs the post-commit step after scroll restore (componentDidUpdate → didUpdate + queue). Album (app-bar) push / pop still use expandSurface + sharedFlight.

- Detail push / pop image (backdrop detailTransition + app-bar sharedFlight, both via motions.js cutCopy): a copy flown by transform (translate + scale, sharedMs / sharedEasing), corners on an inner element; no clip-path. Its top is cut where the header meets it; on album pages also its bottom where the peek / nav bar ([data-occluder="bottom"] in NowPlaying / NavBar) meet it. The cut is part of the image (window + counter-moved image, transforms only) and goes from the source's cut to the target's over the flight, same easing.
- Detail push / pop: fixed back-header parts don't cross-fade. Bar marks start / end items and the title `data-fixed` (slot + icon / text); parts in both headers stay put (slide if moved), the rest cross-fade (old ones as ghosts). The back layer's own surface doesn't fade, only its loose content.
- Push crossfade (backdrop + app-bar): fadeMs = long (timing() reads fadeMs for every kind; falls back to ms). App-bar push is a fade through: the old content stays out (fill forwards) until the new is in, then is released under the page (was snapping back mid-fade → overlap).
- Backdrop back headers 64px (config region heights · design header.height). Library: hideOnScroll removed (its two rules now skip; library's headerHidden policy left, unused).
- dropIntoPeek path: straight up, a semicircle as wide as the horizontal distance with its top at the apex, straight down; tangent joins, so vertical speed is 0 at the apex. Apex = min(original top − riseHeight 20, destination top − minFallHeight 60). One eased run (throwEasing) by distance along the path, msPerPx (0.9) × length; shrinks by the apex, clipped by the peek while rising.
- dropIntoPeek next closes like last: holdMs, then tuck + text back together (closeMs long, closeEasing smooth, text stagger).
- App-bar push / pop: the page's sheet (AppBarSheet, data-sheet) starts where the front layer is and slides to its place with the surface (ms / easing); pop slides it back down. The sheet's own fill / corners don't fade or scale (solid, like the surface); only its children and the page's other parts fade (pageParts). Fixed: the push fade-out release cancelled the wrong animation (index shifted), leaving the front content hidden.
- One fade through for the WAAPI players (motions.js fadeOut / whenOut / fadeIn): detailTransition and expandSurface both fade the old out, and only when that has actually finished (not a timer) commit / start the new fade-in. Fixes the backdrop pop cutting the old content at ~⅓ opacity (the commit timer fired before the fade-out, which started a frame late, had finished). phased / cover (CSS transitions via shell state) keep their timer form, same timing().
- App-bar push / pop: no page growth. The page shows only in its top revealBand (100) px, still, and from its sheet's top down — that edge moves with the sheet; scaleIn 1. Only the sheet moves. (My mistake before: only the parts above the sheet were cut, so the page's dark container showed everywhere else.)
- AppBarPage.dc.html: the app-bar page was drawn inline in the shell (rule break); now a component the shell places once. It marks what fades (data-fade: rows, top row); its fills (surface, back-layer fill, track list fill, sheet) stay solid in push / pop. Fixes the dark back-layer fill showing under the faded track list.
- Shell no longer draws UI itself: the front layer (surface, expand surface, content, scroll thumb), the Now playing sheet (bottomSheet / sideSheet), its inner Up next sheet (bottomSheet: handle, tabs, queue rows), the peek card, and the Dedede / Account layer pages are component DCs the shell places once (mount display:contents, so placement is unchanged). Checked: Browse, artist push / pop, album push / pop, Now playing (sheet + inner sheet tabs), Settings, Account, wide layout (side sheet).
- Content renders under the peek / nav bar / rail: the front layer runs to the screen bottom; its scroller pads by screenBottom instead (checked: front + scroller bottom 760 = screen; fully scrolled, the last item ends at 632, above the peek at 656).
- AppBarPage is preloaded (hidden instance, no live refs) so the first open after load finds its sheet / fading parts.
- Rules: fadeMs declared on expandFromItem; dropIntoPeek's 2px overlap is design (cutOverlap). API header comment says 15.0.0 (was 14.1.0). 103 pass · 2 skipped · 0 fail; web lint clean.
- The demo's Slow motion control was at 4× during today's measurements (shared localStorage) — my earlier "fade stuck at 1.00" readings were at 4× time, not a bug I've shown.
- Fade through everywhere: backdrop detail header parts that differ now fade through (old ghosts out, then the new parts in; matched parts stay). phased (deck switch, param swaps…) and cover (splash / gate) start each phase's timer only once its transition is drawn (afterPaint), so the old is fully out before the new comes in and the new fully in before the style is released (were timed from the call, a render early).
- Fade through is design: one look in tokens motion.fadeThrough.{ms 300, split 0.3, easingOut, easingIn, scaleIn 1}; every fade-through rule (deck switch, param swap, sign-out; the fade in expandFromItem / expandSurface / sharedAxis) reads them — push and pop alike. Which parts fade is design too: expandFromItem fixedParts ('stay' | 'fadeThrough'); expandSurface fadeParts / slideParts by AppBarPage data-part names (rows · bar · list · fill; sheetContent). Changes in look from unifying: pops' fade 250 → 300; deck switch / sign-out / param swap 250 → 300 and no 0.92 scale-in; swap / sign-out now use the accelerate / decelerate curves.
- Design checks (design/checks.js — design data, not engine behaviour, so not api/invariants.js): every declared motion param gets a value (rule / template or default); motion params that name parts (param `parts: <component>`) name only parts the component declares (component `parts`, design-only — core ignores it), and every platform implementing the motion lists them (manifest `parts`). appBar parts: fill · list · rows · bar · sheet · sheetContent.
- Player defines no look of its own any more: fade split / scale (fade.json split 0.5, scaleIn 1); dropIntoPeek bounceAt 0.4, tuckShadowIn 0.3 / Out 0.8, coverShadowRamp 0.05, controlOrder 'endFirst', apex 'higher' — values unchanged, now design. A missing easing logs an error. fadeThrough no longer declares `easing` (it uses easingOut / easingIn).

## Component contracts (16.0.0, released — see CHANGELOG; items below still open)
- 16.0 done: typed refs, 8 page / surface roles (parts = config fields), §M2 supplies / events, roleProps / roleIntent mappings, Layout.componentFor, 4 new rules. Changed from the draft: supplies hold only state-derived values (backLayer expanded / headerHidden, frontLayer position, pageSheet expanded, layer open / form / side); regions, offsets and content state stay Layout / query outputs (core navigation has no specs or measurements). Rules 106 pass · 2 skipped · 1 fail: backdropPage (and likely appBarPage, sheetLayer, fullscreenLayer — the rule stops at the first) not in platforms/web.json; the web DCs for them are the next step. app.json changed only in contractVersion. Roles single source done: api/roles.js → core (ROLES), rules, design/build.js; api.d.ts §M2 generated by api/gen-roles.js (rolesDtsInSync checks it — not yet shown on the Invariants page). Rules 107 pass · 2 skipped · 1 fail (same: web manifest). The web loaders (shell loadModules, Invariants run) now resolve relative imports inside blob-loaded modules (load each dependency the same way, rewrite the specifier); core imports api/roles.js normally. Components.dc.html / Logo.dc.html load only design/load.js and core/layout.js (no imports) — unchanged. Still open: generated .d.ts for the new / changed design components (build.js not rerun).
- Two meanings of "parts": Role.parts (API, 16.0: the config fields a page / surface role draws) vs design component `parts` (appBar: names motions animate). Different things, same word — rename one (open).
- Direction: typed contracts = the minimum config and engine rely on, not a full shape. Config fills what the contract guarantees; a design component declares its own full shape (may be bigger: extra slots, parts); a rule checks config only uses what the contract or that component declares. Config types stay the parts (app.json mostly unchanged). Motion is not in contracts: parts that motions name are design (component `parts`, design/checks.js); the API only types that design data may declare them.
- Contracts per place (from api.d.ts + core):
  - backdropPage: parts back → backLayer, front → frontLayer. title / params reach components only through refs; id = identity (slot paths); kind = which shape; policy engine-only.
  - backLayer: parts regions (header bar + slot regions), layouts; supplies expanded, headerHidden, per-region top / height / opacity / interactive; emits toggle (toggleOnTap) → toggleExpanded.
  - frontLayer: parts header → frontHeader, content; supplies position, content offset, content state; emits scroll, retry.
  - appBarPage: parts header → appBar, content | body, sheet → pageSheet; supplies content offset, content state; emits scroll.
  - pageSheet: parts header → bar, content; supplies expanded; emits toggle.
  - sheet layer: parts open page, peek.header → peek; supplies open, form, sideMode; emits open (peek tap), close.
  - drawer layer: parts open page; supplies open, form; emits close (scrim).
  - fullscreen layer: parts open page; supplies open.
  - Existing roles: slots become minimums (a rule forbids extra slot names today).
- To settle:
  1. Drawing-only values in config (region height / expandedHeight, peek.height, peekHeight, drawer width, coversNav) → design (user: design). Core reads several (regions, frontLayer top, barView, geometry) → it reads design visuals instead; how design addresses config region names is open. Major.
  2. core/layout.js peekPlacement literals 32 / 16 → design.
  3. One current value, two vocabularies: FrontPosition ('expanded' | 'partial' | 'full', query) vs FrontLayerView.state ('expanded' | 'partlyCollapsed' | 'fullyCollapsed', layout). Config is collapse ('partial' | 'full'); state is back.expanded.
  4. PageConfig.id means a hand-written name in config and a computed path at runtime (templates are overwritten with parent id + '/' + item id; layer pages are found by key). Drop it from page configs; runtime pages get `path` (user: path). Major.
  5. Role events with no intent mapping in core roleIntent: interactive / fab activate, overlay close, emptyState / errorState / staleBanner retry; plus surface events the API doesn't declare (back-layer tap, peek tap, scrim tap, sheet drag; queue move).
  6. API types missing fields design / platform use: ComponentDef.parts, MotionParam.parts, PlatformManifest.parts / motionRuntime (added in an "Unreleased (no contract change)" block).
  7. queued missing from ChoreoPattern (14.3); core matches() ignores position, so all three queued rules resolve to the first; the invariant's event list lacks queued.
  8. Two ways config names a component: refs vs bare ComponentId (splash, contentStates, OverlaySpec.component) — 13.0 made refs the rule and left these three.
  9. Token audit (design only, no API change): component visuals hold literals that duplicate tokens (bottomSheet / peekCard fill "#fff" = color.surfaceRaised; peekCard radius 12 = radius.md; backLayer panelDivider rgba(255,255,255,.15) vs color.backLayerDivider .2; header height 64 repeated in config; appBar page-form heights 208 / 268 not tokens) and whole categories have no tokens (shadows ≈15 literal strings, type sizes, most opacities). Earlier passes moved values from DCs into visuals as literals. Plan: list duplicates → point them at tokens; propose shadow + type-scale tokens.
- Also found, not decided: OverlaySpec kind 'actionSheet' and FullscreenPresentation have no design component; Specs.screens / Prefs.theme unused; nowPlaying (design) claims to be the peek but implements no role and config doesn't use it; signInPage, trackedTitle, revealFromItem unused.

## Component DCs rebuild (agreed, starting)
- The existing DCs' look is what the user has been reviewing (keep it); their DOM / structure is not trusted (rebuild). Order: leaves → bars → surfaces → pages. A new DC takes its design component's name; the old one is deleted when the shell switches to it. DCs without a design component (Bar, EdgeHandle, Scrim, Placeholder, AppBarSheet, UpNextSheet, NowPlayingSheet, DededeLayer, AccountLayer, PeekCard, SignIn, NowPlaying) go once their real counterparts exist. User OK'd shell edits for the switch.
- Convention for every component DC:
  - props = the design component's `props` (role-supplied ones included, filled by the shell from roleProps) + `visuals` (resolved by the shell: resolveVisuals for its state / variant / surface / env) + `ix` for interactive ones (the interaction view + handlers from interactive.js);
  - slots: a prop per slot holding the resolved child refs (ResolvedRef[]), drawn through one renderer (see open question);
  - every slot and declared part is marked `data-piece="<slot|part>"` (motion pieces, 17.0); no other data-* markers;
  - events leave only as the role's events (`on<Event>` props → roleIntent in the shell) or `activate` (the ref's action); no shell state or app knowledge inside;
  - no literal look values: everything from `visuals` (lint).
- Done: Symbol (parts glyph; props icon / fill / weight / grade / opticalSize, a prop wins over the same-named visual), Label, Title (dropped the undeclared `height` prop; the bar row centres it). No literal fallbacks left in them.
- Open (asked): (a) a component drawn with another design component inside (iconButton → symbol, symbol.md says so; iconButton.json doesn't declare it): where the child's visuals come from; (b) `variant: true` = "drawn by the parent's code" (logo, caret → iconButton), yet Logo.dc.html exists — rule "one DC per design component" vs variant.
- Open: rendering a slot's children needs one place that maps a ResolvedRef's component id to its DC (today Bar has a per-kind sc-if chain). That mapper is platform plumbing, not a design component — allowed? (asked)

## Motion as steps (17.0.0, in progress — agreed)
- Why: motion kinds were black boxes: choreography picked a kind and set numbers; which elements move was decided by the web player through DOM markers the DCs put down (data-peek, data-shared, data-fixed, data-sheet, data-occluder, data-part), none declared in design. Found by reading platforms/web/motions.js (dropIntoPeek 379–504, detailTransition 154–207, expandSurface 298–345, enterApp 350–373).
- Agreed: four blocks (tween · travel · swap · reveal) + pieces (contract slots / parts, component parts, source / target, step copies, lists) + measures + ByEvent + clocks (time with anchors · progress on bar / scroll / contentOffset) + loop / stagger / hold + conditions. Scroll: progress clock (collapse-driven fades / shrinks become choreography; header detailFade / detailShrink / titleFadeFrom are shell meanings today), scroll as a tweenable prop (scroll-to-top, scroll-into-view before a travel), pinning by live edges; momentum across the collapse boundary, scroll-to-top, sticky / snap are design. Scroll itself is broken (separate).
- Travel: whole by default; `from: 'visible'` + `cutBy` (declared pieces) keeps the clipped start where design wants it (the bad case: an image under the front-layer header — or scroll it into view first).
- Platform mechanics stay in the player: sampling paths into keyframes, overflow-window tricks instead of clip-path, measuring at rest, z-index of copies, cleanup.
- Done (step 1): types, core (stepsFor / componentSteps, pattern matching on every field), design data as KindSteps, rules +2, checks / overrides / Specs Editor follow. Nothing moves differently yet (same kinds, same values; queued now picks its own rule — the three rules had identical values).
- Next: generic web player; port dropIntoPeek first (component parts trackInfo title / subtitle, image on listItem / detailHeader / artwork; peek = config's header + artwork + trackInfo, so the queue drop stops reading NowPlaying's data-peek), then shared image, detail push / pop, app-bar push (its fadeParts / slideParts named workaround pieces — needs a redesign in real pieces), the rest; measure each; remove KindStep.

## Component contracts, from scratch (agreed 2026-10-08, with Sofia)
Restart of the component model from the v1.1 design (docs/v1-recollection.md); replaces roles, refs, supplies / emits,
roleProps / roleIntent and Role.parts once built. Starting point: the backdrop page (back layer, front layer, their headers).
- **Config** (app/app.json) says what exists, as plain data. No slots, no look values (no region heights, no sides).
- **Contracts** (API) say what each drawn config object offers: its config, its values (from State, queries and Layout
  outputs alike), the intents it accepts, and its children (config fields that hold other drawn objects). Engine-only
  config (policies, routes, layouts …) is never a contract's subject.
- **Free components** (design): props, events, slots, parts, visuals. They know nothing of the API. A free component may
  be built from other free components inside design (iconButton draws a symbol).
- **Hired components** (composition): one free component hired for one contract, with clauses and variant picks. One
  hire wraps exactly one free component and meets exactly one contract. Look changes for a job are variant picks only,
  never values.
- **Clauses** connect the two sides: prop ← a contract path, event → an intent type, slot ← a child. A clause is implied
  where the names already match; only mismatches are written. Tools list which clauses were implied.
- **composition.json** (new file, after config) places only hired components, by config kind, with per-page exceptions.
  It also decides arrangement (which side of a header an item sits on).
- Slot vs part: a slot is a hole filled from outside (by the hire composition picks for a child); a part is a piece a
  component draws itself, named so motion can address it (web components' ::part). Role.parts (16.0) was slot-like.
- Style: every type named; no `Record<string, X>` in API sketches (use a named spec type with a named key type).
- Rejected: clause sets on the component (design would hold API names and grow a set per job); separate adapter files
- Tokens: a hire's fixed values are tokens minted for it (`<hire>.<name>`), each aliasing a design token, as Sonora's
  tokens alias their scales (`--surface-fg: var(--neutral-50)`). Composition holds no literals.
- Built (18.0.0, branch component-contracts-switch): api/api.d.ts (config, contracts, composition types), api/contracts.js
  (single source; api/gen-contracts.js writes the TS), app/app.json (converted by script), app/composition.json,
  core/compose.js (placements, sizes), core/contracts.js (the contract tree), api/composition-rules.js. Findings: fixed back
  regions (header · actions · basicAction · panel; panel only expanded) fit every page; every back title is the page
  title; every front header starts with the caret; every control maps from its param's spec (choice → chips, axis →
  tabs, choices → filter chips, number range → range field, draft → search field; one exception: Library sort is a
  dropdown). Design would need: events on interactive free components, `items` slots on layouts, a `content` slot on
  panelRow, slots on backdropPage / backLayer / frontLayer for their children, top / contentOffset props on frontLayer,
  icon tokens.
- Motion: no step names a piece yet (all 48 are kind steps), so nothing breaks. Pieces become `<contract>.<child>` and
  `<free component>.<slot|part>`; hires are never named by motion.
- Decided (Sofia): the engine owns the local search's open / closed state: FrontState.find { opened, closed } with a
  mirroring FrontPolicy.find; intents openFind / closeFind; open = (scrolled and not closed) or opened or text not empty.
  The params searching / searchClosed and the morph condition leave config. Content params: a named list (ContentParam).
- Decided (Sofia): items always open a detail page; bare songs do not belong in carousels (sample data to change). An
  item may hold entries (ItemData.entries, from data); data decides which shelves exist. The front header and the back
  header become one free component (`header`), the front-header hire picking a variant. Contracts as data generate the
  TS (roles.js pattern); the contract list doubles as the marker of which config types are drawn.
- Rule (Sofia): as few free components as possible; merge similar ones; inherit wherever possible (variants for looks).
  Proposed tree (69 design components today → about 17 roots):
  text ← label, title, panelRow, groupHeader, trackedTitle · symbol · artwork · morph · row · alphaIndex · seekBar ·
  interactive → button ← chip, tab, navItem, drawerItem → iconButton ← caret, logo, viewSwitch, fab ·
  interactive → listItem ← listRow, gridCard, contentBlock, carousel, suggestionRow, queueRow ·
  choiceGroup ← filterChips, choiceChips, tabBar · field ← searchField, localSearch, dropdown, rangeField ·
  header ← frontHeader, appBar (+ the peek's row) · info ← detailHeader, trackInfo · layout ← grid, list, scroller ·
  surface ← backLayer, frontLayer, bottomSheet, sideSheet, drawer, peekCard (+ empty backdropPage, appBarPage,
  sheetLayer, fullscreenLayer) · message ← emptyState, errorState, staleBanner, snackbar · dialog ← menu ·
  navigation ← navBar, navRail · page ← splash, signInPage. nowPlaying (peek content) = row of artwork + info + buttons.
- Decided (Sofia): a shelf is an item holding entries (Browse's carousels; fake-backend shelfItem already says so). The
  page template `shelf` becomes `shelfPage` (draft pages.json; app.json / fake-backend opens at the switch).
  (a second place to look, no home for per-job looks).

### Decisions made while Sofia slept (2026-10-09, 00:15–02:13) — review these
Each was my call; say if you disagree and I redo it.
1. The draft lived beside the old API until it was whole; it has now replaced api.d.ts / app.json, and roles.js,
   gen-roles.js, the draft files and the ref / role rules are deleted.
2. The back layer has fixed regions (header · actions · basicAction · panel; panel only when expanded) instead of free
   regions + layouts. All five backdrop pages fit; a page wanting another region would need an API change.
3. One header config and contract for the back header, the app bar and the peek; composition tells them apart by the
   contract they sit in (Placement.within).
4. Items are named (ItemName) so composition can single one out (menu, up, playNow …). Names came from the icons
   the converter found; they are config names now.
5. Icons are looks: composition picks them through hire tokens aliasing new design tokens (icon.menu …). Deck icons
   left DeckConfig for the same reason. Buttons whose icon changes with state carry `state` (a name such as 'pause'),
   and composition maps it to tokens.
6. A presentation keeps `itemAction` for items that do not open (bare tracks play; queue rows play their index). Sofia
   said shelves' entries always open; this keeps tracks in lists playable.
7. Overlays lose `component` and `props`: composition picks the component by kind; texts become named texts and a
   menu's items become button items.
8. The built-in caret's label comes from fixed texts (backLayer.reveal / backLayer.conceal), as the find ✕'s comes from
   find.close: core reads these text ids.
9. Content states (empty / error / stale banner) are children of the content contract; composition picks their
   components (was AppConfig.contentStates).
10. Merge tree for free components (above) is my proposal; applied when design moves to the new model.
11. Breakpoints.railWidth (80, config) duplicates navRail's design width: it leaves config; the side-sheet and rail
    widths reach sideMode as model `sizes` (see the switchover plan).
12. ContentView loses `component` / `banner` ids (composition picks content-state components); keeps the state, whether
    items show, placeholders, retry and whether the stale banner shows.
13. Placement identity (SlotPath) becomes the contract tree's path keys (core/contracts.js), so interaction state still
    belongs to where a component sits.
14. Peek detail is drawn by detailHeader with a new `peek` layout, the player's artwork + track info by a new `player`
    layout (the `info ← detailHeader, trackInfo` merge). Values copied from artwork / trackInfo, gap between art and text
    guessed (12 / 24). The DetailHeader DC does not draw these layouts yet: the shell still draws the peek and the player
    with the artwork / trackInfo visuals.
15. The generated token files (generated/) were stale at the baseline; regenerating them also brought in older design
    changes (fadeThrough tokens, header height 64).
16. Items whose `when` does not hold stay in the contract tree with `shown: false` (the contract note said lists hold
    only shown members): the old shell kept them drawn at zero width so they fade in and out (Library's filter summary).
    So a hidden item still needs a placement (the menu button is placed on wide too).
17. A new clause, PropText (prop ← a design text): range field labels (range.from / range.to moved from app texts to
    design texts) and content-state texts (content.empty / error / stale). contentState lost its `text` value.
18. Design may mark props optional (`optional`, inherited): a button's icon, the logo's inherited icon, search / seek
    options. A new rule says every other prop of a hired free component is fed by a clause or a same-named value.
19. Contract values were widened to feed props by name: item (title, subtitle, image, shape, current, navigable — `item`
    itself went), input (label, min, max), switch (options), navigation (selected), overlay (title, body, confirm,
    cancel, text, action; OverlaySpec.texts is a named object now).
20. backTitle and appBarTitle were the same hire: merged as pageTitle (a new rule flags duplicate hires).
21. Menu items get icons through hires by name (playNowMenuItem, playLastMenuItem, linkMenuItem; icon.link added) —
    the converter had dropped the old icons.
22. The inner sheet's peek height (69) was dropped by the converter: back as design token size.pageSheet.peek, minted by
    the pageSheet hire.
23. Opened pages keep their template in page state (`template`), since composition's page exceptions name templates
    while opened pages are ids like browse/Arcadia.
24. Instance ids are contract-tree keys; the shell makes its own keys only for instances the tree has no node for
    (the peek card, the Dedede circle, dialog buttons) and reads surfaces from the key prefix.
25. Episodes open an episode page (template `episode`, like an album's without the track list); Fresh episodes stays a
    shelf of episodes (Sofia asked for this mid-night). Inside a show's page, tapping an episode now opens its page
    instead of playing it.
26. The 12 old invariants that tested refs, roles, slot paths and repeats are deleted, not ported; the composition rules
    and the contract tree replace them. Later the same night six more went for the same reason (supplied props, role
    slots, surface parts, role events, roleProps, one component per surface role) and "content state components are
    registered" (config no longer names them).
27. An app-bar page may have neither content nor body (api.d.ts comment amended in 18.0.0: "at most one"). The episode
    page is only its header; the alternative was an empty `body: []`, but the shell reads a body as "player-like page"
    (transparent header, no title), which would have changed how it looks.
28. platforms/web.json lists backdropPage, appBarPage, sheetLayer and fullscreenLayer, since composition hires them and
    the web platform draws them. Only appBarPage has a DC of its own (AppBarPage); the other three are drawn by the
    shell's arrangement (BackLayer + FrontLayer, NowPlayingSheet, DededeLayer / AccountLayer) until the one-renderer step.
29. Design `implements` / `accepts` keys are removed: composition alone says what fills a contract. "Interactive" is
    design inheritance (extends interactive), not a role. The Components page's chips now show the contracts composition
    hires each component for.
30. "Every surface a component is placed on provides every colour role" is skipped, not ported: surfaces per contract
    node are not derived yet (the shell reads them from node keys).
31. design/write-generated.mjs writes the design outputs (tokens.css, DesignTokens.kt, every component .d.ts, notes
    from the .md's first paragraph). The token files come out byte-identical; the .d.ts files had been empty since the
    baseline export and now carry their props (tsc --strict: 0 errors). CLAUDE.md's file layout now lists the script
    (a one-line CLAUDE.md edit made without asking, since you said not to ask overnight; revert if unwanted).
32. The renderer question ("is a component id → DC table allowed in the platform?") is decided yes, as platform
    plumbing: it names no look or behaviour, only which file draws a hired free component (web.json already says which
    components the platform implements). The one-renderer step builds on it: node → hire's component → its DC, fed the
    node's props, slots and events. Not started tonight (time).
33. api/api.rs (an unused 11.0.1 Rust snapshot) is deleted as superseded; RUST.md says to generate it when the Rust core
    starts. CLAUDE.md's "How it works" and file layout now describe 18.0 (contracts, composition, the contract tree)
    instead of roles and refs — a CLAUDE.md edit made without asking; revert if unwanted.
34. The icon font is served from the repo (design/assets/fonts: Material Symbols Rounded, the same Google Fonts query
    the DCs linked, all four axes, Apache 2.0) — Sofia asked; it works offline and in headless checks.
35. A DC that draws a design component inside itself gets that component's resolved visuals from the platform as
    `<component>Visuals` (SearchField and SuggestionRow: symbolVisuals). Before, they passed Symbol only a size, so its
    font family resolved to 'undefined' and the glyph showed as the word "search" (old mockup too).
36. Layer headers draw their config (Sofia, 2026-10-09: "today's look except dedede should get back"). The old shell
    ignored parts of it. Config now matches today's look: Dedede's and the Recent / Saved pages' search fields, play
    buttons and action-less ⋮ are removed; Dedede's first page keeps `up` (back arrow) with closeLayer, since up does
    nothing on a layer's first page; composition hires closeButton for Now playing's collapse on wide.

### Switchover (2026-10-09): done, with what is still open
The mockup runs on 18.0 (config + composition + design → contract tree → shell). Checked in headless Chrome against the
pre-switch mockup, same clicks, PNG hashes: 14 of 14 screens pixel-identical (browse, expanded, artist, search,
collection, Now playing, drawer, account, collection ⋮ menu, library panel, desktop browse / rail / Now playing, Library).
Library first looked shifted: its shot was taken 2 s after the tap, while the grid was still animating in; shot at 4 s,
old and new are identical (and all 658 element boxes match to 0.01 px). Motion was not sampled frame by frame.
Layout numbers old vs new: 169 / 169 cases equal. Rules (01:30): 103 pass · 3 skipped · 0 fail (90 invariants + 13
composition). The dev panel's stack readout no longer lists the searching / searchClosed params (find is engine state).
Motion (02:00), measured: Chrome's animation clock slowed 50× (CDP Animation.setPlaybackRate 0.02), same clicks on
the old and new mockup. Play on an album: two runs of the new mockup give identical screenshots at all 5 sample times;
against the old, 3 are identical and 2 differ by 65 pixels in the peek's art square. Sampling that square's box at 8
times (20–160 ms into the motion) gives identical positions in old and new to 0.1 px, so the 65 pixels were the two
screenshots landing at slightly different moments. Last (the header button again): the 58 moving or fixed pieces on
screen match at 6 sample times within 0.1 px (one press ripple). Next (Blue Hours, after playing Arcadia): the 57
moving or fixed pieces match exactly at 6 sample times; the screen before the tap is pixel-identical.
(Virtual time, Emulation.setVirtualTimePolicy, did not pin the animations: two runs of the same code differed.)
Steps: 1 sizes ✓ · 2 core ✓ (navigation, compose, contracts, layout) · 3 API ✓ (api.d.ts 18.0.0; roles / refs / draft
deleted) · 4 config ✓ · 5 shell ✓ (view code reads nodes) — the DCs are unchanged and still take the shell's flattened
fields, not nodes · 6 verify ✓ (screens above).
- Sizes (my call, checked: every size config sets today comes out the same, 24 / 24): Layout reads sizes from design
  through composition — a bar's
  height / expandedHeight is its hire's visual (hire tokens named after a visual override it: personHeader.expandedHeight
  → a new design token for 272); the back layer's basicAction / actions region heights become backLayer visuals (60 /
  56); the panel stays measured by the platform (as today); peek height, side-sheet width, rail width come from the peek /
  side sheet / rail hires. Breakpoints keep compactMax and minContent only (behaviour thresholds). sideMode then needs the
  side-sheet and rail widths: the model gets them as `sizes` at creation (Layout.sizes(specs, composition)).
  core/compose.js sizeOf does it: the hire's own token named after the size, else its free component's visual.
- Shell survey (2026-10-09): no DC receives refs or slot lists; the shell flattens refs into plain view fields (about 70
  calls to resolveRef / expandSlots / roleProps / roleIntent / slotPath, by region: bars 674–779, back layer 791–846,
  content 856–861, layer sheets 929–945, app-bar pages 1004–1020, Now playing 1062–1089, menu / account 1100–1108, nav
  1127–1131, peek 1173–1175). So step 5 rewrites the shell's view-model code; the DCs and the DOM markers motion uses
  (data-occluder, data-fixed, data-shared, data-sheet, data-part, data-peek) can stay. The shell also makes choices of
  its own that belong in composition: app-bar form page / layer (965, 1235), the component per item kind (KIND table
  715, branches 840–846, 1071–1078, 1105–1108); events go through runAction (749–772) and surfaceOf parses slot paths
  (651–658), which the contract tree's path keys replace.

## Open (current)
- 18.0: three rules skip: the two hideOnScroll back-header rules (no deck sets back.hideHeaderOnScroll) and surface
  colour roles (decision 30).
- 18.0: the one-renderer step (node → hire → DC, DCs taking props and slots) is under way. Slice 1 done: header items
  (back, front and app-bar headers) are drawn from their nodes through platforms/web/draw.js — the DC comes from design
  (own DC named after the component; a variant drawn by its parent's), fed the node's props, visuals, interaction,
  events and slots; the item's surface is the nearest drawn ancestor that provides colour roles. The item-kind table
  is gone; Morph draws from its from / to slots (its glyph is the from button's icon, no longer a literal). Slice 2
  done: layer headers (Now playing, Dedede, Account) are drawn from their nodes on their layer's surface; the hand-built
  buttons and the literal more_vert are gone. Sofia chose today's look except Dedede's first page gets back (decision
  36). Still shell-chosen: panel rows, Now
  playing's body, the drawer, nav, peek, overlays, content items, the app-bar form; IconButton still accepts `mark`
  for the nav's logo until the nav slice.
- 18.0: the free-component merge tree is proposed, not applied (69 design components).
- Design checks are not shown on the Invariants page yet (needs Invariants.dc.html).
- Still in the player (ordering, not yet params): detail transition order (out → swap → front move + in → header parts), flight cut sources (top: header / bars above the middle; bottom: peek / nav bar), app-bar sheet start (front layer top), the reveal band shape.
- Components page: no previews yet for FrontLayer, AppBarPage, NowPlayingSheet, UpNextSheet, PeekCard, DededeLayer, AccountLayer.
- PeekCard (wide, side sheet closed) not checked on screen.
- Components page: no AppBarPage preview yet.
- Backdrop detail: header parts that differ still cross-fade (old ghosts fade out after the commit) instead of fading through.
- Non-uniform scale when source and target aspect differ (wide ContentBlock → square header) stretches the art slightly during the flight.
- Local search ✕ uses the field's text colour (could go back to the button grey).
- Layer pages' local searches don't draw the ✕ yet if their header isn't drawn by Bar (Now playing / Settings pages) — check.
