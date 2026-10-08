/**
 * Backdrop Nav — CONTRACT
 * Abstract API layer: shapes, intents, queries, events, invariants. No logic.
 * Every implementation (web core, native, …) must satisfy this. Invariants live in ./invariants.js and run against any Model.
 *
 * VERSION: contract 17.0.0 (semver — see docs/CHANGELOG.md for the compatibility policy)
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
 *   F  Components: roles, refs,      N  Specs (§15) + platform manifests
 *      bars, regions, content        O  Interaction (§20)
 *                                    P  Model
 * Domains map 1:1 to Rust modules (docs/RUST.md): nav · overlay · session · route · persist · player (optional) · layout ·
 * specs · wire · interaction.
 */

// ═════════════════════════════════════════════════════════════
// A. VERSION & PRIMITIVES
// ═════════════════════════════════════════════════════════════
export declare const CONTRACT_VERSION: '17.0.0';
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
export interface Breakpoints { compactMax: number; minContent: number; railWidth: number }
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
export interface PathEquals { path: StatePath; equals: unknown }     // deep equality; page paths must lie in a policy-declared field
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
// The engine knows only their type: state, URL codec, history, reset policy and data params.
// ═════════════════════════════════════════════════════════════
export type ParamName = string;
export type ParamType = 'choice' | 'choices' | 'text' | 'flag' | 'number' | 'date';
export type ParamMotion = string;        // names a paramChanged choreography rule: 'slide', 'swap', 'default'
export type NumberRange = [number, number];
export type DateRange = [string, string];
export type ParamValue = string | string[] | boolean | number | NumberRange | DateRange | null;
export interface ParamOption { value: string; label: TextRef | string }
export interface ParamSpec {
  type: ParamType;
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
export interface DraftBind { change: ParamName; submit: ParamName }   // typing updates change (a draft), submitting sets both
export interface PlayerBind { player: 'positionMs' }                 // a control for player state: change → seek
export interface OptionsOf { options: ParamName }

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
export interface OverlaySpec {
  id: string;
  kind: 'dialog' | 'menu' | 'actionSheet' | 'snackbar';
  component: ComponentId;                // implements role 'overlay'
  props?: Record<string, unknown>;
  blocking: boolean;
  timeoutMs?: number;
  history?: 'transient' | 'ignore';
}
// ── D6. Items — content. The engine reads only id and opens; other fields are for components ('$item.<field>').
// What an item opens: a page template (AppConfig.pages) or a page of a layer's fixed set. Where: decided by origin, never by item type.
export interface PageLink { template: PageTemplateId }
export interface LayerPageSpec { kind: 'layerPage'; page: PageId }
export type ItemLink = PageLink | LayerPageSpec;
export interface ItemData { id: ItemId; opens: ItemLink | null; [field: string]: unknown }   // opens null = not navigable
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
export interface SetParamsIntent { type: 'setParams'; values: Record<ParamName, ParamValue>; page?: PageId }
export interface ToggleParamIntent { type: 'toggleParam'; name: ParamName; option: string; page?: PageId }
export interface ResetParamsIntent { type: 'resetParams'; names?: ParamName[]; page?: PageId }
export interface SetExpandedIntent { type: 'setExpanded'; expanded: boolean }   // the focused app-bar page's sheet if it has one, else the back layer under the focus
export interface ToggleExpandedIntent { type: 'toggleExpanded' }
export interface ScrollIntent { type: 'scroll'; top: number }
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
export type Intent =
  | OpenIntent | OpenLayerPageIntent | BackIntent | UpIntent | SwitchDeckIntent | ReselectDeckIntent
  | SetParamsIntent | ToggleParamIntent | ResetParamsIntent | SetExpandedIntent | ToggleExpandedIntent | ScrollIntent
  | OpenLayerIntent | CloseLayerIntent | FocusIntent | SetDeviceIntent | SetPrefsIntent
  | OpenOverlayIntent | RetryIntent | CloseOverlayIntent | SessionIntent | NavigateUrlIntent | RestoreIntent | LaunchedIntent;
export declare const INTENT_TYPES: readonly Intent['type'][];

export interface NavAction { nav: Intent }
export interface PlayerAction { player: PlayerIntent }
export interface ShellAction { shell: ShellActionId }
export type Action = NavAction | PlayerAction | ShellAction | null;   // null = not implemented
export type Actions = Action | Action[];  // a list runs in order (e.g. play, then open Now playing); available iff every member is

// ═════════════════════════════════════════════════════════════
// F. COMPONENTS — roles, references, bars, regions, content
// A place in the UI names a registered component, its props, its action and when it shows.
// A role is a component interface: what the engine supplies, what the component emits, and which slots it has.
// Everything component-like in the config is a ref whose component implements a role (typed refs: BarRef, FrontHeaderRef, …).
// ═════════════════════════════════════════════════════════════
export type RoleId =
  | 'interactive' | 'input' | 'item' | 'navigation' | 'disclosure'
  | 'bar' | 'frontHeader' | 'appBar' | 'peek' | 'fab' | 'layout'
  | 'emptyState' | 'errorState' | 'staleBanner' | 'splash' | 'overlay'
  | 'backdropPage' | 'backLayer' | 'frontLayer' | 'appBarPage' | 'pageSheet'          // 16.0: pages and surfaces
  | 'sheetLayer' | 'drawerLayer' | 'fullscreenLayer';
export type PropType = 'string' | 'number' | 'boolean' | 'token' | 'slot' | 'string[]' | 'value' | 'options' | 'list';
// Contracts (16.0) are minimums: what config and the engine rely on. A component may declare more (extra slots); config may
// use those only on that component (rule). Motion is not part of a contract: parts that motions name are design.
export interface SlotContract {
  roles?: RoleId[];                      // every ref in the slot implements one of these
  min?: number;
  max?: number;
  first?: RoleId;                        // the first ref implements this role (a front header starts with the disclosure)
  last?: RoleId;                         // the last ref implements this role
}
export type ConfigPath = string;         // a dotted path into the config object a role draws: 'header', 'compact.peek.header'
export interface PartContract {
  field: ConfigPath;                     // where config holds the part
  role?: RoleId;                         // the part is a ref implementing this role
  optional?: boolean;
}
export interface RoleTypes { supplies?: Record<string, string>; emits?: Record<string, string> }   // prop / event → a type name in this file
export interface Role {
  supplies: Record<string, PropType>;    // props the engine fills in from state; the config may not set them
  emits: Record<string, PropType | null>; // events → intents (Queries.roleIntent; types in §M2); 'activate' runs the ref's action (§O)
  slots?: Record<string, SlotContract>;  // ref roles: the minimum slots the component must declare (props of type 'slot')
  parts?: Record<string, PartContract>;  // page / surface roles: parts held by the config object's own fields
  ts?: RoleTypes;                        // TypeScript type names for §M2 (generation only)
  note?: string;
}
export declare const ROLES: Record<RoleId, Role>;   // data: api/roles.js (single source); the TS contracts in §M2 are generated from it
export type RefScope = Record<string, unknown>;

// recursive: refers to Slot (defined below)
export interface ComponentRef {
  component: ComponentId;                // registered (§N)
  props?: Record<string, PropValue>;
  action?: Actions;                      // required key for interactive components (null = not built), unless bound
  when?: Condition;
  slots?: Record<string, Slot[]>;        // children, for props the component declares as 'slot' (repeats allowed)
  variant?: Record<string, string>;
  checked?: PropValue;
  bind?: ParamName | DraftBind | PlayerBind;
}
export interface Repeat {
  repeat: Source<unknown[]> | OptionsOf | Bind;   // Bind: a list in state ('$player.queue', '$opener.entries')
  as: string;
  ref: ComponentRef;
}
export type Slot = ComponentRef | Repeat;
// 16.0 typed refs: a ref whose component implements the role; its slots are the role's minimum plus what the component declares
export type ExtraSlots = Record<string, Slot[] | undefined>;
export interface BarSlots extends ExtraSlots { start?: Slot[]; title?: Slot[]; end?: Slot[]; expanded?: Slot[] }
export interface FrontHeaderSlots extends ExtraSlots { start: Slot[]; title?: Slot[]; end?: Slot[]; fab?: Slot[] }
export interface AppBarSlots extends ExtraSlots { start?: Slot[]; title?: Slot[]; end?: Slot[]; expanded?: Slot[]; fab?: Slot[]; bottom?: Slot[] }
export interface PeekSlots extends ExtraSlots { start?: Slot[]; title?: Slot[]; end?: Slot[] }
export interface BarRef extends ComponentRef { slots?: BarSlots }
export interface FrontHeaderRef extends ComponentRef { slots: FrontHeaderSlots }
export interface AppBarRef extends ComponentRef { slots?: AppBarSlots }
export interface PeekRef extends ComponentRef { slots?: PeekSlots }
export interface NavigationRef extends ComponentRef {}
export interface LayoutRef extends ComponentRef {}
export interface ItemRef extends ComponentRef {}

// ── Placement identity: where a component sits IS its identity
export type SlotPath = string;
//   '<surface>/<page id>/<slot>' + '[i]' per list position + '#<item id>' per data item
//   surface: 'deck:<id>' | 'layer:<id>' | 'peek:<layer>' | 'nav' | 'overlay:<id>' | 'gate:<id>'

// ── Regions: a surface made of named regions, drawn in one of several layouts
export interface BarRegion {
  kind: 'bar';
  height: number;
  bar: BarRef;
  expandedHeight?: number;               // with a bar 'expanded' slot: height at scroll 0, shrinking to height over the first (expandedHeight − height) of scroll
  hideOnScroll?: boolean;
}
export interface SlotsRegion { kind: 'slots'; height: number | 'content'; content: Slot[] }
export type Region = BarRegion | SlotsRegion;
export interface RegionSet<L extends string = string> { regions: Record<string, Region>; layouts: Record<L, string[]> }
export interface BackLayerConfig extends RegionSet<'concealed' | 'expanded'> {
  toggleOnTap?: boolean;                 // default true
}
// Rules: layouts.concealed starts with 'header' (a bar); 'basicAction' holds slots with exactly one bound control.

// ── Content: how items are drawn is presentation — a layout arranges them, an item component draws each
export type GroupKey = 'initial' | 'value' | 'decade';
export interface GroupSpec {
  by: StatePath;                         // '$item.<field>'
  key: GroupKey;                         // initial: first letter (A–Z, '#' otherwise) · value: the field · decade: 1990s…
  when?: Condition;                      // first matching group spec wins (e.g. follow the sort param)
  header?: ComponentRef;                 // drawn per group, '$group' in scope ({ key, count })
  index?: ComponentRef;                  // a fast-scroll index over the group keys
}
export interface Presentation {
  layout: LayoutRef;
  item: ItemRef;
  groups?: GroupSpec[];
}
export interface ContentStateComponents { empty: ComponentId; error: ComponentId; staleBanner: ComponentId }   // implement emptyState / errorState / staleBanner
export interface ContentConfig {
  dataSource: SourceRef;
  params?: Record<string, PropValue>;    // extra dataSource params ({ id: { bind: '$opener.id' } }, { queue: { bind: '$player.queue' } })
  states?: Partial<ContentStateComponents>;
  view?: ParamName;
  presentations: Record<string, Presentation>;
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
export interface FieldPolicy<T> {
  default: T;
  resetOn: LifecycleEvent[];
  scope?: StatePath | null;
  on?: PolicyReaction<T>[];
}
export interface BackPolicy { expanded: FieldPolicy<boolean>; headerHidden?: FieldPolicy<boolean> }
export interface FrontPolicy { scroll: FieldPolicy<number> }
export interface BackdropPagePolicy { params: Record<ParamName, FieldPolicy<ParamValue>>; back: BackPolicy; front: FrontPolicy }
export interface SheetPolicy { expanded: FieldPolicy<boolean> }
export interface AppBarPagePolicy { params?: Record<ParamName, FieldPolicy<ParamValue>>; scroll: FieldPolicy<number>; sheet?: SheetPolicy }   // sheet mirrors SheetState

export interface FrontLayerConfig {
  header: FrontHeaderRef;                // always shown; starts with the disclosure
  collapse: 'partial' | 'full';
  content: ContentConfig;
}
export interface BackdropPageConfig {
  id: PageId;
  kind: 'backdrop';
  title: Title;
  params: Params;
  back: BackLayerConfig;
  front: FrontLayerConfig;
  policy: BackdropPagePolicy;
}
// An app-bar page's inner sheet: a peeking sheet over the body (Now playing: Up next / Lyrics / Related)
export interface PageSheetConfig { peekHeight: number; header: BarRef; content: ContentConfig }
export interface AppBarPageConfig {
  id: PageId;
  kind: 'appBar';
  title: Title;
  header: AppBarRef;
  params?: Params;
  content?: ContentConfig;               // scrolling content — or a fixed body; exactly one
  body?: Slot[];
  sheet?: PageSheetConfig;               // requires policy.sheet
  policy: AppBarPagePolicy;
}
export type PageConfig = BackdropPageConfig | AppBarPageConfig;

export interface DeckPolicy { stack: FieldPolicy<StackEntry[]> }   // StackEntry: §I (type-only reference)
export interface DeckConfig {
  id: DeckId;
  name: string;
  icon: string;
  page: BackdropPageConfig;
  linkTarget?: LinkTarget;
  policy: DeckPolicy;
}

export type HistoryMode = 'record' | 'ignore';
export interface HistoryByLayout { compact: HistoryMode; wide: HistoryMode }
export interface Peek { height: number; header: PeekRef }
export interface BottomSheetForm { form: 'bottomSheet'; peek: Peek; hidesNavWhenOpen: boolean }
export interface FloatingCardPeek extends Peek { form: 'floatingCard'; maxWidth: number; persistsWhenOpen: boolean }
export interface SideSheetForm { form: 'sideSheet'; width: number; peek: FloatingCardPeek }
export interface SheetPresentation { kind: 'sheet'; compact: BottomSheetForm; wide: SideSheetForm }
export interface CoversNav { compact: boolean; wide: boolean }
export interface FullscreenPresentation { kind: 'fullscreen'; coversNav: CoversNav }
export type DrawerWideForm = 'modal' | 'rail';
export interface DrawerPresentation { kind: 'drawer'; side: 'start'; width: number; scrim: boolean; wide?: DrawerWideForm }
//   compact (and wide 'modal', the default): modal, covers nav, traps focus; back closes it.
//   wide 'rail': the navigation rail expands to `width` in place (its slots show labels); joins the focus order (no trap); back closes it.
export type LayerPresentation = SheetPresentation | FullscreenPresentation | DrawerPresentation;
export interface LayerPages { base: PageId; set: Record<PageId, PageConfig> }
export interface LayerPolicy { stack: FieldPolicy<StackEntry[]>; open: FieldPolicy<boolean> }
export interface LayerConfig {
  id: LayerId;
  name: string;
  pages: LayerPages;
  linkTarget?: LinkTarget;
  presentation: LayerPresentation;
  history: HistoryMode | HistoryByLayout;
  policy: LayerPolicy;
}

// ═════════════════════════════════════════════════════════════
// H. APP CONFIG (fixed per app version; plain JSON, no functions)
// ═════════════════════════════════════════════════════════════
export interface NavigationConfig { compact: NavigationRef; wide: NavigationRef }
export interface Shortcut { keys: string; intent: Intent; when?: 'pointer' | 'always' }
export interface LaunchConfig { splash: ComponentId; minMs?: number }   // implements 'splash'
export interface Gate { id: GateId; when: SessionPredicate; page: PageConfig }
export interface SessionConfig { initial?: Partial<SessionState>; gates: Gate[] }
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
//   range 'from..to'. Only values off the policy default. Invariant: navigateUrl(url(state)) reproduces the destination.
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
  texts: Record<LocaleId, Record<TextId, string>>;
  contentStates?: ContentStateComponents;
  wire?: Wire;
  navigation: NavigationConfig;
  pages?: Record<PageTemplateId, PageConfig>;   // the opened page's id = parent id + '/' + item id
}

// ═════════════════════════════════════════════════════════════
// I. STATE (runtime, user-driven)
// ═════════════════════════════════════════════════════════════
export type Scoped<T> = T | Record<string, T>;   // a field with a policy scope is stored per scope key
export interface BackState { expanded: boolean; headerHidden?: boolean }
export interface FrontState { scroll: Scoped<number> }   // collapse-first scroll offset (15.0): see PageScroll below
export interface SheetState { expanded: boolean }
export interface BackdropPageState {
  config: BackdropPageConfig;
  opener?: ItemData;
  params: Record<ParamName, Scoped<ParamValue>>;
  back: BackState;
  front: FrontState;
}
export interface AppBarPageState {
  config: AppBarPageConfig;
  opener?: ItemData;
  params: Record<ParamName, Scoped<ParamValue>>;
  scroll: Scoped<number>;                // collapse-first scroll offset (15.0): see PageScroll below
  sheet?: SheetState;
}
export type PageState = BackdropPageState | AppBarPageState;
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
  | PushedEvent | PoppedEvent | DeckSwitchedEvent | ExpandedChangedEvent | HeaderVisibilityChangedEvent | ParamChangedEvent
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
export interface ContentView {
  state: ContentViewState;
  showItems: boolean;
  component: ComponentId | null;
  placeholders: number;
  banner: ComponentId | null;
  retry: boolean;
}
// Rules: loading never shows items; empty never shows placeholders; retryable errors offer retry;
// offline with cached items shows them with a stale banner; offline without items = error.

// ═════════════════════════════════════════════════════════════
// L. QUERIES (derived — never stored)
// ═════════════════════════════════════════════════════════════
export type BackAction = 'closeOverlay' | 'closeDrawer' | 'collapse' | 'collapseSheet' | 'resetParam' | 'pop' | 'popLayer' | 'closeLayer' | 'startDeck' | 'undoRecord' | 'exit';
export type SideMode = 'beside' | 'modal' | 'auto';
export type FrontPosition = 'expanded' | 'partial' | 'full';
export interface CurrentPresentation extends Presentation { key: string }
export interface ItemGroup { key: string; items: ItemData[] }
export interface ResolvedRef {
  component: ComponentId;
  props: Record<string, unknown>;
  action: Actions | undefined;
  visible: boolean;
  slots: Record<string, ResolvedRef[]>;
  key?: SlotPath;
  variant: Record<string, string>;
  checked?: boolean | 'mixed';
  bind?: ComponentRef['bind'];
}
export interface ExpandedSlot { ref: ComponentRef; scope: RefScope | null }
export interface SlotContext { role: RoleId; page: PageState; item?: ItemData; origin?: Origin; bind?: ComponentRef['bind']; layer?: LayerId }   // layer: 16.0, layer roles
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
  presentation(page: PageState): CurrentPresentation;
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
  condition(state: AppState, config: AppConfig, cond: Condition, page: PageState | null, scope?: RefScope): boolean;
  resolveRef(state: AppState, config: AppConfig, ref: ComponentRef, page: PageState | null, path?: SlotPath, scope?: RefScope): ResolvedRef;
  expandSlots(state: AppState, config: AppConfig, slots: Slot[], page: PageState | null, scope?: RefScope): ExpandedSlot[];
  slotPath(surface: string, pageId: PageId | null, slot: string, index?: number, itemId?: ItemId): SlotPath;
  text(state: AppState, config: AppConfig, ref: TextRef | TextId): string;
  dir(state: AppState, config: AppConfig): Direction;
  roleProps(state: AppState, config: AppConfig, slot: SlotContext): Record<string, unknown>;
  roleIntent(state: AppState, config: AppConfig, slot: SlotContext, event: string, payload?: unknown): Intent | PlayerIntent | null;
}

