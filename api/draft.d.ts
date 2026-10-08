/**
 * Backdrop Nav — CONTRACT DRAFT (component contracts, from scratch; target 18.0.0, major)
 * Status: draft, agreed direction 2026-10-08 (docs/NOTES.md "Component contracts, from scratch"). Nothing reads this file
 * yet. When the backdrop page is settled it replaces the matching parts of api.d.ts; roles, refs, supplies / emits,
 * roleProps / roleIntent and Role.parts go then.
 * Scope: every drawn part of the app config (pages, layers, peek, navigation, launch, content states, overlays) and the
 * types of the new layers around it. Types this draft does not change come from api.d.ts.
 *
 *   1  Config: what exists, as plain data (no slots, no sides, no look values)
 *   2  Contracts: what each drawn config object offers (config · values · intents · children)
 *   3  Free components: design's building blocks (no API names)
 *   4  Composition: hired components, clauses, placements (app/composition.json)
 */
import type {
  ComponentId, PageId, DeckId, LayerId, ParamName, Title, Params, PropValue, Condition, EnvEquals, Actions, DraftBind, Source,
  SourceRef, FieldPolicy, BackPolicy, SheetPolicy, DeckPolicy, LayerPolicy, LinkTarget, HistoryMode, HistoryByLayout, CoversNav,
  DrawerWideForm, SideMode, SheetForm, Intent, Scoped, FrontPosition, ToggleExpandedIntent, ScrollIntent, RetryIntent,
  SetParamsIntent, OpenIntent, OpenLayerIntent, CloseLayerIntent, CloseOverlayIntent, SwitchDeckIntent, ReselectDeckIntent, Seek,
  ParamValue, ParamOption, ParamType, ContentView, ContentViewState, ItemData, ItemGroup, GroupKey, StatePath, InteractionView,
  PropType, Visuals, VariantAxis, StatusState, Step, PlaceholderForm, Rect, ItemId, TextId, LocaleConfig, LocaleId, Breakpoints,
  RouteTable, PersistPolicy, Shortcut, Wire, SemVer, SessionPredicate, GateId, SessionState,
} from './api';

// ═════════════════════════════════════════════════════════════
// 1. CONFIG — says what exists. Never which component draws it, where it sits, or how big it is.
// ═════════════════════════════════════════════════════════════
export type ItemName = string;           // names an item within its list; composition may single it out
export type ItemKind = 'button' | 'logo' | 'text' | 'switch' | 'find' | 'detail' | 'seek';

// ── Items: what a header, body or row holds. Which side or row an item sits in is composition's choice.
export interface ButtonItem {
  kind: 'button'; name: ItemName; label: PropValue; action: Actions; when?: Condition;
  checked?: PropValue;                   // a toggle's on / off (shuffle, repeat)
  state?: PropValue;                     // a name for what the button shows now ('pause' | 'playNow', 'repeat' | 'repeatOne'); composition picks tokens by it
}
export interface LogoItem { kind: 'logo'; name: ItemName; label: PropValue }                 // the brand; reacts to the player
export interface TextItem { kind: 'text'; name: ItemName; text: PropValue; when?: Condition }
export interface SwitchItem { kind: 'switch'; name: ItemName; param: ParamName; label: PropValue; when?: Condition }   // steps a choice param to its next option
export interface FindItem { kind: 'find'; name: ItemName; param: ParamName; placeholder: PropValue }   // a local search over the content; open / closed is engine state (FindState)
export interface DetailConfig { title: PropValue; subtitle?: PropValue; image?: PropValue; meta?: PropValue }   // one item shown large: the opened item, the current track, the account
export interface DetailItem { kind: 'detail'; name: ItemName; detail: DetailConfig }
export interface SeekItem { kind: 'seek'; name: ItemName; label: PropValue }                 // the player's position
export type HeaderItem = ButtonItem | LogoItem | TextItem | SwitchItem | FindItem;
export type BodyItem = ButtonItem | TextItem | DetailItem | SeekItem;

// ── Headers: the back layer's, an app-bar page's and the peek's. Their title is the page's title (none on the peek).
export interface HeaderConfig { items: HeaderItem[]; detail?: DetailConfig }

