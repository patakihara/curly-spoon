/**
 * Backdrop Nav — CONTRACT
 * Abstract API layer: shapes, intents, queries, events, invariants. No logic.
 * Every implementation (web core, native, …) must satisfy this. Invariants live in ./invariants.js and run against any Model.
 *
 * VERSION: contract 18.0.0 (semver — see docs/CHANGELOG.md for the compatibility policy)
 *   minor: additive & optional · major: removals, renames, changed meaning, newly required fields.
 *   Implementations MUST reject config / specs / snapshots whose major differs from theirs.
 *
 * Style: every object shape is a named type; a union lists named members (type A = B | C). No anonymous { } in fields.
 * Order: top-down by dependency — shared vocabulary first, then the app (config), then runtime (state, events, queries),
 * then design (layout, specs, interaction). Every type is defined before it is used; each recursive cycle has one forward
 * reference, marked 'recursive'.
 *
 *   A  Version & primitives          G  Pages, decks, layers
 *   B  Values (conditions, props)    H  App config
 *   C  Params                        I  State
 *   D  Domains used by actions       J  Events
 *      (prefs, session, persist,     K  Data + content states
 *       player, overlay, items)      L  Queries
 *   E  Intents & actions             M  Layout (§14)
 *   F  Config objects (items,        N  Specs (§15) + platform manifests
 *      headers, rows, content)       O  Interaction (§20)
 *                                    P  Model
 *   M2 Contracts (what each drawn    Q  Composition (hires, clauses,
 *      config object offers)            placements: app/composition.json)
 * Domains map 1:1 to Rust modules (docs/RUST.md): nav · overlay · session · route · persist · player (optional) · layout ·
 * specs · wire · interaction.
 */

// ═════════════════════════════════════════════════════════════
// A. VERSION & PRIMITIVES
// ═════════════════════════════════════════════════════════════
export declare const CONTRACT_VERSION: '18.0.0';
export type SemVer = `${number}.${number}.${number}`;

export type DeckId = string;
export type LayerId = string;
export type PageId = string;
export type PageTemplateId = string;
export type ItemId = string;
export type SourceRef = string;
export type ComponentId = string;
export type MotionId = string;
export type GateId = string;
export type LocaleId = string;           // BCP 47, e.g. 'en', 'fi', 'he'
export type TextId = string;             // e.g. 'filters.summary'
export type ShellActionId = string;      // shell-owned commands with no core state (share, copy link…)
export type StatePath = string;
//   a dotted path into a page state: 'params.tab', 'back.expanded', 'front.scroll'
//   '$opener.<field>' the item that opened the page · '$<as>.<field>' a repeat element / '$item' / '$group'
//   '$player.<field>' the player (§D4): current.<field> · index · status · positionMs · shuffle · repeat · queue
//   '$content.<field>' the page's content: items · total · tracks (every item's track / tracks)
export type LayoutClass = 'compact' | 'wide';
export type Direction = 'ltr' | 'rtl';
export interface Device { width: number; height?: number; touch: boolean }   // height defaults to 720 in layout
export interface Breakpoints { compactMax: number; minContent: number }   // the rail's width: design (navigation hire)
export interface Rect { top: number; left: number; w: number; h: number }
export interface Point { x: number; y: number }

// ═════════════════════════════════════════════════════════════
// B. VALUES — conditions, prop values, texts, sources
// Values depend on state only through paths, derived values and conditions — no expressions.
// ═════════════════════════════════════════════════════════════
export type DerivedId = string;          // the engine's list: DERIVED_IDS
export declare const DERIVED_IDS: readonly DerivedId[];
//   'deckName' · 'pageTitle' · 'contentSummary' (item count text) · 'total' (number of content items) ·
//   'count' (of: list length; other values 1 unless empty) · 'summary' (of a param: its option labels / its value) ·
//   'scrolled' (the page's content is scrolled off the top; changes only when it crosses 0)
export type QueueRelation = 'empty' | 'contains' | 'absent';   // the queue is empty · holds every track of `of` · lacks some of them
export interface PathEquals { path: StatePath; equals: unknown }     // deep equality; page paths must lie in a field the state policy declares
export interface PathIncludes { path: StatePath; includes: unknown } // the list at path contains the value
export interface EnvEquals { env: 'layout' | 'touch' | 'sheet' | 'dir'; equals: unknown }   // 'compact' | 'wide' · boolean · 'none' | 'beside' | 'over' · Direction
export interface DerivedEquals { derived: DerivedId; of?: StatePath; equals: unknown }
export interface LayerOpen { layer: LayerId; open: boolean }      // is the layer open (e.g. the rail hamburger toggles)
export interface PlayerIs { player: 'status' | 'queue' | 'shuffle' | 'repeat'; of?: StatePath; equals: unknown }   // queue: QueueRelation of the tracks at `of`
// recursive: refers to Not, All, Any (defined below)
export type Condition = PathEquals | PathIncludes | EnvEquals | DerivedEquals | PlayerIs | LayerOpen | Not | All | Any;
export interface All { all: Condition[] }
export interface Any { any: Condition[] }
export interface Not { not: Condition }

export interface Bind { bind: StatePath }
export interface Derived { derived: DerivedId; of?: StatePath }
// recursive: refers to TextRef, IfValue (defined below)
export type PropValue = string | number | boolean | null | Bind | Derived | TextRef | IfValue;
export interface TextRef { text: TextId; args?: Record<string, PropValue> }   // ICU MessageFormat subset
export interface IfValue { if: Condition; then: PropValue; else: PropValue }

export interface DataSourceRef { dataSource: SourceRef; params?: Record<string, PropValue> }
/** Fixed in config or fetched (the dataSource's items). Fixed values resolve as 'ready'. */
export type Source<T> = T | DataSourceRef;
export interface TitleFromItem { from: 'item'; field?: string }   // a template's title: the opening item's field (default 'title')
export type Title = Source<string> | TitleFromItem | TextRef;

export interface SupportedLocale { id: LocaleId; dir: Direction }
export interface LocaleConfig { default: LocaleId; supported: SupportedLocale[] }

// ═════════════════════════════════════════════════════════════
// C. PARAMS — the values a page holds for its controls
// The engine knows only their type: state, URL codec, history, state policy and data params.
// ═════════════════════════════════════════════════════════════
export type ParamName = string;
export type ParamType = 'choice' | 'choices' | 'text' | 'flag' | 'number' | 'date';
export type ParamMotion = string;        // names a paramChanged choreography rule: 'slide', 'swap', 'default'
export type NumberRange = [number, number];
export type DateRange = [string, string];
export type ParamValue = string | string[] | boolean | number | NumberRange | DateRange | null;
export interface ParamOption { value: string; label: TextRef | string }
export type ParamApply =
  | 'immediate'                          // a change applies at once
  | 'onApply';                           // a change waits in the page's pending values until applyParams (search while typing; an Apply button)
export interface ParamSpec {
  type: ParamType;
  label?: PropValue;                     // what the param is called ("Genre"); may switch by state · design decides whether a control draws it
  placeholder?: PropValue;               // a hint while it is empty ("Search anything")
  apply?: ParamApply;                    // default 'immediate'
  options?: Source<ParamOption[]>;       // choice / choices, in order
  axis?: boolean;                        // ordered siblings → paramChanged carries a direction
  motion?: ParamMotion;                  // default 'default'
  range?: boolean;                       // number / date: [from, to]
  min?: number;
  max?: number;
  step?: number;
  url?: boolean;                         // default false
  history?: 'replace' | 'pushFirst';     // pushFirst: leaving the default adds a history entry; back returns to the default
  data?: boolean;                        // passed to the content dataSource; default true
}
export type Params = Record<ParamName, ParamSpec>;