// ═════════════════════════════════════════════════════════════
// M. LAYOUT (§14) — pure "what to draw and how it moves" (no pixels, no timers)
// ═════════════════════════════════════════════════════════════
export interface LayoutEnv { layout: LayoutClass; touch: boolean; sheet: 'none' | 'beside' | 'over'; dir: Direction }
export interface Geometry { width: number; height: number; railWidth: number; navHeight: number; peekHeight: number; contentWidth: number; contentHeight: number }
export interface LayoutGeometry extends Geometry { side: SideMode | null; wide: boolean; navigation: ComponentId }
export interface RegionInstance { region: string; top: number; height: number; opacity: number; interactive: boolean }
export interface FrontLayerView { top: number; state: 'expanded' | 'partlyCollapsed' | 'fullyCollapsed'; visual: Record<string, unknown> }
// PageScroll (15.0): a page's scroll (FrontState.scroll / AppBarPageState.scroll) is collapse-first — 0 … distance
//   (expandedHeight − height) collapses the bar while the content stays put (the page grows); beyond it the content scrolls by
//   (scroll − distance). Scrolling back: the content returns to its top first, then the bar expands. No expanded slot: distance 0.
export interface BarView { height: number; progress: number; distance: number }   // a bar with an expanded slot: current height + collapse progress (0 … 1) + collapse distance
export interface FrontLayerContext { env?: LayoutEnv; measured?: Record<string, number> }
export interface TransitionDescriptor { kind: MotionId | 'instant'; [param: string]: unknown }   // 17.0: a resolved KindStep (temporary, see §N)
export type MotionTrigger = 'change' | 'press' | 'release' | 'loop';
export interface Measurements { itemRect?: Rect; targetRect?: Rect; origin?: Point; shared?: Record<string, Rect> }   // shared: element rects that move between pages (e.g. { image })
// Directions in motion params are logical (+1 = toward the end side). Shells mirror them in RTL.