// ── Controls and panel rows
export interface BasicActionConfig { bind: ParamName | DraftBind; placeholder?: PropValue }   // one control for one param
export interface ParamRow { kind: 'param'; label?: PropValue; bind: ParamName; when?: Condition }
export interface SuggestionsRow { kind: 'suggestions'; label: PropValue; source: Source<ItemData[]>; fills: DraftBind }   // picking one sets both params to its title
export type PanelRow = ParamRow | SuggestionsRow;

// ── Content. A shelf is an item holding entries (Browse's "Artists to know"). Data decides which shelves and entries exist;
//   activating a shelf or an entry opens it (ItemData.opens; a shelf opens the template shelfPage).
export interface ShelfData { entries?: ItemData[] }                     // joins api.d.ts ItemData: the engine reads id, opens, entries
export type PresentationKey = string;
export interface ContentParam { name: string; value: PropValue }
export interface GroupConfig { by: StatePath; key: GroupKey; when?: Condition; index?: boolean }   // index: a fast-scroll index over the keys
export interface PresentationConfig { key: PresentationKey; groups?: GroupConfig[]; itemAction?: Actions }   // itemAction: what activating an item that does not open does (a track plays) · the layout: composition
export interface ContentConfig {
  dataSource: SourceRef;
  params?: ContentParam[];               // extra dataSource params ({ name: 'id', value: { bind: '$opener.id' } })
  view?: ParamName;                      // the param that picks the presentation
  presentations: PresentationConfig[];
}

// ── Find (local search): the engine owns whether it is open, on the page part that scrolls (front layer, app-bar page).
//   open = (content scrolled and not closed) or opened or its text is not empty
export interface FindState { opened: boolean; closed: boolean }          // opened: the find button was pressed · closed: ✕ was pressed
export interface FindPolicy { opened: FieldPolicy<boolean>; closed: FieldPolicy<boolean> }   // mirrors FindState (e.g. both reset on scrollTop)
export interface OpenFindIntent { type: 'openFind' }                     // opened = true, closed = false
export interface CloseFindIntent { type: 'closeFind' }                   // the find text = '', opened = false, closed = true
export type DraftIntent = Intent | OpenFindIntent | CloseFindIntent;
export type IntentType = DraftIntent['type'];
export type ParamPolicies = Record<ParamName, FieldPolicy<ParamValue>>; // OPEN: still a Record (as in api.d.ts)

// ── Backdrop page. The back layer has named regions with fixed meanings (replaces regions + layouts + heights):
//   header, actions and basicAction show concealed and expanded; panel shows only expanded.
export interface BackLayerConfig {
  header: HeaderConfig;
  actions?: ButtonItem[];
  basicAction?: BasicActionConfig;
  panel?: PanelRow[];
  toggleOnTap?: boolean;                 // default true
  hideHeaderOnScroll?: boolean;          // was BarRegion.hideOnScroll: scrolling down hides the header region (BackState.headerHidden)
}
export interface FrontHeaderConfig { title: PropValue; items: HeaderItem[] }   // the disclosure is built in: every front header has one
export interface FrontLayerConfig { header: FrontHeaderConfig; collapse: 'partial' | 'full'; content: ContentConfig }
export interface FrontState { scroll: Scoped<number>; find?: FindState }    // replaces api.d.ts FrontState (scroll unchanged)
export interface FrontPolicy { scroll: FieldPolicy<number>; find?: FindPolicy }   // find: required when the front header holds a find item
export interface BackdropPagePolicy { params: ParamPolicies; back: BackPolicy; front: FrontPolicy }
export interface BackdropPageConfig {
  id: PageId;
  kind: 'backdrop';
  title: Title;
  params: Params;
  back: BackLayerConfig;
  front: FrontLayerConfig;
  policy: BackdropPagePolicy;            // engine only: no contract reads it
}