// ═════════════════════════════════════════════════════════════
// D. DOMAINS USED BY ACTIONS
// ═════════════════════════════════════════════════════════════
// ── D1. Prefs
export interface Prefs {
  reducedMotion: boolean;
  theme: string;
  tokenOverrides: Record<string, string | number>;
  textScale: number;
  locale: LocaleId;
}
// ── D2. Session (§10) — gates before the app
export interface PermissionMissing { permissionMissing: string }
export type SessionPredicate = 'signedOut' | 'onboardingPending' | PermissionMissing;
export type PermissionStatus = 'granted' | 'denied' | 'unknown';
export interface SessionState { signedIn: boolean; onboarded: boolean; permissions: Record<string, PermissionStatus> }
export interface SignedIn { type: 'signedIn' }
export interface SignedOut { type: 'signedOut' }
export interface Onboarded { type: 'onboarded' }
export interface PermissionChanged { type: 'permission'; name: string; status: 'granted' | 'denied' }
export type SessionEvent = SignedIn | SignedOut | Onboarded | PermissionChanged;
// Invariant: signing out resets every deck and layer stack, overlays, focus returns and history.
// ── D3. Persist (§12) — restart / process death
export interface PersistPolicy {
  stacks: 'all' | 'activeDeck' | 'none';
  pageFields: StatePath[];
  layers: 'none' | 'recordedOnly' | 'all';
}
export interface PageSnapshot { id: PageId; fields: Record<string, unknown> }
export interface DeckSnapshot { pages: PageSnapshot[] }
export interface Snapshot { version: number; contractVersion?: SemVer; activeDeck: DeckId; decks: Record<DeckId, DeckSnapshot>; layers?: Record<LayerId, PageId[]> }
// Invariant: restore(snapshot(state)) equals state on every persisted field.
// ── D4. Player (§13) — OPTIONAL domain. Core owns WHAT plays; shells make sound and report facts.
// Without a player, player actions are unavailable, '$player' paths are undefined and PlayerIs conditions are false.
export interface Track { id: ItemId; title: string; durationMs?: number; source: SourceRef; [field: string]: unknown }   // extra fields: content for components
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';
export interface PlayerState {
  queue: Track[];
  index: number;                         // -1 = nothing
  status: PlayerStatus;
  positionMs: number;
  repeat: RepeatMode;
  shuffle: boolean;
  order: number[];
}
export interface PlayQueue { type: 'playQueue'; tracks: Track[]; start?: number }
export interface Enqueue { type: 'enqueue'; tracks: Track[]; next?: boolean }
export interface Transport { type: 'play' | 'pause' | 'toggle' | 'next' | 'previous' }
export interface PlayerToggle { type: 'toggleShuffle' | 'cycleRepeat' }   // cycleRepeat: off → all → one → off
export interface PlayIndex { type: 'playIndex'; index: number }          // jump to a queue entry
export interface MoveInQueue { type: 'move'; from: number; to: number }  // reorder (queue indices; the current track keeps playing)
export interface Seek { type: 'seek'; positionMs: number }
export interface SetRepeat { type: 'setRepeat'; repeat: RepeatMode }
export interface SetShuffle { type: 'setShuffle'; shuffle: boolean }
export interface PositionFact { kind: 'position'; ms: number }
export interface ErrorFact { kind: 'error'; message: string }
export interface SimpleFact { kind: 'ended' | 'buffering' | 'ready' }
export type PlayerFact = PositionFact | ErrorFact | SimpleFact;
export interface Reported { type: 'reported'; fact: PlayerFact }
export type PlayerIntent = PlayQueue | Enqueue | Transport | PlayerToggle | PlayIndex | MoveInQueue | Seek | SetRepeat | SetShuffle | Reported;
export interface LoadCommand { type: 'load'; track: Track; autoplay: boolean; positionMs: number }
export interface SeekCommand { type: 'seek'; positionMs: number }
export interface SimpleCommand { type: 'play' | 'pause' | 'stop' }
export type PlayerCommand = LoadCommand | SeekCommand | SimpleCommand;
export interface PlayerModel {
  getState(): PlayerState;
  dispatch(i: PlayerIntent): PlayerCommand[];
  current(): Track | null;
  supports(i: PlayerIntent): boolean;    // transport / seek / playIndex / move need a queue; playQueue / enqueue need tracks
}
export declare const PLAYER_INTENT_TYPES: readonly PlayerIntent['type'][];
// ── D5. Overlay (§9) — transient UI above everything; back closes the topmost blocking one first
export type OverlayKind = 'dialog' | 'menu' | 'actionSheet' | 'snackbar';
export type OverlayHistory = 'transient' | 'ignore';
export interface OverlayTexts { title?: PropValue; body?: PropValue; confirm?: PropValue; cancel?: PropValue; text?: PropValue; action?: PropValue }   // a dialog's · a snackbar's text and action
// recursive: refers to ButtonItem (§F) — a menu's items
export interface OverlaySpec { id: string; kind: OverlayKind; texts: OverlayTexts; items?: ButtonItem[]; blocking: boolean; timeoutMs?: number; history?: OverlayHistory }   // the component: composition, by kind
// ── D6. Items — content. The engine reads only id and opens; other fields are for components ('$item.<field>').
// What an item opens: a page template (AppConfig.pages) or a page of a layer's fixed set. Where: decided by origin, never by item type.
export interface PageLink { template: PageTemplateId }
export interface LayerPageSpec { kind: 'layerPage'; page: PageId }
export type ItemLink = PageLink | LayerPageSpec;
export interface ItemData { id: ItemId; opens: ItemLink | null; entries?: ItemData[]; [field: string]: unknown }   // opens null = not navigable · entries: a shelf's · OPEN: the other fields are the backend's
export interface DeckTarget { deck: DeckId }
export interface LayerTarget { layer: LayerId }
export type Origin = DeckTarget | LayerTarget;
export type LinkTarget = 'activeDeck' | DeckTarget;

// ═════════════════════════════════════════════════════════════
// E. INTENTS & ACTIONS — the only way to change state
// ═════════════════════════════════════════════════════════════
export interface OpenIntent { type: 'open'; item: ItemData; origin: Origin }
export interface OpenLayerPageIntent { type: 'openLayerPage'; layer: LayerId; page: PageId }
export interface BackIntent { type: 'back' }
export interface UpIntent { type: 'up'; target?: Origin }
export interface SwitchDeckIntent { type: 'switchDeck'; deck: DeckId }
export interface ReselectDeckIntent { type: 'reselectDeck'; deck: DeckId }
export interface SetParamsIntent { type: 'setParams'; values: Record<ParamName, ParamValue>; page?: PageId; apply?: true }   // an 'onApply' param's value goes to pending, unless apply (picking a suggestion)
export interface ToggleParamIntent { type: 'toggleParam'; name: ParamName; option: string; page?: PageId }
export interface ResetParamsIntent { type: 'resetParams'; names?: ParamName[]; page?: PageId }
export interface ApplyParamsIntent { type: 'applyParams'; names?: ParamName[]; page?: PageId }       // pending → params (default: every pending one); the content refetches
export interface DiscardParamsIntent { type: 'discardParams'; names?: ParamName[]; page?: PageId }   // drop pending values (default: all)
export interface SetExpandedIntent { type: 'setExpanded'; expanded: boolean }   // the focused app-bar page's sheet if it has one, else the back layer under the focus
export interface ToggleExpandedIntent { type: 'toggleExpanded' }
export type ScrollSurface =
  | 'content'                            // the front layer's content, or an app-bar page
  | 'panel';                             // the back layer's panel (BackLayerState.scroll)
export interface ScrollIntent { type: 'scroll'; top: number; surface?: ScrollSurface }   // top: the collapse-first offset; surface default 'content'
export interface OpenLayerIntent { type: 'openLayer'; layer: LayerId; returnFocus?: string }
export interface CloseLayerIntent { type: 'closeLayer'; layer: LayerId }
export interface FocusIntent { type: 'focus'; target: DeckId | LayerId }
export interface SetDeviceIntent { type: 'setDevice'; device: Device }
export interface SetPrefsIntent { type: 'setPrefs'; prefs: Partial<Prefs> }
export interface OpenOverlayIntent { type: 'openOverlay'; overlay: OverlaySpec; returnFocus?: string }
export interface CloseOverlayIntent { type: 'closeOverlay'; id?: string; result?: unknown }
export interface RetryIntent { type: 'retry'; dataSource?: SourceRef }
export interface SessionIntent { type: 'session'; event: SessionEvent }
export interface NavigateUrlIntent { type: 'navigateUrl'; url: string }
export interface RestoreIntent { type: 'restore'; snapshot: Snapshot }
export interface LaunchedIntent { type: 'launched' }
export interface OpenFindIntent { type: 'openFind' }                     // the current page's find: opened = true, closed = false
export interface CloseFindIntent { type: 'closeFind' }                   // its text = '', opened = false, closed = true
export interface OpenMoreIntent { type: 'openMore'; name: ParamName; page?: PageId }   // opens the More of the control bound to name (BackLayerState.more); reveals the back layer
export interface CloseMoreIntent { type: 'closeMore'; page?: PageId }   // closes the newest open More
export type Intent =
  | OpenIntent | OpenLayerPageIntent | BackIntent | UpIntent | SwitchDeckIntent | ReselectDeckIntent
  | SetParamsIntent | ToggleParamIntent | ResetParamsIntent | ApplyParamsIntent | DiscardParamsIntent | SetExpandedIntent | ToggleExpandedIntent | ScrollIntent
  | OpenLayerIntent | CloseLayerIntent | FocusIntent | SetDeviceIntent | SetPrefsIntent
  | OpenOverlayIntent | RetryIntent | CloseOverlayIntent | SessionIntent | NavigateUrlIntent | RestoreIntent | LaunchedIntent
  | OpenFindIntent | CloseFindIntent | OpenMoreIntent | CloseMoreIntent;
export type IntentType = Intent['type'];
export declare const INTENT_TYPES: readonly IntentType[];

export interface NavAction { nav: Intent }
export interface PlayerAction { player: PlayerIntent }
export interface ShellAction { shell: ShellActionId }
export type Action = NavAction | PlayerAction | ShellAction | null;   // null = not implemented
export type Actions = Action | Action[];  // a list runs in order (e.g. play, then open Now playing); available iff every member is

// ═════════════════════════════════════════════════════════════
// F. CONFIG OBJECTS — what exists, as plain data. Never which component draws it, where it sits, or how big it is
// (composition, §Q, and design, §N, say that). No slots, no sides, no look values.
// ═════════════════════════════════════════════════════════════
export type ItemName = string;           // names an item within its list; composition may single it out
export type ItemKind = 'button' | 'logo' | 'text' | 'switch' | 'find' | 'detail' | 'seek';