// ═════════════════════════════════════════════════════════════
// M2. CONTRACTS (16.0) — what each role's component receives from state and what its events become
// Supplies: computed by Queries.roleProps, never stored, never set by config. Events: mapped by Queries.roleIntent.
// ═════════════════════════════════════════════════════════════
export type SheetForm = 'bottomSheet' | 'sideSheet';
// <roles:generated> — from api/roles.js by api/gen-roles.js; do not edit
// interactive: its action(s); state via §O
export interface InteractiveEvents { activate: Actions }
// input: setParams on its bind (PlayerBind: seek)
export interface InputSupplies { value: ParamValue | null; options: ParamOption[] }
export interface InputEvents { change: SetParamsIntent | Seek; submit: SetParamsIntent }
// item: open (inside a repeat: the element is the item)
export interface ItemSupplies { navigable: boolean }
export interface ItemEvents { open: OpenIntent }
// navigation
export interface NavigationSupplies { destinations: DeckId[]; selected: DeckId }
export interface NavigationEvents { select: SwitchDeckIntent | ReselectDeckIntent }
// disclosure
export interface DisclosureSupplies { expanded: boolean }
export interface DisclosureEvents { toggle: ToggleExpandedIntent }
// bar: slots start · title ≤1 · end · expanded ≤1 — back-layer header regions; progress from Layout.barView
export interface BarSupplies { progress: number }
// frontHeader: slots start first disclosure · title ≤1 · end · fab ≤1 fab
// appBar: slots start · title ≤1 · end · expanded ≤1 · fab ≤1 fab · bottom — bottom: a row at the bar's bottom edge, stays when it collapses
export interface AppBarSupplies { progress: number }
// peek: slots start · title ≤1 · end
// fab
export interface FabEvents { activate: Actions }
// layout: arranges content items (list, grid, scroller); groups from Queries.groups
export interface LayoutSupplies { groups: ItemGroup[] }
// emptyState
export interface EmptyStateEvents { retry: RetryIntent }
// errorState
export interface ErrorStateEvents { retry: RetryIntent }
// staleBanner
export interface StaleBannerEvents { retry: RetryIntent }
// splash
// overlay
export interface OverlayEvents { close: CloseOverlayIntent }
// backdropPage: parts back ← back · front ← front (frontLayer)
// backLayer: parts header ← regions.header.bar (bar) — toggle only while BackLayerConfig.toggleOnTap
export interface BackLayerSupplies { expanded: boolean; headerHidden: boolean }
export interface BackLayerEvents { toggle: ToggleExpandedIntent }
// frontLayer: parts header ← header (frontHeader) · content ← content
export interface FrontLayerSupplies { position: FrontPosition }
export interface FrontLayerEvents { scroll: ScrollIntent; retry: RetryIntent }
// appBarPage: parts header ← header (appBar) · content? ← content · body? ← body · sheet? ← sheet (pageSheet)
export interface AppBarPageEvents { scroll: ScrollIntent; retry: RetryIntent }
// pageSheet: parts header ← header (bar) · content ← content
export interface PageSheetSupplies { expanded: boolean }
export interface PageSheetEvents { toggle: ToggleExpandedIntent }
// sheetLayer: parts peekCompact ← presentation.compact.peek.header (peek) · peekWide ← presentation.wide.peek.header (peek) — open: the peek was tapped
export interface SheetLayerSupplies { open: boolean; form: SheetForm; side: SideMode | null }
export interface SheetLayerEvents { open: OpenLayerIntent; close: CloseLayerIntent }
// drawerLayer: close: the scrim was tapped
export interface DrawerLayerSupplies { open: boolean; form: DrawerWideForm }
export interface DrawerLayerEvents { close: CloseLayerIntent }
// fullscreenLayer
export interface FullscreenLayerSupplies { open: boolean }
// </roles:generated>