// ── App-bar page: a header over content or a body, with an optional inner sheet (Now playing: Up next / Lyrics / Related)
export interface PageSheetConfig { control?: BasicActionConfig; content: ContentConfig }   // control: the tabs in its header
export interface AppBarPagePolicy { params?: ParamPolicies; scroll: FieldPolicy<number>; sheet?: SheetPolicy; find?: FindPolicy }
export interface AppBarPageState { config: AppBarPageConfig; opener?: ItemData; params: Record<ParamName, Scoped<ParamValue>>; scroll: Scoped<number>; sheet?: { expanded: boolean }; find?: FindState }   // OPEN: replaces api.d.ts AppBarPageState (+ find); inline types to name
export interface AppBarPageConfig {
  id: PageId;
  kind: 'appBar';
  title: Title;
  header: HeaderConfig;
  params?: Params;
  content?: ContentConfig;               // scrolling content — or a fixed body; exactly one
  body?: BodyItem[];
  sheet?: PageSheetConfig;               // requires policy.sheet
  policy: AppBarPagePolicy;
}
export type PageConfig = BackdropPageConfig | AppBarPageConfig;

// ── Decks and layers (unchanged but for the drawing values that moved to design: peek heights, widths, max widths)
export interface DeckConfig { id: DeckId; name: string; page: BackdropPageConfig; linkTarget?: LinkTarget; policy: DeckPolicy }   // icon: composition (a token per deck)
export interface PeekConfig { header: HeaderConfig }
export interface BottomSheetForm { form: 'bottomSheet'; peek: PeekConfig; hidesNavWhenOpen: boolean }
export interface FloatingCardPeek extends PeekConfig { form: 'floatingCard'; persistsWhenOpen: boolean }
export interface SideSheetForm { form: 'sideSheet'; peek: FloatingCardPeek }
export interface SheetPresentation { kind: 'sheet'; compact: BottomSheetForm; wide: SideSheetForm }
export interface FullscreenPresentation { kind: 'fullscreen'; coversNav: CoversNav }
export interface DrawerPresentation { kind: 'drawer'; side: 'start'; scrim: boolean; wide?: DrawerWideForm }
export type LayerPresentation = SheetPresentation | FullscreenPresentation | DrawerPresentation;
export interface LayerPages { base: PageId; set: Record<PageId, PageConfig> }   // OPEN: still a Record (as in api.d.ts)
export interface LayerConfig { id: LayerId; name: string; pages: LayerPages; linkTarget?: LinkTarget; presentation: LayerPresentation; history: HistoryMode | HistoryByLayout; policy: LayerPolicy }

// ── App: navigation lists extra buttons beside the decks (the rail's menu toggle, Settings, Account); launch, overlays
export interface NavigationConfig { items: ButtonItem[] }
export interface LaunchConfig { minMs?: number }                        // the splash: composition
export interface OverlayText { name: string; value: PropValue }         // 'title', 'body', 'confirm', 'cancel', 'text', 'action'
export interface OverlaySpec { id: string; kind: 'dialog' | 'menu' | 'actionSheet' | 'snackbar'; texts: OverlayText[]; items?: ButtonItem[]; blocking: boolean; timeoutMs?: number; history?: 'transient' | 'ignore' }   // the component: composition, by kind
export interface Gate { id: GateId; when: SessionPredicate; page: PageConfig }
export interface SessionConfig { initial?: Partial<SessionState>; gates: Gate[] }
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
  texts: Record<LocaleId, Record<TextId, string>>;   // OPEN: still Records (as in api.d.ts)
  wire?: Wire;
  navigation: NavigationConfig;
  pages?: Record<string, PageConfig>;   // OPEN: still a Record (as in api.d.ts)
}
// Removed from config: contentStates (composition), NavigationConfig refs, LaunchConfig.splash, OverlaySpec.component / props,
// DeckConfig.icon, every height / width / maxWidth, slots and sides.

// ═════════════════════════════════════════════════════════════
// 2. CONTRACTS — what a drawn config object offers whatever draws it.
//   config: the object · values: current, computed by core from State, queries and Layout (never stored) ·
//   intents: what it may send · children: config fields holding other drawn objects (each drawn by its own hire).
//   Engine-only config (policy, collapse, routes …) is never offered as a value. Lists of children hold only the members
//   whose `when` holds.
// ═════════════════════════════════════════════════════════════
export interface Contract<C, V, I> { config: C; values: V; intents: I }
export interface NoValues {}
export type NoIntents = never;