// ── Items: what a header, body or row holds. Which side or row an item sits in is composition's choice.
export interface ButtonItem {
  kind: 'button'; name: ItemName; label: PropValue; action: Actions; when?: Condition;
  checked?: PropValue;                   // a toggle's on / off (shuffle, repeat)
  state?: PropValue;                     // a name for what the button shows now ('pause' | 'playNow', 'repeat' | 'repeatOne'); composition picks tokens by it
}
export interface LogoItem { kind: 'logo'; name: ItemName; label: PropValue; action?: Actions; when?: Condition }   // the brand; reacts to the player; an action makes it pressable (where composition maps its press)
export interface TextItem { kind: 'text'; name: ItemName; text: PropValue; when?: Condition }
export interface SwitchItem { kind: 'switch'; name: ItemName; param: ParamName; label: PropValue; when?: Condition }   // steps a choice param to its next option
export interface FindItem { kind: 'find'; name: ItemName; param: ParamName; placeholder: PropValue; when?: Condition }   // a local search over the content; open / closed is engine state (FindState)
export interface DetailConfig { title: PropValue; subtitle?: PropValue; image?: PropValue; meta?: PropValue }   // one item shown large: the opened item, the current track, the account
export interface DetailItem { kind: 'detail'; name: ItemName; detail: DetailConfig; when?: Condition }
export interface SeekItem { kind: 'seek'; name: ItemName; label: PropValue; when?: Condition }   // the player's position
export type HeaderItem = ButtonItem | LogoItem | TextItem | SwitchItem | FindItem;
export type BodyItem = ButtonItem | TextItem | DetailItem | SeekItem;
// Items whose `when` does not hold are still drawn, hidden (contract nodes carry shown: false), so they can fade in and out.

// ── Headers: the back layer's, an app-bar page's and the peek's. Their title is the page's title (none on the peek).
export interface HeaderConfig { items: HeaderItem[]; detail?: DetailConfig }

// ── Param controls: one control for one page param (a tab bar, a chip row, a dropdown, a search field, a range, a suggestion
//   list). What draws it is composition's choice, by the param's spec. Its words (label, placeholder) are the param's.
//   A control with `more` offers "More": opening it turns the back layer's panel into the More's controls (BackLayerState.more).
//   How many options a control shows before "More" is design's choice; their order is config's.
// recursive: refers to ParamControlMoreConfig (defined below)
export interface ParamControlConfig {
  bind: ParamName;                       // the page param it shows and changes
  options?: Source<ParamOption[]>;       // the choices this control shows; default: the param's own (search suggestions, a popular subset)
  when?: Condition;                      // shown only while this holds
  more?: ParamControlMoreConfig;         // offers "More"; at most one control per page param has one
}
export interface ParamControlRowConfig {
  controls: ParamControlConfig[];        // one or more on this line, in order
  when?: Condition;                      // the whole line shows only while this holds
}
export interface ParamControlMoreConfig {
  paramControls?: ParamControlRowConfig[];   // what the More shows; default: one row, a control for the same param with all its options
}

// ── Content. A shelf is an item holding entries (Browse's "Artists to know"). Data decides which shelves and entries exist;
//   activating a shelf or an entry opens it (ItemData.opens; a shelf opens the template shelfPage).
export type PresentationKey = string;
export interface ContentParam { name: string; value: PropValue }
export type GroupKey = 'initial' | 'value' | 'decade';
export interface GroupConfig { by: StatePath; key: GroupKey; when?: Condition; index?: boolean }   // first matching wins · index: a fast-scroll index over the keys
export interface PresentationConfig { key: PresentationKey; groups?: GroupConfig[]; itemAction?: Actions }   // itemAction: what activating an item that does not open does (a track plays) · the layout: composition
export interface ContentConfig {
  dataSource: SourceRef;
  params?: ContentParam[];               // extra dataSource params ({ name: 'id', value: { bind: '$opener.id' } })
  view?: ParamName;                      // the param that picks the presentation
  presentations: PresentationConfig[];
}

// ═════════════════════════════════════════════════════════════
// G. PAGES, DECKS, LAYERS
// ═════════════════════════════════════════════════════════════
export interface ParamChangeOf { paramChange: ParamName }
export interface ParamReselectOf { paramReselect: ParamName }
export type LifecycleEvent =
  | 'enter' | 'return' | 'reselect' | 'scrollTop'
  | 'paramChange' | ParamChangeOf | 'paramReselect' | ParamReselectOf
  | 'baseSwitch' | 'deckSwitch' | 'layerOpen' | 'layerClose';
//   baseSwitch ⊃ { deckSwitch, layerOpen, layerClose } · reselect: the active deck's nav item at base · scrollTop: the content scrolled back to 0
export interface PolicyReaction<T> { event: LifecycleEvent; set: T | 'default' | 'toggle' }   // toggle: booleans only
export interface StatePolicy<T> {
  default: T;
  resetOn: LifecycleEvent[];
  scope?: StatePath | null;
  on?: PolicyReaction<T>[];
}
export type ParamStatePolicies = Record<ParamName, StatePolicy<ParamValue>>;   // OPEN: still a Record
// ── Find (local search): the engine owns whether it is open, on the page part that scrolls (front layer, app-bar page).
//   open = (content scrolled and not closed) or opened or its text is not empty
export interface FindState { opened: boolean; closed: boolean }          // opened: the find button was pressed · closed: ✕ was pressed
export interface FindStatePolicy { opened: StatePolicy<boolean>; closed: StatePolicy<boolean> }   // mirrors FindState (e.g. both reset on scrollTop)
export interface BackLayerStatePolicy { expanded: StatePolicy<boolean>; headerHidden?: StatePolicy<boolean> }
export interface FrontLayerStatePolicy { scroll: StatePolicy<number>; find?: FindStatePolicy }   // find: required when the front header holds a find item
export interface BackdropPageStatePolicy { params: ParamStatePolicies; back: BackLayerStatePolicy; front: FrontLayerStatePolicy }
export interface PageSheetStatePolicy { expanded: StatePolicy<boolean> }
export interface AppBarPageStatePolicy { params?: ParamStatePolicies; scroll: StatePolicy<number>; find?: FindStatePolicy }
export interface PlayerPageStatePolicy extends AppBarPageStatePolicy { sheet: PageSheetStatePolicy }   // sheet mirrors PageSheetState

// ── Backdrop page. The back layer has named regions with fixed meanings:
//   header, actions and controls show concealed and revealed; panel shows only revealed, and scrolls when it doesn't fit.
export interface BackLayerConfig {
  header: HeaderConfig;
  actions?: ButtonItem[];
  controls?: ParamControlRowConfig[];    // param-control rows shown concealed and revealed, top to bottom
  panel?: ParamControlRowConfig[];       // param-control rows shown only revealed, top to bottom; they scroll when taller than the room
  toggleOnTap?: boolean;                 // default true
  hideHeaderOnScroll?: boolean;          // scrolling down hides the header region (BackLayerState.headerHidden)
}
export interface FrontHeaderConfig { title: PropValue; items: HeaderItem[] }   // the disclosure is built in: every front header has one
export type FrontCollapse = 'partial' | 'full';
export interface FrontLayerConfig { header: FrontHeaderConfig; collapse: FrontCollapse; content: ContentConfig }
export interface BackdropPageConfig {
  id: PageId;
  kind: 'backdrop';
  title: Title;
  params: Params;
  back: BackLayerConfig;
  front: FrontLayerConfig;
  statePolicy: BackdropPageStatePolicy;            // engine only: no contract reads it
}
// ── App-bar page: a header over content or a body. A player page is one with an inner sheet too (Now playing: Up next / Lyrics / Related)
export interface PageSheetConfig { paramControl?: ParamControlConfig; content: ContentConfig }   // paramControl: the tabs in its header
export interface AppBarPageConfig {
  id: PageId;
  kind: 'appBar';
  title: Title;
  header: HeaderConfig;
  params?: Params;
  content?: ContentConfig;               // scrolling content — or a fixed body; at most one (neither: the page is its header)
  body?: BodyItem[];
  statePolicy: AppBarPageStatePolicy;
}
export interface PlayerPageConfig extends AppBarPageConfig {   // kind 'appBar' too: the engine treats it as an app-bar page; its sheet tells it apart
  sheet: PageSheetConfig;
  statePolicy: PlayerPageStatePolicy;
}
export type PageConfig = BackdropPageConfig | AppBarPageConfig | PlayerPageConfig;

export interface DeckStatePolicy { stack: StatePolicy<StackEntry[]> }   // StackEntry: §I (type-only reference)
export interface DeckConfig { id: DeckId; name: string; page: BackdropPageConfig; linkTarget?: LinkTarget; statePolicy: DeckStatePolicy }   // its icon: composition (a token per deck)
export type HistoryMode = 'record' | 'ignore';
export interface HistoryByLayout { compact: HistoryMode; wide: HistoryMode }
export interface PeekConfig { header: HeaderConfig }
export interface BottomSheetForm { form: 'bottomSheet'; peek: PeekConfig; hidesNavWhenOpen: boolean }
export interface FloatingCardPeek extends PeekConfig { form: 'floatingCard'; persistsWhenOpen: boolean }
export interface SideSheetForm { form: 'sideSheet'; peek: FloatingCardPeek }
export interface SheetPresentation { kind: 'sheet'; compact: BottomSheetForm; wide: SideSheetForm }
export interface CoversNav { compact: boolean; wide: boolean }
export interface FullscreenPresentation { kind: 'fullscreen'; coversNav: CoversNav }
export type DrawerWideForm = 'modal' | 'rail';
export type DrawerForm = DrawerWideForm | 'modal';
export interface DrawerPresentation { kind: 'drawer'; scrim: boolean; wide?: DrawerWideForm }   // its edge and width: design
//   compact (and wide 'modal', the default): modal, covers nav, traps focus; back closes it.
//   wide 'rail': the navigation rail expands in place (its items show labels); joins the focus order (no trap); back closes it.
export type LayerPresentation = SheetPresentation | FullscreenPresentation | DrawerPresentation;
export interface LayerPages { base: PageId; set: Record<PageId, PageConfig> }   // OPEN: still a Record
export interface LayerStatePolicy { stack: StatePolicy<StackEntry[]>; open: StatePolicy<boolean> }
export interface LayerConfig {
  id: LayerId;
  name: string;
  pages: LayerPages;
  linkTarget?: LinkTarget;
  presentation: LayerPresentation;
  history: HistoryMode | HistoryByLayout;
  statePolicy: LayerStatePolicy;
}

