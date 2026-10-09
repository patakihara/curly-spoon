# Backdrop Nav — API

Contract version: 18.0.0 · rules: 90 invariants (api/invariants.js) + 13 composition rules (api/composition-rules.js) · history: CHANGELOG.md

> **Source of truth for the contract: `api/api.d.ts`** (shapes, intents, events, queries, Model) and `api/invariants.js` (rules any implementation must pass).
> This document is the human-readable companion + implementation status.
>
> **Map of the project**
> - `api/api.d.ts` — contract **v18.0.0**: config (F–H), intents and events, state, queries, Layout, contracts and the contract tree, design specs, composition
> - `api/contracts.js` — the contracts as data (config, values, intents, children); `api/gen-contracts.js` writes their TS block into api.d.ts
> - `api/composition-rules.js` — rules for app/composition.json against the contracts and design
> - `CHANGELOG.md` — versions + compatibility policy
> - `api/invariants.js` — 90 rules (property-based; skip when a config lacks a subject)
> - `core/navigation.js` · `core/player.js` · `core/layout.js` · `core/compose.js` (placements, hires, the look) · `core/contracts.js` (the contract tree) — reference core (pure JS)
> - `app/app.json` — the app (AppConfig, plain JSON) · `app/composition.json` — which free component fills each contract (hires, placements)
> - `design/` — the design system (tokens, choreography, one folder per component); `design/load.js` assembles the Specs object (§15); `generated/` — per-platform tokens · `Components.dc.html` — generated preview
> - `platforms/web.json` — what the web shell implements (each platform publishes one; checked by the rules)
> - `app/fake-backend.js` — fake backend data + test fixtures (`bind(config)`)
> - `Invariants.dc.html` — runs the rules · `Backdrop Nav Skeleton.dc.html` — shell (view + motion) on the core
> - `RUST.md` — architecture + how each module maps to a Rust crate

Status: sections marked ✅ are implemented in `Backdrop Nav Skeleton.dc.html`; ⏳ agreed, not yet implemented. Version notes below a section describe the shape at that version — later versions win (see CHANGELOG.md).

## Layers of the model

```
CONFIG  what things are         (fixed per app version)
DATA    what the app fetched    (may be loading / error)
STATE   what the user did       (input, scroll, expanded, stacks)
DERIVED computed, never stored
```

---

## CONFIG

### App ⏳
```
AppConfig {
  decks:  DeckConfig[]      // nav bar / rail: browse, library, search
  layers: LayerConfig[]     // parallel layers: nowPlaying (sheet), Dedede (settings, circular reveal), menu (drawer), account
}

DeckConfig  { id, name, icon, page: BackdropPageConfig, policy: { stack: StatePolicy<StackEntry[]> } }
// e.g. Serere: stack { default: [base page], resetOn: ['deckSwitch'] }   ✅ (implemented as rootSwitch)
// events are delivered to the deck/layer being entered
LayerConfig { id, name, page: PageConfig,              policy: { stack: StatePolicy<StackEntry[]>, open: StatePolicy<bool> }, history: 'record' | 'ignore' }
// nowPlaying: history 'ignore' (system back pops its screens; browser never navigates it)
// Dedede (Settings): history 'record' (both system back and browser back pop its screens; opening it is recorded)
// e.g. nowPlaying: stack { default: [base page], resetOn: ['layerOpen'] }
```

### Routing ⏳
Where a tapped item opens depends only on **where the tap happened** + **current app state** — never on item/content type.
What opens comes from the item itself (`ItemData.opens: PageSpec`).
```
DeckConfig.linkTarget?  / LayerConfig.linkTarget?: 'activeDeck' | { deck: DeckId }   // default 'activeDeck'
// decks: always 'activeDeck' (= their own stack)
// nowPlaying: { deck: <start deck> }   (push, no reset)
```

### Source ⏳
```
Source<T> = T | { dataSource: SourceRef }      // used only where both make sense
Title     = Source<string> | { from: 'item' }
```
Only Bororo's root filter options are fixed; everything else in the mockup comes from a dataSource.