export type BackRegionName = 'header' | 'actions' | 'basicAction' | 'panel';
export interface BackRegionView { region: BackRegionName; top: number; height: number; opacity: number; interactive: boolean }   // Layout
export interface OverlayValueText { name: string; text: string }
// <contracts:generated> — from api/contracts.js by api/gen-contracts.js; do not edit
// button
export interface ButtonValues { label: string; checked: boolean | null; state: string | null; interaction: InteractionView }
export interface ButtonContract extends Contract<ButtonItem, ButtonValues, Actions> {}
// logo
export interface LogoValues { label: string; playing: boolean }
export interface LogoContract extends Contract<LogoItem, LogoValues, NoIntents> {}
// text
export interface TextValues { text: string }
export interface TextContract extends Contract<TextItem, TextValues, NoIntents> {}
// switch: steps its param to the next option
export interface SwitchValues { label: string; value: ParamValue | null; next: ParamValue | null }
export interface SwitchContract extends Contract<SwitchItem, SwitchValues, SetParamsIntent> {}
// find: closeLabel: text find.close
export interface FindValues { open: boolean; value: string; placeholder: string; closeLabel: string }
export interface FindContract extends Contract<FindItem, FindValues, OpenFindIntent | CloseFindIntent | SetParamsIntent> {}
// detail
export interface DetailValues { title: string; subtitle: string | null; image: string | null; meta: string | null }
export interface DetailContract extends Contract<DetailConfig, DetailValues, NoIntents> {}
// seek
export interface SeekValues { label: string; positionMs: number; durationMs: number | null }
export interface SeekContract extends Contract<SeekItem, SeekValues, Seek> {}
export type HeaderItemContract = ButtonContract | LogoContract | TextContract | SwitchContract | FindContract;
// header: progress: collapse 0 … 1 (Layout.barView)
export interface HeaderValues { title: string | null; progress: number }
export interface HeaderChildren { items: HeaderItemContract[]; detail?: DetailContract }
export interface HeaderContract extends Contract<HeaderConfig, HeaderValues, NoIntents> { children: HeaderChildren }
// input: one control for one param
export interface InputValues { value: ParamValue | null; options: ParamOption[]; placeholder: string | null }
export interface InputContract extends Contract<BasicActionConfig | ParamRow, InputValues, SetParamsIntent> {}
// paramRow
export interface ParamRowValues { label: string | null }
export interface ParamRowChildren { control: InputContract }
export interface ParamRowContract extends Contract<ParamRow, ParamRowValues, NoIntents> { children: ParamRowChildren }
// suggestion: picking it fills the draft (SuggestionsRow.fills)
export interface SuggestionValues { text: string }
export interface SuggestionContract extends Contract<ItemData, SuggestionValues, SetParamsIntent> {}
// suggestions
export interface SuggestionsValues { label: string }
export interface SuggestionsChildren { items: SuggestionContract[] }
export interface SuggestionsContract extends Contract<SuggestionsRow, SuggestionsValues, NoIntents> { children: SuggestionsChildren }
// item: action: open it (ItemData.opens), else the presentation's itemAction · entries: a shelf's (absent on other items) (recursive: refers to itself)
export interface ItemValues { item: ItemData; navigable: boolean }
export interface ItemChildren { entries?: ItemContract[] }
export interface ItemContract extends Contract<PresentationConfig, ItemValues, Actions> { children: ItemChildren }
// contentState: empty · error · offlineStale (the banner)
export interface ContentStateValues { state: ContentViewState; text: string; retry: boolean }
export interface ContentStateContract extends Contract<ContentConfig, ContentStateValues, RetryIntent> {}
// content
export interface ContentValues { view: ContentView; presentation: PresentationKey; groups: ItemGroup[]; placeholders: number }
export interface ContentChildren { items: ItemContract[]; state?: ContentStateContract; banner?: ContentStateContract }
export interface ContentContract extends Contract<ContentConfig, ContentValues, NoIntents> { children: ContentChildren }
export type PanelRowContract = ParamRowContract | SuggestionsContract;
// backLayer: toggle only while toggleOnTap
export interface BackLayerValues { expanded: boolean; headerHidden: boolean; regions: BackRegionView[] }
export interface BackLayerChildren { header: HeaderContract; actions: ButtonContract[]; basicAction?: InputContract; panel: PanelRowContract[] }
export interface BackLayerContract extends Contract<BackLayerConfig, BackLayerValues, ToggleExpandedIntent> { children: BackLayerChildren }
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
export interface PageSheetChildren { control?: InputContract; content: ContentContract }
export interface PageSheetContract extends Contract<PageSheetConfig, PageSheetValues, ToggleExpandedIntent> { children: PageSheetChildren }
export type BodyItemContract = ButtonContract | TextContract | DetailContract | SeekContract;
// appBarPage
export interface AppBarPageValues { contentOffset: number }
export interface AppBarPageChildren { header: HeaderContract; content?: ContentContract; body: BodyItemContract[]; sheet?: PageSheetContract }
export interface AppBarPageContract extends Contract<AppBarPageConfig, AppBarPageValues, ScrollIntent> { children: AppBarPageChildren }
export type PageContract = BackdropPageContract | AppBarPageContract;
// sheetLayer: open: the peek was tapped · peek: Layout.peekPlacement
export interface SheetLayerValues { open: boolean; form: SheetForm; side: SideMode | null; peek: Rect | null }
export interface SheetLayerChildren { peek: HeaderContract; page: PageContract }
export interface SheetLayerContract extends Contract<LayerConfig, SheetLayerValues, OpenLayerIntent | CloseLayerIntent> { children: SheetLayerChildren }
// drawerLayer: close: the scrim was tapped
export interface DrawerLayerValues { open: boolean; form: DrawerWideForm | 'modal' }
export interface DrawerLayerChildren { page: PageContract }
export interface DrawerLayerContract extends Contract<LayerConfig, DrawerLayerValues, CloseLayerIntent> { children: DrawerLayerChildren }
// fullscreenLayer
export interface FullscreenLayerValues { open: boolean }
export interface FullscreenLayerChildren { page: PageContract }
export interface FullscreenLayerContract extends Contract<LayerConfig, FullscreenLayerValues, NoIntents> { children: FullscreenLayerChildren }
// destination
export interface DestinationValues { deck: DeckId; label: string; selected: boolean }
export interface DestinationContract extends Contract<DeckConfig, DestinationValues, SwitchDeckIntent | ReselectDeckIntent> {}
// navigation: expanded: a rail-form drawer is open · items: drawn where a form has room (the rail)
export interface NavigationValues { expanded: boolean }
export interface NavigationChildren { destinations: DestinationContract[]; items?: ButtonContract[] }
export interface NavigationContract extends Contract<NavigationConfig, NavigationValues, NoIntents> { children: NavigationChildren }
// splash
export interface SplashValues { label: string }
export interface SplashContract extends Contract<LaunchConfig, SplashValues, NoIntents> {}
// overlay: items: a menu's
export interface OverlayValues { texts: OverlayValueText[] }
export interface OverlayChildren { items?: ButtonContract[] }
export interface OverlayContract extends Contract<OverlaySpec, OverlayValues, CloseOverlayIntent> { children: OverlayChildren }
export type ContractName = 'button' | 'logo' | 'text' | 'switch' | 'find' | 'detail' | 'seek' | 'header' | 'input' | 'paramRow' | 'suggestion' | 'suggestions' | 'item' | 'contentState' | 'content' | 'backLayer' | 'frontHeader' | 'frontLayer' | 'backdropPage' | 'pageSheet' | 'appBarPage' | 'sheetLayer' | 'drawerLayer' | 'fullscreenLayer' | 'destination' | 'navigation' | 'splash' | 'overlay';
// </contracts:generated>
export type ChildName = string;          // a field of a contract's children: 'header', 'items', 'panel' …
export type ValueName = string;          // a field of a contract's values: 'expanded', 'top' …