// ═════════════════════════════════════════════════════════════
// H. APP CONFIG (fixed per app version; plain JSON, no functions)
// ═════════════════════════════════════════════════════════════
export interface NavigationConfig { items: ButtonItem[] }               // buttons beside the decks (the rail's menu toggle, Settings, Account)
export interface Shortcut { keys: string; intent: Intent; when?: 'pointer' | 'always' }
export interface LaunchConfig { minMs?: number }                        // the splash: composition
export interface Gate { id: GateId; when: SessionPredicate; page: PageConfig }
export type SessionInitial = Partial<SessionState>;
export interface SessionConfig { initial?: SessionInitial; gates: Gate[] }
// ── Route (§11): a URL names one destination — a gate, else an open recorded layer, else the active deck's stack
export interface RouteTable {
  base: string;
  deck: Record<DeckId, string>;
  layer?: Record<LayerId, string>;
  gate?: Record<GateId, string>;
  params?: 'none' | 'top';
}
//   /<deck>/<page>…?<name>=<value>&… · /<layer>/<page>… · /<gate>. Segments: slugs of item ids (lowercase; runs of anything
//   but letters, digits and '.' → '-'). Values: choice(s) → option slugs · text lowercased, '+' for spaces · flag 1|0 ·
//   range 'from..to'. Only values off the state policy default. Invariant: navigateUrl(url(state)) reproduces the destination.
// ── Wire (§16): the data section is the wire format
export interface WireEndpoint { ref: SourceRef; method: 'GET'; path: string; params?: Record<string, 'string' | 'number'> }
export interface Wire { endpoints: WireEndpoint[] }
export interface AppConfig {
  contractVersion: SemVer;
  decks: DeckConfig[];
  layers: LayerConfig[];
  startDeck: DeckId;
  breakpoints: Breakpoints;
  routes?: RouteTable;
  persist?: PersistPolicy;
  session?: SessionConfig;
  shortcuts?: Shortcut[];
  launch?: LaunchConfig;
  locales: LocaleConfig;
  texts: Record<LocaleId, Record<TextId, string>>;   // OPEN: still Records
  wire?: Wire;
  navigation: NavigationConfig;
  pages?: Record<PageTemplateId, PageConfig>;   // OPEN: still a Record · the opened page's id = parent id + '/' + item id
}

// ═════════════════════════════════════════════════════════════
// I. STATE (runtime, user-driven)
// ═════════════════════════════════════════════════════════════
export type Scoped<T> = T | Record<string, T>;   // a field with a state policy scope is stored per scope key
export interface BackLayerState {
  expanded: boolean;
  headerHidden?: boolean;
  more?: ParamName[];                    // whose More is open, newest last (the panel shows the newest); concealing closes them all
  scroll?: number;                       // the panel's collapse-first scroll (0 … the header's distance collapses it, then the panel scrolls); concealing resets it
}
export interface FrontLayerState { scroll: Scoped<number>; find?: FindState }   // collapse-first scroll offset (15.0): see PageScroll below
export interface PageSheetState { expanded: boolean }
export interface PageStateBase<C> {     // what every page's state holds
  config: C;
  opener?: ItemData;                     // an opened page: the item that opened it ($opener)
  template?: PageTemplateId;             // an opened page: its template (composition's page exceptions name it)
  params: Record<ParamName, Scoped<ParamValue>>;   // applied values: what the content fetches with
  pending?: Record<ParamName, ParamValue>;         // set but not applied ('onApply' params); the path 'pending.<name>' reads it, else the applied value
}
export interface BackdropPageState extends PageStateBase<BackdropPageConfig> { back: BackLayerState; front: FrontLayerState }
export interface AppBarPageState extends PageStateBase<AppBarPageConfig> {
  scroll: Scoped<number>;                // collapse-first scroll offset (15.0): see PageScroll below
  find?: FindState;
}
export interface PlayerPageState extends AppBarPageState { config: PlayerPageConfig; sheet: PageSheetState }
export type PageState = BackdropPageState | AppBarPageState | PlayerPageState;
export interface StackEntry { page: PageState; openedFrom: ItemId | null }
export interface DeckState { stack: StackEntry[] }
export interface LayerState { open: boolean; stack: StackEntry[] }
export interface OverlayEntry { spec: OverlaySpec; openedFrom: Origin | null }
export interface NavSurface { kind: 'nav' }
export interface DeckSurface { kind: 'backLayer' | 'frontLayer' | 'appBarPage'; deck: DeckId }
export interface LayerSurface { kind: 'layer'; layer: LayerId }
export interface OverlaySurface { kind: 'overlay'; id: string }
export type Surface = NavSurface | DeckSurface | LayerSurface | OverlaySurface;
export interface FocusReturn { opened: Surface; surface: Surface; element: string | null }
export interface NavRecord {
  kind: 'push' | 'deckSwitch' | 'layerOpen' | 'layerPush' | 'expand' | 'overlay' | 'param';
  deck?: DeckId;
  prevDeck?: DeckId;
  from?: DeckId;
  to?: DeckId;
  layer?: LayerId;
  id?: string;
  param?: ParamName;
  page?: PageId;
}
export interface AppState {
  launch: 'starting' | 'ready';
  device: Device;
  prefs: Prefs;
  session: SessionState;
  overlays: OverlayEntry[];
  focusReturns: FocusReturn[];
  activeDeck: DeckId;
  focus: DeckId | LayerId;
  decks: Record<DeckId, DeckState>;
  layers: Record<LayerId, LayerState>;
  history: NavRecord[];                  // pointer only; touch derives it
}
// Single window on every platform (§19). No WindowId in the contract.

// ═════════════════════════════════════════════════════════════
// J. EVENTS (emitted by the model; motion / data react)
// ═════════════════════════════════════════════════════════════
export interface PushedEvent { type: 'pushed'; target: Origin; openedFrom: ItemId | null; kind: PageConfig['kind'] }
export interface PoppedEvent { type: 'popped'; target: Origin; openedFrom: ItemId | null; kind: PageConfig['kind']; depth?: number }
export interface DeckSwitchedEvent { type: 'deckSwitched'; from: DeckId; to: DeckId }
export interface ExpandedChangedEvent { type: 'expandedChanged'; expanded: boolean; sheet?: boolean }   // sheet: an app-bar page's inner sheet
export interface HeaderVisibilityChangedEvent { type: 'headerVisibilityChanged'; hidden: boolean }
export interface MoreChangedEvent { type: 'moreChanged'; name: ParamName; opened: boolean }   // a More opened or closed (name: its param)
export interface ParamChangedEvent { type: 'paramChanged'; name: ParamName; motion: ParamMotion; direction: -1 | 0 | 1 }
export interface LayerEvent { type: 'layerOpened' | 'layerClosed'; layer: LayerId }
export interface OverlayEvent { type: 'overlayOpened' | 'overlayClosed'; id: string; result?: unknown }
export interface SessionChangedEvent { type: 'sessionChanged'; session: SessionState }
export interface UrlChangedEvent { type: 'urlChanged'; url: string; replace: boolean }
export interface RetryRequestedEvent { type: 'retryRequested'; dataSource: SourceRef; params: Record<string, unknown> }
export interface FocusRestoreEvent { type: 'focusRestore'; surface: Surface; element: string | null }
export interface LaunchedEvent { type: 'launched' }
export type QueuePosition = 'now' | 'next' | 'last';
export interface QueuedEvent { type: 'queued'; position: QueuePosition; count: number; from: ItemId | null }   // 14.3: a playQueue (now) / enqueue (next | last) took effect
export interface ExitEvent { type: 'exit' }
export type ModelEvent =
  | PushedEvent | PoppedEvent | DeckSwitchedEvent | ExpandedChangedEvent | HeaderVisibilityChangedEvent | MoreChangedEvent | ParamChangedEvent
  | LayerEvent | OverlayEvent | SessionChangedEvent | UrlChangedEvent | RetryRequestedEvent | FocusRestoreEvent | LaunchedEvent | ExitEvent | QueuedEvent;

// ═════════════════════════════════════════════════════════════
// K. DATA (fetched; keyed by dataSource + params) + CONTENT STATES (§17)
// ═════════════════════════════════════════════════════════════
export type Status = 'loading' | 'ready' | 'error';
export interface DataError { message: string; retryable: boolean }
export interface ContentData { status: Status; items: ItemData[]; total?: number; stale?: boolean; error?: DataError }
export interface DataSource { get(dataSource: SourceRef, params?: Record<string, unknown>): ContentData }
export interface DataLayer extends DataSource {
  status(ref: SourceRef, params?: Record<string, unknown>): Status;
  refresh(ref: SourceRef, params?: Record<string, unknown>): void;
  offline: boolean;
}
export type ContentViewState = 'loading' | 'ready' | 'empty' | 'error' | 'offlineStale';
export interface ContentView { state: ContentViewState; showItems: boolean; placeholders: number; banner: boolean; retry: boolean }   // which components: composition
// Rules: loading never shows items; empty never shows placeholders; retryable errors offer retry;
// offline with cached items shows them with a stale banner; offline without items = error.

