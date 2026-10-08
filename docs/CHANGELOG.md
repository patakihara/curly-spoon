# Contract changelog

Compatibility policy (semver on `api/api.d.ts`):
- **Patch** — comments, docs, rule wording; no shape or behaviour change.
- **Minor** — additive and optional only: new optional fields, intents, events, queries, specs keys, rules that existing configs already pass.
- **Major** — anything else: removals, renames, changed meaning, newly required fields, rules that can fail existing configs.
- Implementations reject config / specs / snapshots whose **major** differs from theirs (checked by invariants).
- Each release bumps `CONTRACT_VERSION` (api.d.ts + model) and `contractVersion` in config and specs.

_Shipped alongside 14.2 (no contract change):_ web shell: every drawn piece is a component DC (TabBar, FilterChips, SearchField, Dropdown, RangeField, SuggestionRow, Placeholder, StaleBanner, EmptyState, Carousel, Menu, Dialog, Snackbar, DrawerItem, Artwork, TrackInfo, SeekBar, Row, Bar, EdgeHandle, NavBar, NavRail, Drawer, Scrim, SignIn, Splash). Design: their sizes / colours as visuals; new tokens (color.backLayerDivider, backLayerFill, onSurfaceMuted, onSurfaceFaint, onSurfaceSubtle, surfaceVariant, surfaceRaised, handle, scrim, scrimLight, inverseSurface, onInverseSurface); new component `drawer`; variants tabBar tone, fab tone, appBar form, drawerItem size, emptyState size; errorState is a variant of emptyState. App: transport play button `tone: ink`. Motion: expandFromItem is a content fade through + shared image (both directions), no growing surface; params scope, split, easingOut, easingIn, scaleIn, sharedMs, sharedEasing (expandSurface gets sharedMs / sharedEasing). Web motion runtime `platforms/web/motions.js` (incl. state-driven CSS transitions, pulse — design params low / stagger; app-bar page collapses into another deck's front layer) (all motion players moved out of the shell; data-shared markers on item images). Platform check `platforms/lint-web.js` (hard-coded look-and-feel values in the web shell; run by Invariants.dc.html) — clean. Design: visuals contentBlock.artRadius, listRow.thumbRadius, menu.handleRadius (were literals in the DCs). Fake backend: generated catalog filler for scroll testing. Rules unchanged (102). (Older unreleased notes — catalog restructure, enterApp, logo — shipped with 7.x–13.0.)

_Unreleased (no contract change):_ shared image: plain morph from the source as it is to the target at rest (rect, radius, clip measured once; sharedArc / sharedEscape removed; Bar / NavBar / NowPlaying mark data-occluder); dropIntoPeek: one parabolic throw, goes up first (apex at the original's top or minFallHeight above the destination), eased run (throwMs / throwEasing; slide / fall / shrink timings and corner removed), empty peek art waits for the landing, the landed image bounces with the peek (fallMs removed); demo slow motion (side panel slider; motions.js × 2^step); localSearch `end` slot with ✕ (config, all 13 morphs; page param searchClosed keeps it shut while scrolled); artist push staggers header → actions → filters (enterDelay / enterStagger / enterMs / enterDistance / enterEasing).

_Unreleased (no contract change):_ web: the shell draws no UI itself — FrontLayer, AppBarPage, NowPlayingSheet, UpNextSheet, PeekCard, DededeLayer, AccountLayer DCs; content runs under the peek / nav bar; one fade through for detail / app-bar push and pop; app-bar push: only the sheet moves (revealBand); dropIntoPeek semicircle path. Design: motion params fadeMs (expandFromItem), revealBand (expandSurface), msPerPx / riseHeight / cutOverlap (dropIntoPeek). API comment header version fixed (15.0.0). Design checks (design/checks.js): motion params all valued; component parts (design) + manifest parts (platform). Player keyframe positions / order → dropIntoPeek / fade params.

## 18.0.0 — component contracts, from scratch (major — branch component-contracts-switch, not released)
- Plan, decisions to review and what is open: docs/NOTES.md "Component contracts, from scratch".
- Config says what exists, as plain data: items (button · logo · text · switch · find · detail · seek) instead of ref
  trees; no slots, sides, heights or widths (Breakpoints.railWidth, drawer side / width, peek heights, side-sheet width
  go to design); the back layer has fixed regions (header · actions · basicAction · panel); one header config for back
  layer, app bar and peek; presentations and content params are named lists; overlays have named texts and button items;
  DeckConfig.icon, LaunchConfig.splash, contentStates and NavigationConfig refs leave config.
- Local search state is engine state: FrontState.find / AppBarPageState.find, FindPolicy, intents openFind / closeFind.
- Contracts (api/contracts.js, single source; api/gen-contracts.js writes section M2): what each drawn config object
  offers — config, values (State, queries, Layout), intents, children. The contract tree (core/contracts.js) holds this
  moment's nodes with the hire composition picked: free component, props, slots, events.
- Composition (app/composition.json, section Q): hires (one free component for one contract, clauses, variant picks,
  tokens aliasing design tokens) and placements (by contract, within, kind / name, param, presentation, state, overlay,
  env; page exceptions first). Clauses: PropFrom, PropFixed, PropText, PropByValue, EventTo, SlotFrom.
- Layout reads sizes through composition (a Look: core/compose.js lookAt); createModel takes `sizes` (Layout.sizes).
- Queries: value / resolved / playerView added; resolveRef, expandSlots, slotPath, roleProps, roleIntent removed.
- Removed: roles (api/roles.js, gen-roles.js, ROLES), refs and typed refs, SlotPath, regions / layouts, ScreenSpec,
  Layout.componentFor, ContentView component ids. ItemData gains entries; page states gain template.
- Design: icon tokens; events, slots and optional props on free components; navBar / navRail destinations and menu items
  are slots; detailHeader gains peek / player layouts; size tokens and visuals that config held; range texts move to
  design texts.
- Rules: api/composition-rules.js (13, all pass) runs on the Invariants page; 12 ref / role invariants deleted; 11 old
  invariants still to port (fail).

## 17.0.0 — motion as steps (major, in progress)
- API (§N): choreography says which piece does what, when. Four blocks every platform implements once: `TweenStep` (props of a piece: opacity, translate, scale, size, radius, colour, shadow, clip, scroll, visibility; keyframes, stagger, loop, hold), `TravelStep` (a copy flies to another piece / measure; path straight | arc; end vanish | join; from whole | visible with `cutBy`), `SwapStep` (fade through around the commit; match slot+content; enter stagger; axis), `RevealStep` (circle · rect → rect · follow an edge). `UseStep` + `Choreography.sequences` (named step lists with params). Pieces: `PieceRef` ('<role>.<slot|part>' · '<component>.<part>' · source / target · a step id; '[]' lists). Measures (`RectOf`, `EdgeOf`, `DistanceOf`, `CentreOn`, `PressPoint`, `ScrollInto`), `ByEvent` (an event field picks), clocks (`TimeClock` with `Anchor` on other steps · `ProgressClock` on bar / scroll / contentOffset — input-driven, applied directly), `MotionCondition` (+ `EventIs`). `ChoreoRule { on, steps, reduced? }`, `Choreography { rules, reduced, sequences? }` (was transition / reducedMotion). `ComponentDef.motion: Record<string, Step[]>`, `ComponentDef.parts`. `QueuedPattern` joins ChoreoPattern; a pattern matches only when every field it gives agrees (core ignored queued `position` before). Layout `stepsFor`, `componentSteps`. Also: `rotate` prop and component visuals as props (`PropTracks` keys); `FromValue` ('current' · 'previous'); `Wander` (roaming value, level meter); `Loop.period` (per item); `PieceShown` condition; `StepTrigger` on tween / reveal (component motion: change · press · release · loop); pieces `origin`, '<component>' (its visible instance), '@before' / '@after'. Removed: `MotionTemplate`, `TransitionTemplate`.
- Renamed `PageSheet` → `PageSheetConfig` (a Config type; the role id `pageSheet` is unchanged). Type-only, JSON unchanged.
- Temporary until every motion is ported (removed within 17.0): `KindStep` (a hand-built kind + its params), `Specs.motions` / `MotionRegistry`, `PlatformManifest.motions`, `Layout.transitionFor` / `motionFor` (the first KindStep, for the current player).
- Design: every rule / component motion is one KindStep (same kinds, same values); appBar `parts` removed (workaround names); parts declared for splash (logo), logo (bars), signInPage (logo), trackInfo (title, subtitle), artwork / detailHeader / listItem (image, inherited by listRow, gridCard, contentBlock, carousel), symbol (glyph) — load.js inherits parts; expandSurface fadeParts / slideParts no longer typed as appBar parts; checks.js keeps only the kind-param check. Manifest `parts` removed. Specs Editor / overrides edit a rule's KindStep.
- Rules: 110 → 112 — pieces / anchors / sequences in steps resolve; a pattern matches only when all its fields agree (queued position). Event list includes queued. 109 pass · 2 skipped · 1 fail (web manifest: backdropPage).
- Next: generic player for the four blocks (platforms/web/motions.js), then port dropIntoPeek → shared image → detail push / pop → app-bar push → the rest as steps, measured frame by frame; then remove KindStep and the temporary types.

## 16.0.0 — component contracts (major)
- API: contracts are minimums (what config and the engine rely on); components may declare more. Typed refs `BarRef` · `FrontHeaderRef` · `AppBarRef` · `PeekRef` · `NavigationRef` · `LayoutRef` · `ItemRef` (+ `BarSlots`, `FrontHeaderSlots`, `AppBarSlots`, `PeekSlots`, `ExtraSlots`) replace `SlotRef<R>` (removed) in config fields and `ScreenSpec.header`. New roles backdropPage · backLayer · frontLayer · appBarPage · pageSheet · sheetLayer · drawerLayer · fullscreenLayer; `Role.parts` / `PartContract` / `ConfigPath`. New §M2: `…Supplies` and `…Events` per role. `SlotContext.layer`; `Layout.componentFor`. Config JSON unchanged (contractVersion only).
- Core: ROLES gains the 8 roles; roleProps supplies backLayer / frontLayer / pageSheet / layer props; roleIntent maps overlay close, retry (content states, frontLayer, appBarPage), backLayer toggle (toggleOnTap), pageSheet toggle, scroll, sheetLayer open / close, drawerLayer close. layout.frontLayer reads the component implementing frontLayer (was the name 'frontLayer').
- Rules: 105 → 110 — exactly one design component per page / surface role used; parts named by roles exist and implement their role; every role event maps to an intent (activate excepted); surface props mirror state. Relaxed: a ref may use extra slots its component declares. Extended: surface components count as used by the config (platform rule).
- Design: implements on backLayer, frontLayer, bottomSheet (pageSheet), drawer (drawerLayer), with their supplied props; new components backdropPage, appBarPage, sheetLayer, fullscreenLayer (no visuals yet).
- Roles have one source: `api/roles.js` (data). core re-exports it as ROLES; api.d.ts §M2 (`…Supplies` / `…Events` per role) is generated from it by `api/gen-roles.js` (between `roles:generated` markers); the hand-written role table in §F is gone. `Role.ts` (`RoleTypes`: type names for generation) and `Role.note`. Rule +1: roleProps supplies exactly each role's declared props (bar / appBar / layout excepted: Layout / Queries give them). Rules 110.
- Open: web manifest does not implement backdropPage / appBarPage / sheetLayer / fullscreenLayer (rule fails: 1).

## 15.0.0 — collapse-first scroll (major)
- API (changed meaning): a page's `scroll` (FrontState.scroll / AppBarPageState.scroll) is collapse-first — 0 … distance collapses the bar while the content stays put (the page grows); beyond it the content scrolls by scroll − distance; back up, the content returns first, then the bar expands. `BarView.distance` (+), `Layout.contentOffset(page, specs)` (+). Stored scroll values from 14.x mean something else → major.
- Rules: +2 (105) — barView.distance and progress 1 at scroll = distance; contentOffset 0 until collapsed, then scroll − distance.
- Web: wheel / touch collapse or expand the bar before the content scrolls; native scrolling only past the collapse; restores split scroll into collapse + content offset. The extra scroll room on detail pages (min-height + collapse distance) is gone; the padding behind the peek / nav bar stays.

## 14.3.0 — queued event (minor)
- API: `QueuedEvent { type: 'queued'; position: 'now' | 'next' | 'last'; count; from }` in ModelEvent; `playerAction(player, intent, from)` → { commands, events } (core/interaction.js). Rules: +1 (103).
- Design: motion kind `dropIntoPeek` (shrink · slide · fall · bounce · make room · tuck + shadow · hold · close); choreography rules for queued now / next / last.
- Config: play buttons (album bottom row, artist actions region) no longer open the Now playing sheet, so the drop into the peek is seen; artist page FAB → `actions` back region (Play / Next / Last, button tone inverse); front headers 48 (no FABs).
- Design: button variant `tone` (inverse), button `icon`; appBar sheetShadow.
- Web: motions.js dropIntoPeek; NowPlaying marks its parts (data-peek); shell runs player actions through playerAction; warm-up of SearchField / SuggestionRow.

## 14.2.0 — app bar bottom slot (minor)
- API: role appBar slot `bottom` (optional). Core ROLES updated; rules unchanged (102).
- Config: collection page — ✕ instead of ←, search + play buttons in `bottom` (fab slot no longer used there).
- Design: appBar page form = top row (64, back-layer colours) + sheet (front-layer fill, corners) shrinking to 144; visuals topHeight, sheetFill, sheetRadius, sheetShadow, sheetPadTop, bottomRowHeight / PadX / Gap, infoArtMin, infoPadBottom; morph span 'row'. Removed detailFade, titleFadeFrom, scrolledShadow use for the page form.
- Config: play/pause conditions treat 'loading' as playing (no flash when switching songs).
- Web: AppBarSheet.dc.html; top-row icons on back-layer colours; push/pop surface lands on the sheet, not the top; the shell measures the row's buttons to size the field.

## 14.1.0 — 2026-10-05
- Condition `LayerOpen { layer, open }`. `DrawerPresentation.wide?: 'modal' | 'rail'` — 'rail': on wide layouts the drawer layer is the navigation rail expanding in place (not modal: joins the focus order, pushes the content). BackAction `closeDrawer`: back closes an open drawer first, on touch and pointer. Additive → minor.
- Rules: 100 → 102 (rail-form drawer joins focus order and closes on back; LayerOpen follows layer state). Two existing rules exempt rail-form drawers on wide.
- App: menu layer `wide: 'rail'`; rail top = hamburger (menu ⇄ menu_open by LayerOpen), bottom = Settings / Account; the logo stays in the back header on every layout. Design: navRail `expanded`, `width` 80 / `expandedWidth` 240, width motion; listItem keeps scale 1 when pressed (ink fills large surfaces).

## 14.0.0 — 2026-10-05 (breaking)
- `SlotContract.first`. Role frontHeader: `start { first: 'disclosure' }`, `end {}` (was `end { last: 'disclosure' }`) — the caret is on the start side. Rules updated (count unchanged: 100).
- App: carets moved to the front header's start (xs); peek back to 48. Design: front header 48px (40 briefly, reverted), app bar 56; `size.fab.edge` (20) added only to bars holding a FAB; FAB circular, under the last end item; hamburger `edge: start` is out of flow, half off the screen edge.
- Core (no shape change): an expanded back layer keeps the detail info (bar progress from scroll only).

## 13.0.0 — 2026-10-05 (breaking)
- **Roles are component interfaces.** `Role.slots` (`SlotContract`: roles, min, max, last). New roles: bar · frontHeader · appBar · peek · fab · layout · emptyState · errorState · staleBanner · splash · overlay. Removed `Bar`: every header is a role-typed ref (`SlotRef<'bar' | 'frontHeader' | 'appBar' | 'peek'>`) whose slots hold start / title / end (+ expanded, fab). `ComponentRef.slots` takes `Slot[]` (repeats allowed). `Presentation.layout` is `SlotRef<'layout'>`; content-state, splash and overlay components implement their roles.
- **Front header is mandatory and ends in the disclosure** (moved from the back header). `visible` removed.
- **Expanded bars**: bar / appBar `expanded` slot; `BarRegion.expandedHeight`; `Layout.barView` (height + progress); `RegionInstance.height`.
- **Player in config**: `'$player.<field>'` paths, `PlayerIs` condition (status / queue relation / shuffle / repeat), `PlayerBind` (seek), player intents `toggleShuffle`, `cycleRepeat`, `playIndex`, `move`; `Track` carries content fields; `CreateModel(…, player?)`, `Model.player`.
- **Action lists**: `Actions = Action | Action[]` (available iff every member is).
- **Policy**: `PolicyReaction.set: 'toggle'`; lifecycle `scrollTop`.
- **Values**: derived `total`, `scrolled`; `DerivedEquals` condition; `'$content.<field>'` paths (items · total · tracks).
- **Groups**: `Presentation.groups: GroupSpec[]` (by, key initial / value / decade, when, header, index); query `groups`.
- **Item repeats**: a `Repeat` with a `Bind` source; a ref implementing item inside a repeat opens its element.
- **App-bar pages**: `content` optional, `body?: Slot[]`, inner `sheet?: PageSheet` (`SheetState`, `SheetPolicy`); BackAction `collapseSheet`; `expandedChanged.sheet`; set / toggleExpanded target the focused page's sheet first.
- **Layers**: `DrawerPresentation` (covers, traps focus, back closes).
- **Motion**: `Measurements.shared` (element rects that move between pages).
- Deck / layer `name` is a TextId (resolved through texts).
- api.d.ts regrouped top-down (A–P); one documented forward reference (DeckPolicy → StackEntry).
- Rules: 91 → 100 (slot contracts; toggle; scrollTop + scrolled; groups; player conditions; action lists; inner sheet; drawer; item repeats). The strict back-layer rule moves the disclosure to the front header.
- App: Nonono → **Now playing** (player page: artwork, track info, seek, transport; inner Up next / Lyrics / Related sheet; mini-player peek); drawer layer **Menu** (Listen now / Settings / Account) opened by a hamburger beside the logo; **Account** layer; user button on deck base pages (disabled); local search as a `morph` (icon ⇄ field spanning the header) driven by `scrolled` / a `searching` flag reset on `scrollTop`; Library: layout (grid / list) + sort (dropdown) + year range; header "Your artists (n)"; grouped lists / grids (A–Z or decades, follow sort); tapping the active tab again toggles the back layer; Search submits (draft `qd`) and conceals the back layer; FAB (play / play next / add to queue) on person, collection, Recently played, Saved; carousel entries tappable; every string a text (5 locales).
- Design: `interactive` base (states, state layer, ripple, focus ring, press scale + their motions); `symbol` (Material Symbols Rounded) replaces `icon`; `morph`, `fab`, `dropdown`, `rangeField`, `seekBar`, `detailHeader`, `groupHeader`, `alphaIndex`, `artwork`, `trackInfo`, `row`, `queueRow`, `drawerItem`, `frontHeader`; motions `symbolMorph`, `containerMorph`; grid tokens (columns ≤ 140px); front header 68 / app bar 76 (+20 for the FAB).

## 12.0.0 — 2026-10-03 (breaking)
- **Items name page templates.** `AppConfig.pages: Record<PageTemplateId, PageConfig>`; `ItemData.opens: PageLink { template } | LayerPageSpec | null`. Removed `PageSpec`, `AppBarPageSpec`, `BackdropPageSpec`, `PageIdentity` — the backend sends only data. Breaks the ItemData → page config → … → OpenIntent cycle.
- The opened page sees its item: `PageState.opener`; paths `$opener.<field>`; `ContentConfig.params` (extra dataSource params, e.g. `{ id: { bind: '$opener.id' } }`); `TitleFromItem.field`. Page id stays parent id + '/' + item id.
- Lifecycle `paramReselect` / `{ paramReselect: name }`: a control picked the current value again (the active tab) — e.g. `back.expanded.on { paramReselect: 'tab' } set true`.
- PropType `list` (content records, e.g. a carousel's entries).
- Actions are resolved with binds everywhere (`$opener` in menus), not only in repeats.
- Rules: 89 → 91 (templates + opener; paramReselect reactions).
- App: page templates shelf / person / collection; Browse = carousels (shelves) opening backdrop children; hosts removed; local search (`find` param + `localSearch`) in Library, templates and layer app bars; the active Library tab expands the back layer.
- Design: `carousel`, `localSearch` (searchField variant: thin, squarish).

## 11.0.1 — 2026-10-03
- Patch (order only): api.d.ts declares every type before it is used. Four recursive groups keep one marked forward reference each: Condition (Not / All / Any), PropValue (TextRef / IfValue), VisualValue (VariantCases / IfVisual), ItemData → PageSpec (pages ↔ items ↔ intents ↔ actions). Shapes unchanged.

## 11.0.0 — 2026-10-03 (breaking)
- **Items are content.** `ItemData` = `{ id, opens, …fields }`: the engine reads only id and opens (removed `title`, `tag`; `Tag` type). Role `item` supplies only `navigable`. A presentation's item ref is evaluated per item with `$item` in scope (props bind `$item.title` / `$item.subtitle` / `$item.image`); its action runs for items that open nothing (tracks play). Queries `resolveRef` / `condition` take a `scope`; `expandSlots` is part of Queries.
- **Param motion is chosen per param**: `ParamSpec.motion` (a name the choreography declares; default 'default'). `paramChanged` carries `motion` instead of `axis`; ChoreoPattern `{ event: 'paramChanged', motion? }`. `axis` stays behaviour (direction) only.
- Now playing is a design component (`nowPlaying`) each platform implements against its player — no config access to player state.
- Style: every object shape is a named type; unions list named members (no anonymous `{ }` in fields). Shapes are unchanged except as listed.
- Rules: 88 → 89 (param motions name choreography rules; presentation items bind `$item.*`; items that open nothing produce no intent).

## 10.0.0 — 2026-10-03 (breaking)
- **URLs name one destination**: a gate, else an open recorded layer, else the active deck's stack. Layers and gates are their own destinations: `/dedede/fliboo`, `/sign-in` (new `RouteTable.gate`; `?dedede=` removed).
- **Format**: lowercase slugs (runs of anything but letters, digits and '.' → '-'); only the top page's url params, as a query string `?f=tag-x,tag-y&q=hello+world` (matrix `;` params removed; `routes.params: 'all'` removed). Matching is case-insensitive; text values are lowercased with spaces as '+'.
- navigateUrl: a deck URL closes recorded layers; a layer URL opens over the current deck; a gate URL that doesn't apply goes to the start deck.
- Rules: 87 → 88 (slugs: route names, sibling items, layer page keys). URL round-trip rule covers deck, layer and gate destinations, case-insensitive matching and lower pages' params staying out.

## 9.0.0 — 2026-10-03 (breaking)
- **Content presentation is design, not engine.** Removed: `ContentConfig.type` ('listOrGrid' | 'generic'), `ContentConfig.item { list, grid }`, `front.view` (state + policy), intents `setView` / `toggleView`, the generic special case in `contentSummary`.
- Added: `ContentConfig.view?` (a choice param that picks the presentation) + `presentations: { [option | 'default']: { layout, item } }`; query `presentation(page)`. A view param is a normal param (`data: false`, per-tab via `scope`), changed by a bound control.
- Design: layout components `listLayout`, `gridLayout` (responsive: minColumnWidth per layout class, maxColumns, gap), `scrollerLayout`; `viewSwitch` (extends iconButton, input, accepts choice, steps to the next option). Loader: `extends` inherits variants.
- Interactive refs need an `action` key unless they are bound (`bind`).
- Rules: 86 → 87 (presentations cover the view options; the presentation follows the param; switching views keeps the data params).

## 8.0.0 — 2026-10-03 (breaking)
- **Params replace the basic-action kinds.** Removed: `BasicActionConfig` (filters / tabs / search), `TabsConfig`, `InputState` (Filter/Tab/SearchState), `TabsData`, `FiltersData`, `setInput`, `inputChanged`, lifecycle `inputChange`, BackAction `clearSearch`, NavRecord `search`, `routes.input`, roles `tabBar` / `filterChips` / `searchField`, derived `activeFilterCount` / `filterSummary`.
- Added: `Params` / `ParamSpec` (choice · choices · text · flag · number · date; options with labels, axis, range, min/max/step, url, history, data); `page.params` state + `policy.params`; role `input` (supplies value + options, emits change / submit) with registry `accepts`; `ComponentRef.bind` (name or { change, submit }); `Slot` = ref | `Repeat`; intents `setParams` / `toggleParam` / `resetParams`; event `paramChanged { name, axis, direction }`; lifecycle `paramChange` / `{ paramChange }`; `FieldPolicy.on` reactions; BackAction `resetParam`; NavRecord `param`; `routes.params` with a codec per type; derived `count` / `summary` (with `of`); queries `paramOptions`, `paramTarget`, `expandSlots`; `Source` dataSource params; ChoreoPattern `{ event: 'paramChanged', axis? }`.
- **Bar** replaces Header / BackLayerHeader (`start`, `title`, `end`); back-layer regions are `bar` | `slots` in a `RegionSet`; `hideOnScroll` moves to the region. The backdrop back layer is the strict form (header bar ending in the disclosure, basicAction with one bound control).
- App-bar pages: `tabs` → `params` + a bound control. `visibleItems` no longer filters (the data source applies the params).
- URL: `;f=` and `;q=` unchanged; tabs carry the option value (`;tab=B`, was `;tab=1`).
- Rules: 82 → 86 (params validity, strict back layer, URL codec per type, policy reactions; input / tab / search rules rewritten generically).

## 7.1.1 — 2026-10-03
- Patch (comment only): component `motion` keys are names — a visual it animates or any named motion; the template's trigger says when it runs.
- Design: `placeholderList` removed (unused since 7.0); placeholders pulse via `motion.placeholder`.

## 7.1.0 — 2026-10-03
- `ChoreoPattern`: added `{ event: 'launched' }`, `{ event: 'sessionChanged'; signedIn?: boolean }`, `{ event: 'urlChanged' | 'retryRequested' | 'focusRestore' | 'exit' }` (they were used by the choreography but missing from the type). Additive → minor.
- `layout.transitionFor` matches `signedIn` against `event.session.signedIn`. New rule: sessionChanged rules tell sign-in from sign-out (82 rules).
- Design: sessionChanged split into signedIn true (`enterApp`) / false (`fadeThrough`); `enterApp` drops `easingIn`, `split`, `scaleIn`.

## 7.0.0 — 2026-10-02
- Launch: `AppConfig.launch`, `AppState.launch`, intent + event `launched`, motion trigger `loop`; design `splash` + motion `pulse`.
- Texts: `TextRef`, `LocaleId`, `AppConfig.locales` (with dir) + `texts`, `Prefs.locale`, `Queries.text` / `dir`, env `dir`; ICU subset (`formatMessage`). app/texts + design/texts in en, fi, de, pt, he; `app/load-app.js` merges them.
- **Breaking:** placeholders: `ComponentRegistry.placeholder`; `ContentStateComponents.loading` removed, `ContentView.placeholders`.
- Design: `expandSurface.cornerTo` (corners un-round as the front layer grows).
- Rules: 77 → 81.

## 6.0.0 — 2026-10-02
- **Breaking:** motion is design. `TransitionDescriptor` is generic (`{ kind: MotionId | 'instant', …params }`); the fixed list of kinds and their fields is gone. Motion kinds live in `design/motions/<id>.json` (`MotionRegistry`: params with types / defaults, `reduced` form); `Specs.motions`.
- Component motion: `ComponentRegistry.motion` (key = visual or trigger; `MotionTemplate { motion, trigger?, …params }`, inherited); `Layout.motionFor(specs, component, key, prefs)`; `MotionTrigger`.
- `PlatformManifest.motions`: the motion kinds a platform implements.
- Design: 10 motions (fade, fadeThrough, sharedAxis, expandFromItem, revealFromItem, expandSurface, circularReveal, move, rotate, ripple). `expandSurface` gets `scaleIn` (fade-through scale); state layers fade, ripples and the caret's rotation and the tab indicator are component motion.
- Rules: 75 → 77.

## 5.0.1 — 2026-10-02
- Clarified `expandSurface`: one motion — the fade-through runs inside the surface growth (out from 0, in right after), not after it. No shape change.

## 5.0.0 — 2026-10-02
- **Breaking:** hide-on-scroll moves from the front header to the back header: `BackLayerHeader.visible?: 'always' | 'hideOnScroll'`, state `back.headerHidden` (+ optional policy); removed `Header.visible 'hideOnScroll'` and `front.headerHidden`. A hidden back header lifts every region and the front layer by its height; expanding shows it again.
- **Breaking:** `expandOnTap` → `toggleOnTap`: tapping the back layer outside interactive elements toggles it.
- Panels can be content-sized: `height: number | 'content'`; `Layout.regions(page, measured?)`, `frontLayer(…, { measured })` — the shell measures, layout stacks; the front layer never covers its own header.
- Rules: 73 → 75.

## 4.0.0 — 2026-10-02
- **Breaking:** back-layer headers are `BackLayerHeader { left, title, toggle }` — the right side is always the disclosure control (new role `disclosure`: supplies expanded, emits toggle → toggleExpanded; design component `caret`, a variant of iconButton whose rotation follows `back.expanded`).
- **Breaking:** `panel` regions carry `content: ComponentRef[]`; new Condition `{ path, includes }` so panels react to the basic action.
- `Header.visible: 'hideOnScroll'`; `front.headerHidden` state (+ optional policy); event `headerVisibilityChanged`.
- `BackLayerConfig.expandOnTap` (default true): tapping the concealed back layer outside interactive elements expands it.
- New transition `expandSurface` (front layer grows over the content, then fade-through); app-bar push / pop use it.
- URL: `RouteTable.input` ('none' | 'top' | 'all') — basic-action input as matrix params (`;f=`, `;tab=`, `;q=`); input changes replace the URL, a search starting pushes. Back clears an active search before popping (`BackAction 'clearSearch'`, `NavRecord 'search'`).
- Rules: 67 → 73.

## 3.1.0 — 2026-10-02
- §20 status states: `StatusState` (selected, checked, indeterminate, busy, error, dragged), `STATUS_STATES`, `statusOf(action, env, facts?)`; `InteractionView.status` + `activatable` (busy blocks activation, is not disabled); `resolveInteraction(…, facts?)`; `InteractionInput.dragging`; `InteractionFacts`; `ComponentRef.checked` → `ResolvedRef.checked`.
- Registry `statuses`; visuals may key on declared statuses (interaction-state column wins, then status, then default); `resolveVisuals` ctx `status`.
- Design: chip / navItem / tab use `selected` columns (replacing inkSelected / fillSelected / inkUnselected and shell-side dimming); button / iconButton dim while busy.
- Rules: 64 → 67.

## 3.0.0 — 2026-10-02
- **Breaking:** §14 Presentation → **Layout** (`Layout`, `LayoutGeometry`). `geometry(state, config, q, specs)` takes the design; layout has no size constants (rail width from `breakpoints`, sheet sizes from layer presentation, nav bar height from design). `frontLayer` takes `{ env }`; new `env()` → `LayoutEnv { layout, touch, sheet }`.
- **Breaking:** `AppConfig.navigation: { compact, wide }` (required) — role slots filled by components implementing the new `navigation` role (supplies destinations / selected, emits select → switchDeck or reselectDeck).
- **Breaking:** `Wire.sync` removed (unused; syncing is the backend's job).
- Design values (`VisualValue`) can be `{ role }` (colour role of the surface the component sits on; surfaces declare `provides`), `{ variant, cases }` (placement variants; components declare `variants`; `ComponentRef.variant`) and `{ if: Condition }`. `resolveVisuals(…, ctx: { surface, variant, env, page })`. Condition env adds `sheet`.
- Front layer's square top-right corner is design data (`cornerTR` = 0 while a sheet sits beside it) — fixes it also squaring while a modal sheet covered the content.
- §13 Player marked optional.
- Files: `model/` → `core/` (`navigation.js`, `layout.js`, `interaction.js`, `player.js`); `model/sample.js` → `app/fake-backend.js`; docs → `docs/`.
- Rules: 60 → 64.

## 2.1.0 — 2026-10-02
- Placement identity: `SlotPath` (surface / page / slot [+ index] [+ #item]); query `slotPath`; `resolveRef(…, path?)` returns `key`; `InteractiveComponent.id: SlotPath`. Interaction state belongs to where a component sits.
- Rules: 59 → 60.

## 2.0.0 — 2026-10-02
- **Breaking:** removed `RouteTable.encodePage`. Page segments are now defined by the contract: the item id, percent-encoded (RFC 3986). URLs are unchanged.
- **Breaking:** header items are component references. `Header.left/right: ComponentRef[]`, `title: ComponentRef`; removed `HeaderItem`, `HeaderTitle`. A `ComponentRef` names a registered component, its props (`PropValue`: literal, `bind` a page-state path, `derived` value, or `if`), an `action` (§20), `when` (`Condition`: page path, env layout/touch, not/all/any) and `slots` (children).
- Queries `derived`, `condition`, `resolveRef`; `DERIVED_IDS`. Intents `toggleExpanded`, `toggleView`; `up.target` optional (default: focused stack).
- Specs: `logo`, `icon`, `label`, `title`, `trackedTitle` registered; `iconButton` declares its props.
- **Breaking:** roles. `RoleId`, `Role { supplies, emits }`, `ROLES`, `SlotRef<R>`, `SlotContext`; queries `roleProps`, `roleIntent`. `BasicActionConfig.component: SlotRef<'filterChips' | 'tabBar' | 'searchField'>`, `ContentConfig.item: { list, grid? }: SlotRef<'item'>`. Registry `interactive: true` → `implements: RoleId[]`; `PropType` adds `'string[]'`.
- Specs: `filterChips`, `tabBar`, `searchField`, `listRow`, `gridCard`, `contentBlock`.
- **Breaking:** `ComponentRegistry` no longer has `platforms`. Implementation status is a platform fact: each platform publishes a `PlatformManifest { platform, implements }` next to its code (`platforms/web.json` for the mockup).
- Registry: `extends` (inherit roles, props, states, visuals; own values win) and `variant` (drawn by the parent's implementation).
- Rules: "every registered component is implemented on every platform" → "every component the config uses is implemented by every platform manifest (variants via their parent)"; new: component inheritance is well-formed.
- Rules: 51 → 59.
- AppConfig is plain data — no functions anywhere — so an app is a JSON document. The sample app now lives in `app/app.json`; `app/fake-backend.js` is fake data + test fixtures only (`bind(config)`).

## 1.2.0 — 2026-10-02
- §20 Interactive components: `InteractionState` (enabled, disabled, hover, pressed, focus, keyboardFocus), `Action`, `InteractiveComponent`, `InteractionInput`, `InteractionView`.
- Queries `supports` and `interaction`; registry flag `interactive`. Disabled = action null or unsupported (unknown type / dangling ref); idempotent actions stay enabled.
- `reselectDeck` emits `popped` (new optional `depth`) so popping to base is choreographed.
- Specs: `button`, `iconButton`, `navItem`, `listItem` (interactive) + `state.*` tokens, `color.focusRing`.
- Lifecycle event `reselect`: reselecting the active deck at base fires it on the base page; policies decide what resets (sample: scroll + expanded).
- Pointer: reselect drops the push records of the pages it removed.
- Layer `policy.open` now applies: `resetOn` deckSwitch / baseSwitch closes the layer on deck switch.
- Contract aligned with the reference model: `Device.height?`, `AppConfig.wire?`, `SessionConfig.initial?`, `Snapshot.contractVersion?`, NavRecord `'overlay'` + `id`, `Model.query` includes §20 queries, `INTENT_TYPES`, Presentation signatures + `resolveVisuals`; §10 sign-out reset documented as unconditional.
- Fixes: `supports` no longer throws on missing references; layer pops report the real page kind; player `next` cleanup.
- §20 actions span domains: `Action = { nav } | { player } | { shell } | null`; `InteractionEnv`, `actionAvailable`, `resolveInteraction` (core/interaction.js). `supports` moved into `Queries`; `PlayerModel.supports` + `PLAYER_INTENT_TYPES`.
- Tabs animate: `setInput` emits `inputChanged` (kind, direction); choreography pattern `{ event: 'inputChanged', input? }`; new transition `sharedAxis`; token `motion.sharedAxis.distance`. `setInput` with an unchanged value is a no-op.
- Sample: `back.expanded` no longer resets on `return` (Serere kept closing its front layer after a pop).
- Rules: 38 → 51.

## 1.1.0 — 2026-10-02
- Added `contractVersion` on AppConfig, Specs and Snapshot; model rejects incompatible majors.
- §17 Content states: `ContentData.stale/error`, `ContentView`, `contentStates` components, `retry` intent, `retryRequested` event.
- §18 Focus: `Surface`, `focusReturns`, `focusOrder` query, `returnFocus` on `openOverlay`/`openLayer`, `focusRestore` event.
- §19 Windows: decided single window (no `WindowId`).
- Rules: 29 → 38 (versioning, content states, focus).

## 1.0.0 — 2026-10-01
- Navigation contract (§1–8), overlays (§9), session (§10), routes (§11), persist (§12), player (§13),
  presentation (§14), specs (§15), wire (§16). 29 rules.