// ═════════════════════════════════════════════════════════════
// 3. FREE COMPONENTS (design) — building blocks. They know nothing of the API: no contract, intent or config names.
// ═════════════════════════════════════════════════════════════
export type PropName = string;
export type EventName = string;
export type SlotName = string;
export type PartName = string;           // a piece the component draws itself, named so motion can address it (cf. ::part)
export interface PropSpec { name: PropName; type: PropType }
export interface EventSpec { name: EventName; payload: PropType | null }   // null: no payload
export interface SlotSpec { name: SlotName; min?: number; max?: number }   // a hole filled from outside
export interface VariantSpec { axis: string; values: VariantAxis }
export interface FreeComponentDef {
  props: PropSpec[];
  events: EventSpec[];
  slots: SlotSpec[];
  parts: PartName[];
  uses?: ComponentId[];                  // free components it is built from, inside design (iconButton uses symbol)
  states?: string[];
  variants?: VariantSpec[];
  statuses?: StatusState[];
  visuals?: Visuals;                     // OPEN: still a Record (api.d.ts); name it when design's types are redone
  motion?: Step[];                       // OPEN: today keyed by trigger / visual
  placeholder?: PlaceholderForm;
}

// ═════════════════════════════════════════════════════════════
// 4. COMPOSITION (app/composition.json) — hires free components for contracts and places them by config kind.
//   Holds no look values: a fixed value is one of the hire's own tokens, which aliases a design token.
// ═════════════════════════════════════════════════════════════
export type HireName = string;
export type TokenName = string;          // a design token: 'size.iconButton.md', 'icon.menu'
export interface HireToken { name: TokenName; alias: TokenName }   // minted for this hire ('<hire>.<name>'); must alias a design token
export interface VariantPick { axis: string; option: string }