// ═════════════════════════════════════════════════════════════
// L. QUERIES (derived — never stored)
// ═════════════════════════════════════════════════════════════
export type BackAction = 'closeOverlay' | 'closeDrawer' | 'closeMore' | 'collapse' | 'collapseSheet' | 'resetParam' | 'pop' | 'popLayer' | 'closeLayer' | 'startDeck' | 'undoRecord' | 'exit';
export type SideMode = 'beside' | 'modal' | 'auto';
export type FrontPosition = 'expanded' | 'partial' | 'full';
export interface ItemGroup { key: string; items: ItemData[] }
export type Scope = Record<string, unknown>;   // OPEN: '$item', '$group' … for values resolved in a list
export interface Queries {
  layoutClass(state: AppState, config: AppConfig): LayoutClass;
  sideMode(state: AppState, config: AppConfig, layer: LayerId): SideMode | null;
  currentPage(state: AppState): PageState;
  underPage(state: AppState): BackdropPageState;
  isBase(state: AppState): boolean;
  frontPosition(state: AppState): FrontPosition;
  contentParams(page: PageState): Record<string, unknown>;
  paramOptions(state: AppState, config: AppConfig, page: PageState, name: ParamName): ParamOption[];
  paramTarget(state: AppState, intent: Intent): PageState | null;
  visibleItems(page: PageState, data: ContentData): ItemData[];
  presentation(page: PageState): PresentationConfig;
  groups(state: AppState, config: AppConfig, page: PageState, items: ItemData[]): ItemGroup[];   // the first matching GroupSpec; one group '' without one. A partition: order kept
  navVisible(state: AppState, config: AppConfig): boolean;
  historyMode(state: AppState, config: AppConfig, layer: LayerConfig): HistoryMode;
  backAction(state: AppState, config: AppConfig): BackAction;
  historyEntries(state: AppState, config: AppConfig): NavRecord[];
  url(state: AppState, config: AppConfig): string;
  gate(state: AppState, config: AppConfig): GateId | null;
  snapshot(state: AppState, config: AppConfig): Snapshot;
  intentForShortcut(state: AppState, config: AppConfig, keys: string): Intent | null;
  contentView(page: PageState, data: ContentData, config: AppConfig, offline: boolean): ContentView;
  focusOrder(state: AppState, config: AppConfig): Surface[];
  supports(state: AppState, config: AppConfig, intent: Intent): boolean;
  derived(state: AppState, config: AppConfig, id: DerivedId, page: PageState | null, of?: StatePath): unknown;
  condition(state: AppState, config: AppConfig, cond: Condition, page: PageState | null, scope?: Scope): boolean;
  value(state: AppState, config: AppConfig, v: PropValue, page: PageState | null, scope?: Scope): unknown;   // 18.0: a config value → plain (contracts)
  resolved(x: unknown, page: PageState | null, scope?: Scope): unknown;   // 18.0: binds inside an action resolved
  playerView(): PlayerState | undefined;                                  // 18.0: with current
  text(state: AppState, config: AppConfig, ref: TextRef | TextId): string;
  dir(state: AppState, config: AppConfig): Direction;
}

// ═════════════════════════════════════════════════════════════
// M. LAYOUT (§14) — pure "what to draw and how it moves" (no pixels, no timers)
// ═════════════════════════════════════════════════════════════
export interface LayoutEnv { layout: LayoutClass; touch: boolean; sheet: 'none' | 'beside' | 'over'; dir: Direction }
export interface Geometry { width: number; height: number; railWidth: number; navHeight: number; peekHeight: number; contentWidth: number; contentHeight: number }
export interface LayoutGeometry extends Geometry { side: SideMode | null; wide: boolean; navigation: HireName | null }
export interface FrontLayerView { top: number; state: 'expanded' | 'partlyCollapsed' | 'fullyCollapsed'; visual: Record<string, unknown> }
// PageScroll (15.0): a page's scroll (FrontLayerState.scroll / AppBarPageState.scroll) is collapse-first — 0 … distance
//   (expandedHeight − height) collapses the bar while the content stays put (the page grows); beyond it the content scrolls by
//   (scroll − distance). Scrolling back: the content returns to its top first, then the bar expands. No expanded slot: distance 0.
export interface BarView { height: number; progress: number; distance: number }   // a bar with an expanded slot: current height + collapse progress (0 … 1) + collapse distance
export interface FrontLayerContext { measured?: Record<string, number> }
export interface TransitionDescriptor { kind: MotionId | 'instant'; [param: string]: unknown }   // 17.0: a resolved KindStep (temporary, see §N)
export type MotionTrigger = 'change' | 'press' | 'release' | 'loop';
export interface Measurements { itemRect?: Rect; targetRect?: Rect; origin?: Point; shared?: Record<string, Rect> }   // shared: element rects that move between pages (e.g. { image })
// Directions in motion params are logical (+1 = toward the end side). Shells mirror them in RTL.

// ═════════════════════════════════════════════════════════════
// M2. CONTRACTS (18.0) — what each drawn config object offers whatever draws it (api/contracts.js, the single source)
//   config: the object · values: current, computed by core from State, queries and Layout (never stored) ·
//   intents: what it may send · children: config fields holding other drawn objects (each drawn by its own hire).
//   Engine-only config (state policy, collapse, routes …) is never offered as a value.
// ═════════════════════════════════════════════════════════════
export type SheetForm = 'bottomSheet' | 'sideSheet';
export type ItemShape = 'circle' | 'square';   // people draw circular, collections square (ItemData.shape)
export type HireName = string;
export interface Contract<C, V, I> { config: C; values: V; intents: I }
export interface NoValues {}
export type NoIntents = never;