// ═════════════════════════════════════════════════════════════
// N. SPECS (§15) — design-system data
// ═════════════════════════════════════════════════════════════
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
  implements?: RoleId[];                 // must declare each role's supplied props and slots
  accepts?: ParamType[];
}
export type ComponentRegistry = Record<ComponentId, ComponentDef>;
export interface StackPattern { event: 'pushed' | 'popped'; kind?: PageConfig['kind'] | 'layerPage' }
export interface SurfacePattern { event: 'deckSwitched' | 'expandedChanged' | 'layerOpened' | 'layerClosed' | 'overlayOpened' | 'overlayClosed'; layer?: LayerId }
export interface ParamPattern { event: 'paramChanged'; motion?: ParamMotion }
export interface SessionPattern { event: 'sessionChanged'; signedIn?: boolean }
export interface QueuedPattern { event: 'queued'; position?: QueuePosition }
export interface PlainPattern { event: 'headerVisibilityChanged' | 'launched' | 'urlChanged' | 'retryRequested' | 'focusRestore' | 'exit' }
export type ChoreoPattern = StackPattern | SurfacePattern | ParamPattern | SessionPattern | QueuedPattern | PlainPattern;   // every field given must match the event

// ── 17.0 MOTION AS STEPS: choreography says which piece does what, when. Platforms implement the four blocks (tween, travel, swap,
// reveal) once and play any rule. Measures resolve on the platform, after the commit, at rest. Directions are logical (RTL mirrors).
export type PieceRef = string;
//   '<role>.<slot|part>' (api/roles.js) · '<component>.<part>' (ComponentDef.parts) · '<component>' (its visible instance) ·
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
export interface ScreenSpec { regions?: Record<string, ComponentId>; header?: BarRef }
export interface Specs {
  tokens: TokenSet;
  components: ComponentRegistry;
  choreography: Choreography;
  motions: MotionRegistry;              // TEMPORARY (KindStep)
  screens?: Record<PageId, ScreenSpec>;
}
export interface VisualContext { surface?: ComponentId; variant?: Record<string, string>; env?: LayoutEnv; page?: PageState | null; status?: StatusState[] }
export interface PlatformManifest { platform: string; implements: ComponentId[]; motions?: MotionId[] }   // motions: TEMPORARY (kinds still hand-built)
// Rules: every component the config uses is registered and implemented by every platform (variants count where their parent is);
// every ref in a role-typed place implements that role and meets its slot contracts; surfaces provide the roles placed on them;
// texts exist in every locale and parse; data components declare placeholders; every piece a step names is declared; anchors name steps;
// every ModelEvent type has a choreography rule; every param motion names a paramChanged rule.

