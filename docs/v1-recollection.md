# API v1.0.0 — recollection

Written from memory by the session that built v1.0.0–1.1.0, not from the file. `?` = uncertain. §9–16 are headings only (fields not recalled). Current contract is 17.0.0; this is for context on the original intent.

## Principles at the time
- Config (fixed) · state (current) · policy ("metastate": preserve vs reset, defaults, scope; mirrors state shape) are separate.
- Pages: backdrop pages nest BackLayerConfig + FrontLayerConfig; app bar pages are a separate kind without those.
- Input state is typed per kind: FilterState / TabState / SearchState.
- Content comes from data via `dataSource` refs; anything may be data, nothing is forced to be (Bororo's main filters are config).
- Header properties are independent of content type.
- Back layer: concealed / expanded layouts over regions; regions in both that don't move stay put, others fade.
- `fromRect` (motion origin) is view-only, not model state.

## Vocabulary
- Deck — nav bar / rail destination (Bororo, Libibi, Serere); each has an independent stack.
- Layer — parallel surface outside the decks: Nonono (sheet; no browser history; links push onto Bororo without resetting it) and Dedede (settings; in browser history).
- Back: Android back = browser back on touch (history trick, not CloseWatcher); in-app back arrow = separate `up` intent (added 1.0.x).

## Shapes

```ts
// §0 primitives
type DeckId = string; type LayerId = string; type SourceRef = string; type ComponentId = string;

// §1 app config
interface AppConfig {
  decks: DeckConfig[]; startDeck: DeckId;
  layers: LayerConfig[];
  routes?: RouteConfig[]; persist?: PersistPolicy; shortcuts?: Shortcut[];
}
interface DeckConfig { id: DeckId; name: string; icon: string; base: PageConfig; policy?: Policy }

// §2 pages
type PageConfig = BackdropPageConfig | AppBarPageConfig;
interface BackdropPageConfig {
  kind: 'backdrop'; id: string; title: string;
  back: BackLayerConfig; front: FrontLayerConfig;
}
interface AppBarPageConfig { kind: 'appBar'; id: string; title: string; header: HeaderConfig; content: ContentConfig }

interface BackLayerConfig {
  regions: Record<string, { height: number; header?: HeaderConfig }>;   // header · basicAction · panel
  layouts: { concealed: string[]; expanded: string[] };
  basicAction: FiltersAction | TabsAction | SearchAction;
}
interface FrontLayerConfig {
  collapse: 'partial' | 'full';
  header: HeaderConfig & { visible: 'always' | 'whenScrolled' };
  content: ContentConfig;
}
interface HeaderConfig { left?: HeaderItem[]; title: TitleSource; right?: HeaderItem[] }
type HeaderItem = { kind: 'logo' | 'back' | 'toggleExpanded' | 'viewToggle' | 'caret' | 'filterSummary' | 'more'; when?: 'expanded' | 'concealed'; icon?: string };
type TitleSource = { kind: 'text' | 'deckName' | 'pageTitle' | 'trackedItem' | 'frontTitle' };   // ? exact list
interface ContentConfig { type: 'listOrGrid' | 'generic'; dataSource: SourceRef }

// §3 data
interface ContentData { status: 'loading' | 'ready' | 'error'; items: ItemData[]; total?: number }
interface ItemData { id: string; title: string; tag?: string; opens: PageConfig | LayerPageRef | null }

// §4 state
interface AppState {
  activeDeck: DeckId; focus: DeckId | LayerId;
  decks: Record<DeckId, { stack: StackEntry[] }>;
  layers: Record<LayerId, { open: boolean; stack: StackEntry[] }>;
  history: HistoryRecord[];          // pointer devices only
  overlays: OverlayEntry[];          // §9
  device: { width: number; touch: boolean };
}
interface StackEntry { page: PageState; openedFrom: string | null }   // item id, for reverse motion
interface PageState {
  config: PageConfig;
  back: { expanded: boolean; input: FilterState | TabState | SearchState };
  fields: Record<string, unknown>;   // front.scroll, front.view … (scoped by policy)
}
type FilterState = { kind: 'filters'; active: string[] };
type TabState    = { kind: 'tabs'; selected: number };
type SearchState = { kind: 'search'; query: string };

// §5 policy ("metastate")
interface Policy { [field: string]: { preserve: boolean; default?: unknown; scope?: 'page' | 'tab' | 'input' } }   // ? scope values

// §6 layers
interface LayerConfig {
  id: LayerId; name: string;
  presentation: LayerPresentation;          // sheet / sideSheet / fullscreen; wide.peek.maxWidth …
  pages: LayerPageConfig[];                 // fixed set, content partly from data
  history: 'none' | 'browser';              // Nonono none · Dedede browser
  resetOnOpen: boolean;
  linkTarget?: { deck: DeckId } | 'active';
}

// §7 intents
type Intent =
  | { type: 'open'; item: ItemData; origin: { deck: DeckId } | { layer: LayerId } }
  | { type: 'back' } | { type: 'switchDeck'; deck: DeckId } | { type: 'reselectDeck'; deck: DeckId }
  | { type: 'setExpanded'; expanded: boolean } | { type: 'setInput'; input: FilterState | TabState | SearchState }
  | { type: 'setView'; view: 'list' | 'grid' } | { type: 'scroll'; top: number }
  | { type: 'openLayer'; layer: LayerId } | { type: 'closeLayer'; layer: LayerId } | { type: 'openLayerPage'; layer: LayerId; page: string }
  | { type: 'setDevice'; device: Device } | { type: 'focus'; target: DeckId | LayerId }
  | { type: 'openOverlay' | 'closeOverlay' /* … */ } | { type: 'restore'; snapshot: Snapshot } /* … ? */;

// §8 events + queries
type ModelEvent = 'pushed' | 'popped' | 'deckSwitched' | 'expandedChanged' | 'layerOpened' | 'layerClosed'
                | 'overlayOpened' | 'overlayClosed' | 'sessionChanged' | 'urlChanged' | 'exit';
interface Queries {
  backAction(s, c): 'pop' | 'closeLayer' | 'closeOverlay' | 'startDeck' | 'undoRecord' | 'exit';
  layoutClass(s, c): 'compact' | 'wide'; sideMode(s, c, layer): 'beside' | 'modal' | 'auto';
  navVisible(s, c); historyEntries(s, c); historyMode(s, c, layer);
  visibleItems(page, data); contentParams(page); underPage(s); currentPage(s);
  snapshot(s, c); intentForShortcut(s, c, keys);
}

// §9 overlays · §10 session (sign in/out resets) · §11 routes (url ⇄ state) · §12 persist (snapshot/restore)
// §13 player (queue, position — audio is platform-side) · §14 presentation (pure geometry)
// §15 specs (tokens, component registry per platform, choreography rules) · §16 wire (JSON over FFI/WASM)
```

## 1.1.0 additions (recalled more reliably — written in the last session)
- `contractVersion` on config, specs, snapshot; incompatible majors rejected.
- §17 content states: loading / ready / empty / error / offlineStale; `retry` intent → `retryRequested`.
- §18 focus: `Surface`, `focusReturns`, `focusOrder`; blocking overlays / covering layers trap focus; close → `focusRestore`.
- §19 single window on every platform.
- 38 rules.