### Pages ✅
```
PageConfig = BackdropPageConfig | AppBarPageConfig
BackdropPageConfig { id, kind: 'backdrop', title, params: Params, back: BackLayerConfig, front: FrontLayerConfig, policy }
AppBarPageConfig   { id, kind: 'appBar',   title, header: AppBarRef, params?: Params, content?: ContentConfig, body?: Slot[], sheet?: PageSheetConfig, policy }
```

### Params ✅ (8.0)
A page holds typed **params**; controls anywhere on the page bind to them. The engine knows only the type.
```
ParamSpec { type: 'choice'|'choices'|'text'|'flag'|'number'|'date', options?: Source<{ value, label }[]>, axis?, range?, min?, max?, step?,
            url?, history?: 'replace'|'pushFirst', data? }
// label?, placeholder?, apply?: 'immediate' | 'onApply' (18.0)
// default + reactions live in statePolicy.params.<name>: { default, resetOn, scope?, on? }
// state: page.params.<name> (applied), page.pending.<name> · paths: 'params.<name>', 'pending.<name>' · data: contentParams(page) = params with data ≠ false
```
- **Param controls** (18.0): a control binds a page param (`{ bind: 'genre', options?, when? }`); rows hold one or more (`{ controls, shows: 'always' | 'expanded', when? }`). Its `paramControl` contract gives value, options (each with `selected`), pending, label / placeholder (the param's) and min / max, and sends setParams / toggleParam / applyParams / discardParams; composition places a component by the param's spec (and `options: true` when the control brings its own choices: search suggestions). `apply: 'onApply'` keeps changes in the page's `pending` until applyParams.
- **Repeats**: `{ repeat: Source<unknown[]> | { options: 'f' }, as: 's', ref }` — one ref per element, `$s` usable in its props / action.
- **Intents**: `setParams { values, page?, apply? }` · `toggleParam { name, option }` · `resetParams { names? }` · `applyParams { names? }` · `discardParams { names? }`. Event `paramChanged { name, axis, direction }` (applied changes only).
- **Reactions** (policy): `resetOn: ['paramChange' | { paramChange: name }]`, `on: [{ event, set }]` (e.g. expand while typing). A param never reacts to its own change.
- **URL** (`routes.params`): `;name=value` per url param off its default; codec per type, invalid values ignored. `pushFirst`: leaving the default pushes; back returns it to the default.

### Back layer ✅ (18.0: fixed regions)
```
BackLayerConfig { header: HeaderConfig, actions?: ButtonItem[], paramControls?: ParamControlRowConfig[], toggleOnTap?, hideHeaderOnScroll? }
// regions are fixed: header · actions · controls ('always' rows) · panel ('expanded' rows). Heights are design (through composition); the panel is measured.
```

### Front layer ✅
```
FrontLayerConfig { header: FrontHeaderConfig, collapse: 'partial' | 'full', content: ContentConfig }
ContentConfig { dataSource, params?, view?: ParamName, presentations: PresentationConfig[] }   // presentations: a named list; composition picks the layout and item component per presentation key
```

### Headers ✅ (18.0: one HeaderConfig, items as data)
`HeaderConfig { items: HeaderItem[], detail? }` serves the back layer, app bars and the peek; the front header adds a title, and its disclosure is built in. Items are plain data — `button · logo · text · switch · find` in headers, `button · text · detail · seek` in bodies — each with a `name`, so composition can place a component by kind or name. Items whose `when` fails stay drawn, hidden (`shown: false`). A logo may carry an `action`; whether its press sends it is composition's call (compact only in the sample app).

### Policy ✅ (metastate config — mirrors state shape)
```
StatePolicy<T> { default: T, resetOn: LifecycleEvent[], scope?: StatePath | null, on?: { event, set }[] }   // scope e.g. 'params.tab'
BackdropPageStatePolicy { params: { [name]: StatePolicy }, back: { expanded, headerHidden? }, front: { scroll } }
LifecycleEvent = enter · return · reselect · paramChange | { paramChange: name } · baseSwitch ⊃ { deckSwitch, layerOpen, layerClose }
```

---

## DATA ⏳
```
ContentData { status: 'loading'|'ready'|'error', items: ItemData[], total? }
TabsData    { status, labels }
FiltersData { status, options }
ItemData    { id, title, tag, opens: PageSpec }
// keyed by dataSource + params; fixed Source values resolve as { status: 'ready', value }
```

---

## STATE

```
AppState   { activeDeck, focus: DeckId | LayerId, decks: { [id]: DeckState }, layers: { [id]: LayerState }, history: NavRecord[] }   ✅
NavRecord  { target: DeckId | LayerId, kind: 'push' | 'deckSwitch' | 'layerOpen' }   ⏳
// focus = whatever was last interacted with (also when a layer is beside the decks)
DeckState  { stack: StackEntry[] }
LayerState { open: bool, stack: StackEntry[] }                                         ⏳
StackEntry { page: PageState, openedFrom: ItemRef | null }   ✅

PageState = BackdropPageState | AppBarPageState
PageStateBase<C>  { config: C, opener?, template?, params }                 (18.0: shared by both)
BackdropPageState extends PageStateBase { back: BackLayerState, front: FrontLayerState }   ✅
AppBarPageState   extends PageStateBase { scroll, sheet?: PageSheetState, find? }        ✅

BackLayerState  { expanded: bool, headerHidden? }          ✅
FrontLayerState { scroll }                                ✅  (scoped fields are maps by scope key; scroll written without re-render)
PageState.params { [name]: ParamValue }                   ✅  (8.0)

---

## DERIVED
```
isDeckBase      = stack index === 0
showBack        = stack.length > 1
frontPosition   = back.expanded ? config.front.collapse : 'expanded'
frontTop        = full ? screenH - headerH : height(layouts[back.expanded ? 'expanded' : 'concealed'])
visibleItems    = select(contentData.items, input)
trackingHeader  = { visible: scroll > 0, text: titleOf(itemAt(scroll + headerH)) }
presentation(layer) = layout.fits(sideBySide) ? 'beside' : 'over'
resolve(Source<T>)  → { status, value }
```

## Navigation ⏳
```
navigate(item, origin):
  target = origin.linkTarget ?? 'activeDeck'
  deck   = target == 'activeDeck' ? activeDeck : target.deck
  push(decks[deck], newPage(item.opens, item))        // no reset
  activeDeck = deck
  if origin is a layer presented 'over': origin.open = false
```

## Layer presentation ✅
```
LayerPresentation =
  | { kind: 'sheet'
      compact: { form: 'bottomSheet', peek: { height: 48, header: Header }, hidesNavBarWhenOpen: true }
      wide:    { form: 'sideSheet', width: 320,
                 peek: { form: 'floatingCard', height: 48, maxWidth: 500, align: 'contentCenter', persistsWhenOpen: true, header: Header } }
      // wide side mode (derived): room → 'beside'; else touch → 'modal', pointer → 'auto' (edge handle, hover in/out)
    }
  | { kind: 'fullscreen', hidesNavBar: false }  // Dedede; compact: covers nav bar + peek (no slide); wide: rail stays visible; never covers a beside sheet; opened from logo (header on compact, rail bottom on wide)
```
Devices: { w, touch } — touch → back = Android = browser (history trick); pointer → browser history.

## Back ✅
Depends on layout:
- **compact (mobile):** browser back = phone back. Implemented with the history trick; the entries are *derived from state*
  (deck ≠ start deck, each pushed deck page, expanded back layer, open layers and their pages) — no separate bookkeeping.
- **wide:** browser back walks recorded `history: NavRecord[]` (layers with history 'ignore' never enter it).
```
back (compact):
  t = focus
  layer t open:  pop its stack, else close it
  deck:          top is backdrop & expanded → conceal; else stack > 1 → pop; else not start deck → start deck; else exit

back (wide):
  r = history.pop(); undo(r)     // pop push (restore prevDeck) / revert deckSwitch / close layer / pop layer
```
Note: Chrome skips history entries created without user activation, so the trick creates each entry at tap time.

## Open questions
- (resolved) Nonono became the Now playing layer: an app-bar page with an inner sheet; its ⋮ opens Recently played / Saved.
- (resolved) Dedede (Settings) records history; Now playing ignores it.


## §20 Interactive components
Every actionable component (one that extends `interactive` in design) implements `InteractiveComponent { id, component, action, label }`.
`action` is `{ nav: Intent } | { player: PlayerIntent } | { shell: ShellActionId } | null`.
State is never set by the component — `resolveInteraction(action, input, env)` (core/interaction.js) derives it:
- available iff nav → `model.query.supports`, player → `player.supports` (transport needs a current track), shell → listed in `env.shellActions`; `null` = not built.
- unavailable ⇒ `disabled` (flags off, not focusable, activation ignored). Idempotent actions stay enabled.
- otherwise `pressed > keyboardFocus > focus > hover > enabled`; hover never on touch; `keyboardFocus` = focus-visible.
- shells report raw `InteractionInput` and draw `resolveVisuals(specs, component, state)` (state layer, focus ring, disabled opacity).

## Reselect
Tapping the active deck's nav item: deeper than base → pop to base (`return` fires, `popped` with `depth`); at base → lifecycle event `reselect` fires on the base page. What it does is policy: the sample resets `front.scroll` (smooth scroll to top) and `back.expanded`.

## Tabs
A choice param with `axis: true` (tabs) emits `paramChanged { axis: true, direction }` (sign of the option index change). Specs map `paramChanged · axis` to `sharedAxis`; other param changes are instant.

## What fills a contract (18.0)
Config never names a component. Each drawn config object meets a **contract** (api/contracts.js: its config, the values the engine gives it, the intents it can send, its children). **Composition** (app/composition.json) hires one free design component per contract: a hire's clauses feed the component's props from contract values, fixed tokens or design texts, send its events as intents or the item's action, and fill its slots from children. Placements pick the hire by contract, nearest ancestor (`within`), kind / name, param, presentation, state, overlay kind and layout class; page exceptions, keyed by template, come first.
- The contract tree (core/contracts.js `contractTree`) holds this moment's nodes: `{ key, contract, at, values, children, hire, component, props, slots, events, shown? }`. Its keys identify instances, so hover, press and focus never travel between pages.
- Platforms draw nodes. Each publishes `{ platform, implements: [...] }`; the rules check that every component composition hires is implemented on every platform (a variant counts where its parent does).

## Component inheritance
A component can `extends` another: it inherits props, optional props, states and visuals, and stores only what differs. A `variant` has no code of its own — its parent's implementation draws it with the child's values. "Interactive" components (state layer, ripple, focus) are those that extend `interactive`.

## 3.0.0 — surfaces, variants, layout from data
- **Surfaces** (`backLayer`, `frontLayer`, `appBar`, sheets, nav, dialog, snackbar) declare `provides`: colour roles such as `content`, `contentVariant`, `focusRing`. Components ask for a role (`{ "role": "contentVariant" }`), never a hex — the same icon button is white on the back layer and dark on an app bar. A rule checks every surface provides the roles of what is placed on it.
- **Variants**: a component declares axes (`iconButton.variants.size: xs…xl`), a placement picks one (`"variant": { "size": "md" }`), visuals choose by it (`{ "variant": "size", "cases": { … } }`).
- **Conditions in design**: `frontLayer.cornerTR` = `{ "if": { "env": "sheet", "equals": "beside" }, "then": 0, "else": "{radius.frontLayer}" }`.
- **Navigation per layout class** is config: `"navigation": { "compact": { "component": "navBar" }, "wide": { "component": "navRail" } }`.
- **Motion**: shells take every duration and easing from `transitionFor` (choreography). The mockup has no timings of its own.

## 3.1 — status states
A control has an interaction state (enabled … keyboardFocus) **and** a set of statuses: `selected` (its action targets what is current — active deck, current tab, active filter), `busy` (its effect is in progress — blocks activation, not disabled), `error`, `checked` / `indeterminate` (`ComponentRef.checked`), `dragged`. Design visuals key on them: `chip.fill: { default: transparent, selected: { role: content } }`.

## 4.0 — back layer, header hiding, URL input
- (superseded: 13.0 moved the caret to the front header, 14.0 to its start side; 10.0 replaced matrix URLs with query strings.)
- The back layer header always ends in the **disclosure** caret (role `disclosure`); it turns with `back.expanded`. Tapping the back layer anywhere that isn't a control toggles it (`toggleOnTap`).
- **Panels** are slots: `{ kind: 'panel', content: [ { component: 'panelRow', props: {…}, when: { path: 'back.input.active', includes: 'Tag X' } } ] }`.
- **App-bar children**: the front layer grows over the content, then fades through (`expandSurface`).
- **URL** carries basic-action input: `/bororo;f=Tag%20X/Bororo%20A1;q=x`. Input changes replace the URL; a search starting pushes, and back clears it first.

## 5.0 — back header hides on scroll, content-sized panels
- `BackLayerHeader.visible: 'hideOnScroll'`: the back-layer header slides away while the front layer scrolls down; the regions and the front layer move up into its space. Front headers never hide.
- `panel.height: 'content'`: the shell measures the panel and passes `measured` to `regions` / `frontLayer`; the front layer stops where its own header would be covered.

## 6.0 — motion is design
- The API only fixes the shape: `{ kind, …params }`. **Motion kinds** are declared in `design/motions/<id>.json` (params + defaults + reduced form); platforms list the kinds they implement (`platforms/web.json`).
- **Event motion**: `choreography.json` maps model events to a motion + params (`transitionFor`).
- **Component motion**: a component's `motion` says how a visual animates when it changes (`stateLayer: fade`, `rotation: rotate`) or what an input triggers (`press: ripple`) — `motionFor`.
- Adding a motion or a parameter (e.g. `scaleIn`) is a design change, not an API release.

## 7.0 — launch, texts, placeholders ✅
- **Launch**: with `AppConfig.launch` the app starts in `launch: 'starting'` on the splash component; the shell sends `launched` once state is restored and first data is in (not before `minMs`). The `launched` event's choreography (design motion `enterApp`) takes the splash to the app: the logo moves onto the app's logo, then back → front → navigation + peek come in. Sign-in / onboarding gates use `sessionChanged` the same way; leaving the app for a gate is a fade through. Since 7.1 a choreography rule can match `sessionChanged` by `signedIn` (the session after the change).
- **Texts**: every app-owned string is a `TextRef` (`{ text, args? }`, ICU subset). `Queries.text` resolves in `prefs.locale`, then the default locale, then the id. `Queries.dir` gives the locale's direction; it is also the `dir` env condition. Shells mirror logical motion directions in RTL.
- **Placeholders**: while content loads, `ContentView.placeholders` says how many items to draw in the item component's `placeholder` form (design). Data components (item, filterChips, tabBar) must declare one.
- **Corners**: `expandSurface.cornerTo` — the surface's corners at the end of the growth. The web shell clips the page (and a surface beneath the front layer) to one shape animating from the front layer's rect and corners to the content area.

## 8.0 — params ✅
- The back layer no longer defines filters / tabs / search. Pages hold typed **params**; any slot binds a control to one (role `input`). Header, basic action and panels are just regions of a strict `RegionSet`.
- One `Bar` shape for every header. Repeats, policy reactions (`on`), draft vs submit binds and generic derived values (`count`, `summary`) make search predictions on top of filters expressible without engine changes.
- Types: choice · choices · text · flag · number · date (number / date as ranges). URL codec per type; tab URLs now carry the option value (`;tab=B`).

## 9.0 — presentation ✅
- How items are drawn is design: `presentations` map option values of a `view` param (or 'default') to a layout component + an item component. List / grid / scroller are just layouts; switching is a bound control (`viewSwitch`), not an intent.
- Responsive grid (design + platform): `gridLayout` visuals `minColumnWidth` (per layout class), `maxColumns`, `gap`; the web fills `repeat(auto-fill, minmax(…, 1fr))`, capped at maxColumns.

## 10.0 — URLs ✅
- One destination per URL: `/bororo/bororo-a1?f=tag-x` (deck stack + top-page params) · `/dedede/fliboo` (recorded layer) · `/sign-in` (gate).
- Lowercase slugs, '-' for spaces and other separators, case-insensitive matching; text values lowercased, spaces as '+'. Only the top page's url params.

## 11.0 — items are content, param motion by name ✅
- `ItemData { id, opens, …fields }`; presentation items bind `$item.<field>` and carry their own action (play). Role item supplies `navigable` only.
- `ParamSpec.motion` names a choreography rule (`slide`, `swap`, `default`); `axis` only gives the direction. Tabs that fade: `axis: true, motion: 'swap'`.
- `nowPlaying`: a design component, implemented per platform against its player.
- Types: every object shape is named; unions list named members.

## 12.0 — page templates ✅
- Items say `opens: { template: 'person' }`; the app's `pages` define them. The opened page reads its item through `$opener.<field>` (title, content params, menus).
- `paramReselect`: picking the current option again (active tab) can drive policy reactions.

## 13.0 — component interfaces, player in config ✅
- **Roles declare slots.** A header is a ref: `{ "component": "frontHeader", "slots": { "start": [], "title": [ … ], "end": [ …, caret ], "fab": [ … ] } }`. Roles: bar (back header regions, `expanded` slot), frontHeader (start begins with the disclosure, `fab`), appBar (`expanded`, `fab`), peek, layout, fab, content states, splash, overlay. Rule: every role-typed ref declares the role's slots, slot refs implement the slot's roles, `max` counts refs shown at once, `last` names the closing role.
- **Front header** always shows and starts with the caret (14.0). Back headers end in whatever the config puts there (sample: user button).
- **Player state**: `$player.current.title`, `{ player: 'queue', of: '$opener.tracks', equals: 'contains' }`, `bind: { player: 'positionMs' }` (seek). FAB: three refs in one `fab` slot with exclusive `when`s (play → `[playQueue, openLayer nowPlaying]`, play next, add to queue).
- **Local search** = `morph` (from: icon, to: field). `morphed` = scrolled ∨ `params.searching` ∨ find ≠ ''. `searching` resets on `scrollTop`.
- **Groups**: `presentations.grid.groups = [{ by: '$item.title', key: 'initial', when: sort = name, header, index }, { by: '$item.year', key: 'decade', when: sort = year }]`.
- **Inner sheet** (app-bar page): `sheet { peekHeight, header, content }`; state `page.sheet.expanded`; back collapses it first.
- **Drawer** layers: `{ kind: 'drawer', side: 'start', width, scrim }`.

## 14.0 / 14.1 — caret first, rail drawer ✅
- `SlotContract.first`: the front header's start slot begins with the disclosure (caret).
- `DrawerPresentation.wide?: 'modal' | 'rail'` — 'rail': on wide layouts the menu layer is the navigation rail expanding in place (not modal; pushes the content). Condition `LayerOpen { layer, open }`; BackAction `closeDrawer`.

## Web shell: one DC per design component
The web shell (Backdrop Nav Skeleton) only arranges component instances; every drawn piece is a component `.dc.html` fed its resolved visuals (design) and props (config + core). Surfaces read fills, scrims and shadows from their design visuals. List: platforms/web.json; status: docs/NOTES.md. Motion players: `platforms/web/motions.js` (one per motion kind; reads only the design's resolved descriptor). `platforms/lint-web.js` checks the shell and the motion runtime hold no look-and-feel literals (Invariants.dc.html, "Platform check").

## 14.2 — app bar bottom slot ✅
- Role `appBar` gains slot `bottom` (optional, any roles): a row at the bottom edge of the bar that stays when it collapses. The sample album page puts its search (morph, span 'row') and play buttons (were FABs) there; start is ✕ (up).
- Design (appBar page form): top row topHeight 64 on back-layer colours; below it a sheet (front-layer fill + top corners) holding the album info and the bottom row; the bar shrinks from expandedHeight (268) to height (208 = 64 + 144) on scroll. The info stays and its artwork shrinks to infoArtMin.

## 15.0 — collapse-first scroll ✅
- A page's `scroll` collapses its bar first: 0 … `BarView.distance` (expandedHeight − height) shrinks the bar while the content stays put (the page grows); past it the content scrolls by `Layout.contentOffset` = scroll − distance. Scrolling back, the content returns to its top first, then the bar expands. Pages without an expanded slot: distance 0, unchanged. Detail pages no longer need extra scroll room.

## 14.3 — queued event ✅
- A playQueue (now) or enqueue (next | last) that takes effect yields `{ type: 'queued', position, count, from }` (core `playerAction`); choreography rules match `{ event: 'queued', position }`. Sample design: dropIntoPeek — the item's image drops into the Now playing peek (onto its image · beside it then tucked behind · after its last control).

## 16.0 — component contracts (replaced by 18.0: roles, refs and slot paths are gone)
- A **contract** is the minimum config and the engine rely on: what a component is supplied from state, what its events become, which slots (refs) or parts (page / surface config fields) it has. A design component may declare more (extra slots); config may use those only on that component. Motion is not part of a contract (parts that motions name are design).
- **Typed refs** replace `SlotRef<R>` (removed): `BarRef`, `FrontHeaderRef`, `AppBarRef`, `PeekRef`, `NavigationRef`, `LayoutRef`, `ItemRef` with typed minimum slots (`BarSlots` …). JSON unchanged.
- **Page / surface roles**: backdropPage · backLayer · frontLayer · appBarPage · pageSheet · sheetLayer · drawerLayer · fullscreenLayer. Their parts are the config's own fields (`Role.parts`, `PartContract { field, role?, optional? }`). Design registers exactly one component per role (`Layout.componentFor`); config doesn't name it.
- **§M2**: per-role `…Supplies` (from state, `roleProps`) and `…Events` (each names the intent it becomes, `roleIntent`). Positions, heights and offsets stay Layout outputs (regions, frontLayer, barView, contentOffset). `activate` runs the ref's action (§20).
- `SlotContext.layer` for layer roles.
- **One source for roles**: `api/roles.js` (data: supplies, emits, slots, parts, ts type names). core re-exports it; §M2 is generated from it (`api/gen-roles.js`). Edit roles there, then regenerate.

## 17.0 — motion as steps (in progress)
- A choreography rule is a list of steps: `tween` (a piece's properties), `travel` (a copy flies to another piece), `swap` (fade through around the state change, matching old / new pieces), `reveal` (shown through a moving shape); `use` runs a named sequence. Steps name pieces (contract slots / parts, component parts, source / target), measure geometry after the commit, pick values by event fields, and run on time (anchored to other steps) or on progress (bar collapse, scroll). Platforms implement the four blocks once.
- Until every motion is ported, a `kind` step plays a hand-built motion kind (temporary).

## 18.0 — component contracts, from scratch
- Config says what exists, as plain data (items, fixed back-layer regions, one header config, named presentations and overlay texts); no components, slots, sides, heights or widths.
- Contracts as data (api/contracts.js) generate their TS; composition hires free components for them; the contract tree joins state, config and composition.
- Layout reads sizes through composition (a Look, core/compose.js `lookAt`); createModel takes `sizes`.
- Local search open / closed is engine state (`find`, intents openFind / closeFind).
- Removed: roles, refs, SlotPath, region layouts, ScreenSpec, Layout.componentFor, `resolveRef` / `expandSlots` / `slotPath` / `roleProps` / `roleIntent`; design `implements` / `accepts`.