export type BackLayerRegionName = 'header' | 'actions' | 'controls' | 'panel';   // controls: BackLayerConfig.controls · panel: BackLayerConfig.panel, or the open More (then alone, at the top)
export interface ParamControlOption {   // one choice, as a param control's values give it
  value: string;                         // 'jazz'
  label: string;                         // "Jazz", resolved in the current locale
  selected: boolean;                     // part of the control's current value (the pending one if any)
}
export interface BackLayerRegionView {   // Layout
  region: BackLayerRegionName;
  top: number;
  height: number;                        // visible height: the panel's is at most the room above the front layer's header
  opacity: number;
  interactive: boolean;
  scrolls: boolean;                      // its content is taller than its height (the panel only)
}
export interface ContentView { state: ContentViewState; showItems: boolean; placeholders: number; banner: boolean; retry: boolean }   // replaces api.d.ts ContentView: no component ids (composition picks them)
// <contracts:generated> — from api/contracts.js by api/gen-contracts.js; do not edit
// button
export interface ButtonValues { label: string; checked: boolean | null; state: string | null; interaction: InteractionView }
export interface ButtonContract extends Contract<ButtonItem, ButtonValues, Actions> {}
// logo
export interface LogoValues { label: string; playing: boolean }
export interface LogoContract extends Contract<LogoItem, LogoValues, Actions> {}
// text
export interface TextValues { text: string }
export interface TextContract extends Contract<TextItem, TextValues, NoIntents> {}
// switch: steps its param to the next option
export interface SwitchValues { label: string; value: ParamValue | null; next: ParamValue | null; options: ParamOption[] }
export interface SwitchContract extends Contract<SwitchItem, SwitchValues, SetParamsIntent> {}
// find: closeLabel: text find.close
export interface FindValues { open: boolean; value: string; placeholder: string; closeLabel: string }
export interface FindContract extends Contract<FindItem, FindValues, OpenFindIntent | CloseFindIntent | SetParamsIntent> {}
// detail
export interface DetailValues { title: string; subtitle: string | null; image: string | null; meta: string | null }
export interface DetailContract extends Contract<DetailConfig | DetailItem, DetailValues, NoIntents> {}
// seek
export interface SeekValues { label: string; positionMs: number; durationMs: number | null }
export interface SeekContract extends Contract<SeekItem, SeekValues, Seek> {}
export type HeaderItemContract = ButtonContract | LogoContract | TextContract | SwitchContract | FindContract;
// header: progress: collapse 0 … 1 (Layout.barView) · scroll: dragging its detail scrolls the surface below it (the panel while revealed, else the content)
export interface HeaderValues { title: string | null; progress: number }
export interface HeaderChildren { items: HeaderItemContract[]; detail?: DetailContract }
export interface HeaderContract extends Contract<HeaderConfig, HeaderValues, ScrollIntent> { children: HeaderChildren }
// paramControl: value: the pending one if any, else applied · options: every choice, in config order (empty for plain text or a range) · label / placeholder: the param's, resolved · min / max: a number param's · more: it offers More (config more)
export interface ParamControlValues { value: ParamValue | null; options: ParamControlOption[]; pending: boolean; label: string | null; placeholder: string | null; min: number | null; max: number | null; more: boolean }
export interface ParamControlContract extends Contract<ParamControlConfig, ParamControlValues, SetParamsIntent | ToggleParamIntent | ApplyParamsIntent | DiscardParamsIntent | OpenMoreIntent> {}
// paramControlRow: its controls whose when holds · label: its first control's (design decides whether the row draws it)
export interface ParamControlRowValues { label: string | null }
export interface ParamControlRowChildren { controls: ParamControlContract[] }
export interface ParamControlRowContract extends Contract<ParamControlRowConfig, ParamControlRowValues, NoIntents> { children: ParamControlRowChildren }
// paramControlMore: the open More: title: its param's label · paramControls: its rows (default: one row, a control for the same param)
export interface ParamControlMoreValues { title: string | null }
export interface ParamControlMoreChildren { paramControls: ParamControlRowContract[] }
export interface ParamControlMoreContract extends Contract<ParamControlMoreConfig, ParamControlMoreValues, CloseMoreIntent> { children: ParamControlMoreChildren }
// item: action: open it (ItemData.opens), else the presentation's itemAction · entries: a shelf's (absent on other items) (recursive: refers to itself)
export interface ItemValues { title: string; subtitle: string | null; image: string | null; shape: ItemShape; current: boolean; navigable: boolean }
export interface ItemChildren { entries?: ItemContract[] }
export interface ItemContract extends Contract<PresentationConfig, ItemValues, Actions> { children: ItemChildren }
// contentState: empty · error · offlineStale (the banner) · its words are design texts of the free component
export interface ContentStateValues { state: ContentViewState; retry: boolean }
export interface ContentStateContract extends Contract<ContentConfig, ContentStateValues, RetryIntent> {}
// content
export interface ContentValues { view: ContentView; presentation: PresentationKey; groups: ItemGroup[]; placeholders: number }
export interface ContentChildren { items: ItemContract[]; state?: ContentStateContract; banner?: ContentStateContract }
export interface ContentContract extends Contract<ContentConfig, ContentValues, NoIntents> { children: ContentChildren }
// backLayer: toggle only while toggleOnTap · scroll: its panel scrolled (always the panel surface) · more: the newest open More (BackLayerState.more)
export interface BackLayerValues { expanded: boolean; headerHidden: boolean; regions: BackLayerRegionView[] }
export interface BackLayerChildren { header: HeaderContract; actions: ButtonContract[]; controls: ParamControlRowContract[]; panel: ParamControlRowContract[]; more?: ParamControlMoreContract }
export interface BackLayerContract extends Contract<BackLayerConfig, BackLayerValues, ToggleExpandedIntent | ScrollIntent> { children: BackLayerChildren }
// frontHeader: the built-in disclosure: the back layer's expanded + its label (texts backLayer.reveal / backLayer.conceal)
export interface FrontHeaderValues { title: string; expanded: boolean; disclosureLabel: string }
export interface FrontHeaderChildren { items: HeaderItemContract[] }
export interface FrontHeaderContract extends Contract<FrontHeaderConfig, FrontHeaderValues, ToggleExpandedIntent> { children: FrontHeaderChildren }
// frontLayer: top: Layout.frontLayer · contentOffset: Layout.contentOffset
export interface FrontLayerValues { position: FrontPosition; top: number; contentOffset: number }
export interface FrontLayerChildren { header: FrontHeaderContract; content: ContentContract }
export interface FrontLayerContract extends Contract<FrontLayerConfig, FrontLayerValues, ScrollIntent> { children: FrontLayerChildren }
// backdropPage
export interface BackdropPageChildren { back: BackLayerContract; front: FrontLayerContract }
export interface BackdropPageContract extends Contract<BackdropPageConfig, NoValues, NoIntents> { children: BackdropPageChildren }
// pageSheet
export interface PageSheetValues { expanded: boolean }
export interface PageSheetChildren { paramControl?: ParamControlContract; content: ContentContract }
export interface PageSheetContract extends Contract<PageSheetConfig, PageSheetValues, ToggleExpandedIntent> { children: PageSheetChildren }
export type BodyItemContract = ButtonContract | TextContract | DetailContract | SeekContract;
// appBarPage
export interface AppBarPageValues { contentOffset: number }
export interface AppBarPageChildren { header: HeaderContract; content?: ContentContract; body: BodyItemContract[] }
export interface AppBarPageContract extends Contract<AppBarPageConfig, AppBarPageValues, ScrollIntent> { children: AppBarPageChildren }
// playerPage (extends appBarPage): an app-bar page with an inner sheet (Now playing: Up next / Lyrics / Related)
export interface PlayerPageChildren extends AppBarPageChildren { sheet: PageSheetContract }
export interface PlayerPageContract extends Contract<PlayerPageConfig, AppBarPageValues, ScrollIntent> { children: PlayerPageChildren }
export type PageContract = BackdropPageContract | AppBarPageContract | PlayerPageContract;
// sheetLayer: open: the peek was tapped · peek: Layout.peekPlacement
export interface SheetLayerValues { open: boolean; form: SheetForm; side: SideMode | null; peek: Rect | null }
export interface SheetLayerChildren { peek: HeaderContract; page: PageContract }
export interface SheetLayerContract extends Contract<LayerConfig, SheetLayerValues, OpenLayerIntent | CloseLayerIntent> { children: SheetLayerChildren }
// drawerLayer: close: the scrim was tapped
export interface DrawerLayerValues { open: boolean; form: DrawerForm }
export interface DrawerLayerChildren { page: PageContract }
export interface DrawerLayerContract extends Contract<LayerConfig, DrawerLayerValues, CloseLayerIntent> { children: DrawerLayerChildren }
// fullscreenLayer
export interface FullscreenLayerValues { open: boolean }
export interface FullscreenLayerChildren { page: PageContract }
export interface FullscreenLayerContract extends Contract<LayerConfig, FullscreenLayerValues, NoIntents> { children: FullscreenLayerChildren }
// destination
export interface DestinationValues { deck: DeckId; label: string; selected: boolean }
export interface DestinationContract extends Contract<DeckConfig, DestinationValues, SwitchDeckIntent | ReselectDeckIntent> {}
// navigation: selected: the active deck · expanded: a rail-form drawer is open · items: drawn where a form has room (the rail)
export interface NavigationValues { selected: DeckId; expanded: boolean }
export interface NavigationChildren { destinations: DestinationContract[]; items?: ButtonContract[] }
export interface NavigationContract extends Contract<NavigationConfig, NavigationValues, NoIntents> { children: NavigationChildren }
// splash
export interface SplashValues { label: string }
export interface SplashContract extends Contract<LaunchConfig, SplashValues, NoIntents> {}
// overlay: items: a menu's
export interface OverlayValues { title: string | null; body: string | null; confirm: string | null; cancel: string | null; text: string | null; action: string | null }
export interface OverlayChildren { items?: ButtonContract[] }
export interface OverlayContract extends Contract<OverlaySpec, OverlayValues, CloseOverlayIntent> { children: OverlayChildren }
export type ContractName = 'button' | 'logo' | 'text' | 'switch' | 'find' | 'detail' | 'seek' | 'header' | 'paramControl' | 'paramControlRow' | 'paramControlMore' | 'item' | 'contentState' | 'content' | 'backLayer' | 'frontHeader' | 'frontLayer' | 'backdropPage' | 'pageSheet' | 'appBarPage' | 'playerPage' | 'sheetLayer' | 'drawerLayer' | 'fullscreenLayer' | 'destination' | 'navigation' | 'splash' | 'overlay';
// </contracts:generated>

// ── The contract tree (core/contracts.js): this moment's drawn config objects, each with what composition hired to draw it
export type NodeKey = string;            // a node's place in the tree: 'deck:browse.back.header.items:menu' (instance identity)
export type NodeEvent = (payload?: unknown) => Intent | ActionResult | null;
export interface ActionResult { action: Actions }   // the config's own action (an item's open / itemAction, a button's action)
export interface ContractNode {
  key: NodeKey;
  contract: ContractName;
  at: Place;                             // §Q: what placement matched on
  page: PageState | null;
  config: unknown;                       // the contract's config type
  values: unknown;                       // the contract's values type
  children: unknown;                     // the contract's children type, as nodes
  hire: HireName | null | undefined;     // null: not drawn here · undefined: no placement (a rule fails)
  component: ComponentId | null;         // the hire's free component
  variants: VariantPicks;
  props: NodeProps;                      // the free component's props, clauses resolved
  slots: NodeSlots;                      // the free component's slots, filled with nodes
  events: NodeEvents;                    // the free component's events → what they send
  shown?: boolean;                       // false: an item whose when does not hold (drawn hidden)
}
export interface VariantPicks { [axis: string]: string }   // OPEN: keyed by axis
export interface NodeProps { [prop: string]: unknown }     // OPEN: keyed by prop
export interface NodeSlots { [slot: string]: ContractNode[] }   // OPEN: keyed by slot
export interface NodeEvents { [event: string]: NodeEvent }      // OPEN: keyed by event
export interface ContractTree { navigation: ContractNode; deck: ContractNode; layers: ContractNode[]; overlays: ContractNode[]; splash: ContractNode | null }