// ── Clauses: one component name ↔ one contract name. Implied where the names match; written only where they differ.
export interface PropFrom { prop: PropName; value: ValueName }      // prop ← a contract value
export interface PropFixed { prop: PropName; token: TokenName }     // prop ← one of the hire's tokens
export interface TokenCase { equals: string; token: TokenName }
export interface PropByValue { prop: PropName; value: ValueName; cases: TokenCase[] }   // prop ← a hire token picked by a value (view switch icon)
export interface EventTo { event: EventName; send: IntentType | 'action' }   // an intent the contract accepts · action: the item's config action
export interface ItemSelector { kind?: ItemKind; name?: ItemName; rest?: true }   // rest: every item not picked by another slot
export interface FromChild { child: ChildName; pick?: ItemSelector[] }   // a child, or the picked items of a list child, in order
export interface FromHire { hire: HireName }                             // a hire on this same contract (a header's title, the built-in disclosure)
export type SlotSource = FromChild | FromHire;
export interface SlotFrom { slot: SlotName; fill: SlotSource[] }
export type Clause = PropFrom | PropFixed | PropByValue | EventTo | SlotFrom;

export interface Hire {
  name: HireName;
  hires: ComponentId;                    // exactly one free component
  contract: ContractName;                // exactly one contract
  clauses: Clause[];
  variants?: VariantPick[];
  tokens?: HireToken[];
}

// ── Placements: which hire draws each config object, by contract (and, for items, kind / name / presentation)
export interface ParamMatch { name?: ParamName; type?: ParamType; axis?: boolean; draft?: boolean }   // controls: picked by the bound param (its name, or its spec)
export interface Placement {
  contract: ContractName;
  within?: ContractName | ContractName[];   // the nearest ancestor contract, or the nearest few in order (['appBarPage', 'sheetLayer']: a layer page's header)
  overlay?: OverlaySpec['kind'];         // overlays: by kind
  match?: ItemSelector;                  // items: a kind or a name (destinations: the deck id; overlays: the kind)
  param?: ParamMatch;                    // basic actions and panel rows
  presentation?: PresentationKey;        // content items
  entry?: boolean;                       // content items: an entry on a shelf (true) or a top-level item
  state?: ContentViewState;              // content states: empty · error · offlineStale
  env?: EnvEquals;                       // e.g. layout compact only
  hire: HireName | null;                 // null: not drawn here (e.g. the menu button on wide, where the rail has it)
}
export interface PageExceptions { page: PageId; placements: Placement[] }   // checked first, then the defaults
export interface Composition { hires: Hire[]; placements: Placement[]; pages: PageExceptions[] }

// Rules (to write in invariants.js): every placement names a hire whose contract matches; every clause names a prop /
// event / slot the free component declares and a value / child the contract offers; a hire meets every value its free
// component's required props need; every hire token aliases an existing design token; composition holds no literals;
// two hires never wrap the same free component for the same contract with identical clauses (duplicate).