export interface Layout {
  env(state: AppState, config: AppConfig, q: Queries): LayoutEnv;
  geometry(state: AppState, config: AppConfig, q: Queries, specs: Specs): LayoutGeometry;
  regions(page: BackdropPageState, measured?: Record<string, number>): RegionInstance[];   // an expandable header region shrinks with barView progress
  barView(page: PageState, specs: Specs): BarView;          // app bar: design visuals height / expandedHeight; back header region: config heights; progress = min(1, scroll / distance)
  contentOffset(page: PageState, specs: Specs): number;     // 15.0: the content's own offset = max(0, scroll − barView.distance)
  resolveVisuals(specs: Specs, component: ComponentId, state: string, ctx?: VisualContext): Record<string, unknown>;
  frontLayer(page: BackdropPageState, g: LayoutGeometry, specs: Specs, ctx?: FrontLayerContext, peek?: number): FrontLayerView;
  stepsFor(event: ModelEvent, specs: Specs, prefs: Prefs): Step[];                         // 17.0: the rule's steps, tokens / ByEvent / sequences resolved
  componentSteps(specs: Specs, component: ComponentId, key: string, prefs: Prefs): Step[];   // 17.0
  transitionFor(event: ModelEvent, specs: Specs, prefs: Prefs, measure?: Measurements): TransitionDescriptor;   // TEMPORARY: the rule's first KindStep
  motionFor(specs: Specs, component: ComponentId, key: string, prefs: Prefs): TransitionDescriptor;            // TEMPORARY
  peekPlacement(state: AppState, config: AppConfig, g: LayoutGeometry, frontTop: number, page?: BackdropPageState): Rect | null;
  componentFor(specs: Specs, role: RoleId): ComponentId | null;   // 16.0: the design component implementing a page / surface role
}