// ═════════════════════════════════════════════════════════════
// N. SPECS (§15) — design-system data
// ═════════════════════════════════════════════════════════════
export type PropType = 'string' | 'number' | 'boolean' | 'token' | 'slot' | 'string[]' | 'value' | 'options' | 'list';   // 'slot': a hole filled from outside
export type TokenSet = Record<string, string | number>;
export interface TokenRef { token: string }
export type MotionParamType = 'duration' | 'easing' | 'number' | 'string' | 'boolean';
export interface SurfaceRole { role: string }
// 17.0 TEMPORARY (removed when every motion is steps): hand-built motion kinds, played through KindStep
export interface MotionParam { type: MotionParamType; default?: unknown }
export interface MotionDef { params: Record<string, MotionParam>; reduced: MotionId | 'instant' }
export type MotionRegistry = Record<MotionId, MotionDef>;
// recursive: refers to VariantCases, IfVisual (defined below)
export type VisualValue = TokenRef | string | number | null | SurfaceRole | VariantCases | IfVisual;
export interface IfVisual { if: Condition; then: VisualValue; else: VisualValue }
export interface VariantCases { variant: string; cases: Record<string, VisualValue> }
export type Visuals = Record<string, Record<string, VisualValue>>;
export interface VariantAxis { options: string[]; default: string }
export interface PlaceholderForm { visuals?: Visuals }
export type StatusState = 'selected' | 'checked' | 'indeterminate' | 'busy' | 'error' | 'dragged';
export declare const STATUS_STATES: readonly StatusState[];
export interface ComponentDef {
  extends?: ComponentId;
  variant?: true;
  states?: string[];
  props?: Record<string, PropType>;
  variants?: Record<string, VariantAxis>;
  statuses?: StatusState[];
  motion?: Record<string, Step[]>;       // 17.0: component motion as steps (key: a visual or a trigger name)
  parts?: string[];                      // 17.0: pieces the component draws itself that motion may name ('<component>.<part>')
  placeholder?: PlaceholderForm;
  provides?: Record<string, VisualValue>;
  visuals?: Visuals;
  optional?: string[];                   // props a hire may leave unfed (a button's icon); inherited (union)
  events?: FreeEventSpec[];              // 18.0: what it emits (composition maps each to an intent)
  option?: ComponentId;                  // 18.0: the component each of its options is drawn as (tabBar → tab); inherited; registered, interactive
}
export interface FreeEventSpec { name: string; payload: PropType | null }
export type ComponentRegistry = Record<ComponentId, ComponentDef>;
export interface StackPattern { event: 'pushed' | 'popped'; kind?: PageConfig['kind'] | 'layerPage' }
export interface SurfacePattern { event: 'deckSwitched' | 'expandedChanged' | 'layerOpened' | 'layerClosed' | 'overlayOpened' | 'overlayClosed'; layer?: LayerId }
export interface ParamPattern { event: 'paramChanged'; motion?: ParamMotion }
export interface MorePattern { event: 'moreChanged'; opened?: boolean }
export interface SessionPattern { event: 'sessionChanged'; signedIn?: boolean }
export interface QueuedPattern { event: 'queued'; position?: QueuePosition }
export interface PlainPattern { event: 'headerVisibilityChanged' | 'launched' | 'urlChanged' | 'retryRequested' | 'focusRestore' | 'exit' }
export type ChoreoPattern = StackPattern | SurfacePattern | ParamPattern | MorePattern | SessionPattern | QueuedPattern | PlainPattern;   // every field given must match the event

// ── 17.0 MOTION AS STEPS: choreography says which piece does what, when. Platforms implement the four blocks (tween, travel, swap,
// reveal) once and play any rule. Measures resolve on the platform, after the commit, at rest. Directions are logical (RTL mirrors).
export type PieceRef = string;
//   '<contract>.<child>' (api/contracts.js) · '<component>.<slot|part>' (ComponentDef props of type slot / parts) · '<component>' (its visible instance) ·
//   'source' / 'target' / 'origin' (the event's pieces: the tapped item / its counterpart on the new page / the control the user
//   activated; '.image' etc. = their parts) · '<step id>' (a step's copy) · suffix '[]' = each child (lists), '[last]' / '[first]'
//   = one of them · '@before' / '@after' = the piece as it was before / is after the change (a swap of one piece's content)
export type StepId = string;
export type SequenceId = string;
export interface ByEvent { by: string; cases: Record<string, MotionValue> }        // an event field picks ('position', 'direction')
export interface RectOf { rect: PieceRef; dx?: MotionValue; dy?: MotionValue }
export interface EdgeOf { edge: PieceRef; side: 'top' | 'bottom' | 'start' | 'end' }
export interface DistanceOf { distance: PieceRef[]; axis: 'x' | 'y' }            // [from, to]
export interface CentreOn { centreOn: PieceRef }
export interface PressPoint { point: 'press' }
export interface ScrollInto { into: PieceRef; margin?: MotionValue }             // the scroll value that shows the piece whole
// recursive: Measure and ByEvent refer to MotionValue
export type Measure = RectOf | EdgeOf | DistanceOf | CentreOn | PressPoint | ScrollInto;
export interface Wander { between: MotionValue[]; seed?: number }             // a value roaming between bounds (level meter)
export type MotionValue = number | string | boolean | TokenRef | SurfaceRole | Measure | ByEvent | Wander;
export type MotionProp = 'opacity' | 'translateX' | 'translateY' | 'scale' | 'rotate' | 'width' | 'height' | 'radius' | 'color' | 'shadow' | 'clip' | 'scroll' | 'visibility';
export interface Keyframe { at: number; value: MotionValue }                      // at: 0 … 1
export type FromValue = MotionValue | 'current' | 'previous';                    // current: where it is now · previous: where it was before the change
export interface PropTrack { from?: FromValue; to?: MotionValue; keys?: Keyframe[]; easing?: MotionValue }
export type PropTracks = Record<string, PropTrack>;                             // a MotionProp, or a visual of the piece's component (fill, indicator …)
export interface Anchor { step: StepId; point: 'start' | 'end' | 'apex' | 'landed' | number }   // number = share of that step
export interface TimeClock { clock: 'time'; ms: MotionValue; easing: MotionValue; delay?: MotionValue; at?: Anchor }   // ms 'path': msPerPx × path length
export type ProgressSource = 'bar' | 'scroll' | 'contentOffset';
export interface ProgressClock { clock: 'progress'; of: ProgressSource; from: number; to: number; easing?: MotionValue }   // input-driven: applied directly
export type Clock = TimeClock | ProgressClock;
export interface Stagger { each: MotionValue; order: 'startFirst' | 'endFirst' }
export interface Loop { count: number | 'forever'; phase?: MotionValue; period?: MotionValue }   // per item (lists): phase = share of the period; period = its own length
export interface EventIs { event: string; equals: unknown }                       // a field of the event
export interface PieceShown { shown: PieceRef }
export type MotionCondition = Condition | EventIs | PieceShown;
export type StepTrigger = 'change' | 'press' | 'release' | 'loop';               // component motion: when it runs (default change)
export interface TweenStep { do: 'tween'; id?: StepId; piece: PieceRef; props: PropTracks; clock: Clock; stagger?: Stagger; loop?: Loop; hold?: Anchor; when?: MotionCondition; trigger?: StepTrigger }
export interface ArcPath { apex: 'start' | 'destination' | 'higher'; rise: MotionValue; minFall: MotionValue; msPerPx?: MotionValue }
export type TravelPath = 'straight' | ArcPath;
export interface JoinEnd { join: PieceRef; under?: PieceRef }                     // becomes part of that piece (rides its motion)
export type TravelEnd = 'vanish' | JoinEnd | ByEvent;
export interface TravelStep {
  do: 'travel'; id?: StepId; piece: PieceRef; to: PieceRef | Measure | ByEvent; path: TravelPath; end: TravelEnd; clock: Clock;
  from?: 'whole' | 'visible';           // default whole; visible: only the part not covered by cutBy (start and landing)
  cutBy?: PieceRef[];
  shrinkBy?: Anchor; props?: PropTracks; when?: MotionCondition;
}
export interface Enter { pieces: PieceRef[]; stagger: Stagger; clock: Clock; distance: MotionValue }
export interface SwapAxis { axis: 'x' | 'y'; distance: MotionValue; direction: MotionValue }
export interface SwapStep {
  do: 'swap'; id?: StepId; out: PieceRef[]; in: PieceRef[]; commit: boolean;   // commit: the engine's state change happens between out and in
  ms: MotionValue; split: MotionValue; easingOut: MotionValue; easingIn: MotionValue; scaleIn?: MotionValue;
  match?: 'slot+content'; enter?: Enter; axis?: SwapAxis; when?: MotionCondition;
}
export interface CircleShape { circle: PressPoint | CentreOn }
export interface RectShape { fromRect: PieceRef; toRect: PieceRef }
export interface EdgeShape { followEdge: EdgeOf; keep: 'before' | 'after' }      // shown on one side of a moving edge
export type RevealShape = CircleShape | RectShape | EdgeShape;
export interface RevealStep { do: 'reveal'; id?: StepId; piece: PieceRef; shape: RevealShape; reverse?: boolean; clock: Clock; when?: MotionCondition; trigger?: StepTrigger }
export interface UseStep { do: 'use'; sequence: SequenceId; with?: Record<string, MotionValue> }   // '$<param>' in the sequence's values
export interface KindStep { do: 'kind'; kind: MotionId | 'instant'; trigger?: MotionTrigger; [param: string]: unknown }   // TEMPORARY: a hand-built kind
export type Step = TweenStep | TravelStep | SwapStep | RevealStep | UseStep | KindStep;
export interface Sequence { params?: Record<string, MotionParamType>; steps: Step[] }
export interface ChoreoRule { on: ChoreoPattern; steps: Step[]; reduced?: Step[] }
export interface Choreography { rules: ChoreoRule[]; reduced: Step[]; sequences?: Record<SequenceId, Sequence> }   // reduced: the default replacement
export interface Specs {
  tokens: TokenSet;
  components: ComponentRegistry;
  choreography: Choreography;
  motions: MotionRegistry;              // TEMPORARY (KindStep)
}
export interface VisualContext { surface?: ComponentId; variant?: Record<string, string>; env?: LayoutEnv; page?: PageState | null; status?: StatusState[] }
export interface PlatformManifest { platform: string; implements: ComponentId[]; motions?: MotionId[] }   // motions: TEMPORARY (kinds still hand-built)
// Rules: every component composition hires is registered and implemented by every platform (variants count where their parent is);
// composition rules (api/composition-rules.js) check hires, clauses, placements and tokens against the contracts and design;
// texts exist in every locale and parse; data components declare placeholders; every piece a step names is declared; anchors name steps;
// every ModelEvent type has a choreography rule; every param motion names a paramChanged rule.

export interface Layout {
  env(state: AppState, config: AppConfig, q: Queries): LayoutEnv;
  sizes(look: Look): ModelSizes;         // 18.0: createModel's sizes (the wide look)
  geometry(state: AppState, config: AppConfig, q: Queries, look: Look): LayoutGeometry;
  regions(page: BackdropPageState, look: Look, measured?: Record<string, number>, geometry?: Geometry): BackLayerRegionView[];   // fixed regions: header · actions · controls · panel (revealed only; with geometry, held to the room above the front layer's header)
  barView(page: PageState, look: Look, within?: ContractName[]): BarView;   // the header hire's height / expandedHeight (with a detail); progress = min(1, scroll / distance)
  contentOffset(page: PageState, look: Look, within?: ContractName[]): number;   // 15.0: the content's own offset = max(0, scroll − barView.distance)
  panelOffset(page: BackdropPageState, look: Look): number;   // 18.0: the back layer panel's own offset = max(0, back.scroll − barView.distance)
  resolveVisuals(specs: Specs, component: ComponentId, state: string, ctx?: VisualContext): Record<string, unknown>;
  frontLayer(page: BackdropPageState, g: LayoutGeometry, look: Look, ctx?: FrontLayerContext, peek?: number): FrontLayerView;
  stepsFor(event: ModelEvent, specs: Specs, prefs: Prefs): Step[];                         // 17.0: the rule's steps, tokens / ByEvent / sequences resolved
  componentSteps(specs: Specs, component: ComponentId, key: string, prefs: Prefs): Step[];   // 17.0
  transitionFor(event: ModelEvent, specs: Specs, prefs: Prefs, measure?: Measurements): TransitionDescriptor;   // TEMPORARY: the rule's first KindStep
  motionFor(specs: Specs, component: ComponentId, key: string, prefs: Prefs): TransitionDescriptor;            // TEMPORARY
  peekPlacement(state: AppState, config: AppConfig, g: LayoutGeometry, frontTop: number, page: BackdropPageState | null, look: Look): Rect | null;
}

// ═════════════════════════════════════════════════════════════
// O. INTERACTION (§20) — buttons, nav items, list rows, chips…
// The component never decides "enabled": it's derived from its action(s) against the current state.
// ═════════════════════════════════════════════════════════════
export type InteractionState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';
export declare const INTERACTION_STATES: readonly InteractionState[];
export interface InteractionFacts { checked?: boolean | 'mixed' }
export interface InteractionInput { hovered: boolean; pressed: boolean; focused: boolean; focusVisible: boolean; dragging?: boolean }
export interface InteractiveComponent { id: NodeKey; component: ComponentId; action: Actions; label: string }
export interface InteractionFlags { hover: boolean; pressed: boolean; focus: boolean; keyboardFocus: boolean }
export interface InteractionView {
  state: InteractionState;               // disabled > pressed > keyboardFocus > focus > hover > enabled
  enabled: boolean;
  flags: InteractionFlags;
  status: StatusState[];
  activatable: boolean;
}
// Rules: available iff nav → supports; player → player.supports; shell → listed; a list → every member; null → false.
// Unavailable → disabled. Idempotent actions stay enabled. Busy blocks activation but is not disabled. Statuses come from the
// first action of a list. Every interactive registry entry declares all six states.

// ═════════════════════════════════════════════════════════════
// P. MODEL (what an implementation exposes)
// ═════════════════════════════════════════════════════════════
export interface Model {
  readonly config: AppConfig;
  readonly data: DataSource;
  readonly player?: PlayerModel;         // read by '$player' paths and PlayerIs conditions
  getState(): AppState;
  dispatch(intent: Intent): ModelEvent[];
  query: Queries;
}
export interface ModelSizes { railWidth: number; sideSheetWidth: number }   // from design through composition (Layout.sizes)
export type CreateModel = (config: AppConfig, device: Device, data: DataSource, player?: PlayerModel, sizes?: ModelSizes) => Model;
export interface InteractionEnv { model: Model; player?: PlayerModel; shellActions?: readonly ShellActionId[] }
export declare function actionAvailable(action: Actions, env: InteractionEnv): boolean;
export declare function resolveInteraction(action: Actions, input: InteractionInput, env: InteractionEnv, facts?: InteractionFacts): InteractionView;
export declare function statusOf(action: Actions, env: InteractionEnv, facts?: InteractionFacts): StatusState[];
// 14.3: run a player action; a playQueue / enqueue that took effect also yields its QueuedEvent (choreography 'queued')
export interface PlayerActionResult { commands: PlayerCommand[]; events: QueuedEvent[] }
export declare function playerAction(player: PlayerModel, intent: PlayerIntent, from?: ItemId | null): PlayerActionResult;

// ═════════════════════════════════════════════════════════════
// Q. COMPOSITION (app/composition.json) — hires free components for contracts and places them by config kind.
//   Holds no look values: a fixed value is one of the hire's own tokens, which aliases a design token.
// ═════════════════════════════════════════════════════════════
export type TokenName = string;          // a design token: 'size.iconButton.md', 'icon.menu'
export interface HireToken { name: TokenName; alias: TokenName }   // minted for this hire ('<hire>.<name>'); must alias a design token
export interface VariantPick { axis: string; option: string }

export type PropName = string;
export type EventName = string;
export type SlotName = string;
export type ChildName = string;          // a field of a contract's children: 'header', 'items', 'panel' …
export type ValueName = string;          // a field of a contract's values: 'expanded', 'top' …

// ── Clauses: one component name ↔ one contract name. Implied where the names match; written only where they differ.
export interface PropFrom { prop: PropName; value: ValueName }      // prop ← a contract value
export interface PropFixed { prop: PropName; token: TokenName }     // prop ← one of the hire's tokens
export type DesignTextId = string;       // a design text: words a free component needs whatever it draws ('content.empty', 'range.from')
export interface PropText { prop: PropName; text: DesignTextId }    // prop ← a design text (design/texts/<locale>.json)
export interface TokenCase { equals: string; token: TokenName }
export interface PropByValue { prop: PropName; value: ValueName; cases: TokenCase[] }   // prop ← a hire token picked by a value (view switch icon)
export type PlayerIntentType = PlayerIntent['type'];
export interface EventTo { event: EventName; send: IntentType | PlayerIntentType | 'action'; apply?: true }   // an intent the contract accepts · action: the item's config action · apply: setParams applies at once (picking a suggestion)
export interface ItemSelector { kind?: ItemKind; name?: ItemName; rest?: true }   // rest: every item not picked by another slot
export interface FromChild { child: ChildName; pick?: ItemSelector[] }   // a child, or the picked items of a list child, in order
export interface FromHire { hire: HireName }                             // a hire on this same contract (a header's title, the built-in disclosure)
export type SlotSource = FromChild | FromHire;
export interface SlotFrom { slot: SlotName; fill: SlotSource[] }
export type Clause = PropFrom | PropFixed | PropText | PropByValue | EventTo | SlotFrom;

export interface Hire {
  name: HireName;
  hires: ComponentId;                    // exactly one free component
  contract: ContractName;                // exactly one contract
  clauses: Clause[];
  variants?: VariantPick[];
  tokens?: HireToken[];
}

// ── Placements: which hire draws each config object, by contract (and, for items, kind / name / presentation)
export interface ParamMatch { name?: ParamName; type?: ParamType; axis?: boolean; options?: boolean }   // param controls: picked by the bound param (its name, or its spec) · options: the control brings its own choices
export interface Placement {
  contract: ContractName;
  within?: ContractName | ContractName[];   // the nearest ancestor contract, or the nearest few in order (['appBarPage', 'sheetLayer']: a layer page's header)
  overlay?: OverlayKind;         // overlays: by kind
  match?: ItemSelector;                  // items: a kind or a name (destinations: the deck id; overlays: the kind)
  param?: ParamMatch;                    // param controls
  presentation?: PresentationKey;        // content items
  state?: ContentViewState;              // content states: empty · error · offlineStale
  env?: EnvEquals;                       // e.g. layout compact only
  hire: HireName | null;                 // null: not drawn here (e.g. the menu button on wide, where the rail has it)
}
export interface PageExceptions { page: PageId; placements: Placement[] }   // checked first, then the defaults
export interface Composition { hires: Hire[]; placements: Placement[]; pages: PageExceptions[] }

// ── A place: what placement matches on (core/contracts.js builds one per node)
export interface Place { contract: ContractName; page: PageId | null; within: ContractName[]; kind?: ItemKind; name?: ItemName; param?: ParamMatch; presentation?: PresentationKey; state?: ContentViewState; overlay?: OverlayKind; env?: LayoutEnv }
// ── Look: sizes and visuals at the current env, read through placements (core/compose.js lookAt)
export interface Look {
  size(at: Place, name: string, state?: string): number;       // the hire's own token '<hire>.<name>', else its free component's visual; 0 where nothing is drawn
  visuals(at: Place, state?: string, ctx?: VisualContext): Record<string, unknown> | null;
  hire(at: Place): HireName | null;
}
// Rules: api/composition-rules.js (hires, clauses, children reach slots, tokens, variants, duplicates, shadowing, unfed props, design texts, placements).