// ═════════════════════════════════════════════════════════════
// O. INTERACTION (§20) — buttons, nav items, list rows, chips…
// The component never decides "enabled": it's derived from its action(s) against the current state.
// ═════════════════════════════════════════════════════════════
export type InteractionState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';
export declare const INTERACTION_STATES: readonly InteractionState[];
export interface InteractionFacts { checked?: boolean | 'mixed' }
export interface InteractionInput { hovered: boolean; pressed: boolean; focused: boolean; focusVisible: boolean; dragging?: boolean }
export interface InteractiveComponent { id: SlotPath; component: ComponentId; action: Actions; label: string }
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
export type CreateModel = (config: AppConfig, device: Device, data: DataSource, player?: PlayerModel) => Model;
export interface InteractionEnv { model: Model; player?: PlayerModel; shellActions?: readonly ShellActionId[] }
export declare function actionAvailable(action: Actions, env: InteractionEnv): boolean;
export declare function resolveInteraction(action: Actions, input: InteractionInput, env: InteractionEnv, facts?: InteractionFacts): InteractionView;
export declare function statusOf(action: Actions, env: InteractionEnv, facts?: InteractionFacts): StatusState[];
// 14.3: run a player action; a playQueue / enqueue that took effect also yields its QueuedEvent (choreography 'queued')
export interface PlayerActionResult { commands: PlayerCommand[]; events: QueuedEvent[] }
export declare function playerAction(player: PlayerModel, intent: PlayerIntent, from?: ItemId | null): PlayerActionResult;
