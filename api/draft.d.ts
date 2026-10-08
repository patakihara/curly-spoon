/**
 * Backdrop Nav — CONTRACT DRAFT (component contracts, from scratch; target 18.0.0, major)
 * Status: draft, agreed direction 2026-10-08 (docs/NOTES.md "Component contracts, from scratch"). Nothing reads this file
 * yet. When the backdrop page is settled it replaces the matching parts of api.d.ts; roles, refs, supplies / emits,
 * roleProps / roleIntent and Role.parts go then.
 * Scope so far: the backdrop page (back layer, front layer, their headers) and the types of the new layers around it.
 * Types this draft does not change come from api.d.ts.
 *
 *   1  Config: the backdrop page, as plain data (no slots, no look values)
 *   2  Contracts: what each drawn config object offers (config · values · intents · children)
 *   3  Free components: design's building blocks (no API names)
 *   4  Composition: hired components, clauses, placements (app/composition.json)
 */
import type {
  ComponentId, PageId, ParamName, Title, Params, PropValue, Condition, EnvEquals, Actions, DraftBind, Source, SourceRef,
  BackdropPagePolicy, FrontPosition, ToggleExpandedIntent, ScrollIntent, RetryIntent, SetParamsIntent, OpenIntent,
  ParamValue, ParamOption, ParamType, ContentView, ItemData, ItemGroup, GroupKey, StatePath, InteractionView, PropType, Visuals,
  VariantAxis, StatusState, Step, PlaceholderForm,
} from './api';

// ═════════════════════════════════════════════════════════════
// 1. CONFIG — the backdrop page. Says what exists; never which component draws it, where it sits, or how big it is.
// ═════════════════════════════════════════════════════════════
export type ItemName = string;           // names an item within its header or region; composition may single it out
export type ItemKind = 'button' | 'logo' | 'text' | 'switch' | 'find';

// ── Header items: what a header holds. Which side an item sits on is composition's choice.
export interface ButtonItem { kind: 'button'; name: ItemName; label: PropValue; action: Actions; when?: Condition }
export interface LogoItem { kind: 'logo'; name: ItemName; label: PropValue }                 // the brand; reacts to the player
export interface TextItem { kind: 'text'; name: ItemName; text: PropValue; when?: Condition }
export interface SwitchItem { kind: 'switch'; name: ItemName; param: ParamName; label: PropValue; when?: Condition }   // steps a choice param to its next option
export interface FindItem { kind: 'find'; name: ItemName; param: ParamName; placeholder: PropValue }   // OPEN: who holds open / closed (see NOTES)
export type HeaderItem = ButtonItem | LogoItem | TextItem | SwitchItem | FindItem;

// ── Back layer: named regions with fixed meanings (replaces regions + layouts + heights).
//   header, actions and basicAction show concealed and expanded; panel shows only expanded.
export interface DetailConfig { title: PropValue; subtitle?: PropValue; image?: PropValue; meta?: PropValue }   // the opened item, shown large in the header
export interface BackHeaderConfig { items: HeaderItem[]; detail?: DetailConfig }   // its title is the page's title
export interface BasicActionConfig { bind: ParamName | DraftBind; placeholder?: PropValue }   // one control for one param
export interface ParamRow { kind: 'param'; label?: PropValue; bind: ParamName; when?: Condition }
export interface SuggestionsRow { kind: 'suggestions'; label: PropValue; source: Source<ItemData[]>; fills: DraftBind }   // picking one sets both params to its title
export type PanelRow = ParamRow | SuggestionsRow;
export interface BackLayerConfig {
  header: BackHeaderConfig;
  actions?: ButtonItem[];
  basicAction?: BasicActionConfig;
  panel?: PanelRow[];
  toggleOnTap?: boolean;                 // default true
}

// ── Front layer
export interface FrontHeaderConfig { title: PropValue; items: HeaderItem[] }   // the disclosure is built in: every front header has one
export type PresentationKey = string;
export interface GroupConfig { by: StatePath; key: GroupKey; when?: Condition; index?: boolean }   // index: a fast-scroll index over the keys
export interface PresentationConfig { key: PresentationKey; groups?: GroupConfig[] }   // how items are laid out is composition's choice
export interface ContentConfig {
  dataSource: SourceRef;
  params?: PropValue[];                  // OPEN: today Record<string, PropValue>; needs a named shape
  view?: ParamName;                      // the param that picks the presentation
  presentations: PresentationConfig[];
}
export interface FrontLayerConfig { header: FrontHeaderConfig; collapse: 'partial' | 'full'; content: ContentConfig }

export interface BackdropPageConfig {
  id: PageId;
  kind: 'backdrop';
  title: Title;
  params: Params;
  back: BackLayerConfig;
  front: FrontLayerConfig;
  policy: BackdropPagePolicy;            // engine only: no contract reads it
}

// ═════════════════════════════════════════════════════════════
// 2. CONTRACTS — what a drawn config object offers whatever draws it.
//   config: the object · values: current, computed by core from State, queries and Layout (never stored) ·
//   intents: what it may send · children: config fields holding other drawn objects (each drawn by its own hire).
//   Engine-only config (policy, collapse, routes …) is never offered as a value.
// ═════════════════════════════════════════════════════════════
export interface Contract<C, V, I> { config: C; values: V; intents: I }
export interface NoValues {}
export type NoIntents = never;

// ── Header items
export interface ButtonValues { label: string; interaction: InteractionView }
export interface ButtonContract extends Contract<ButtonItem, ButtonValues, Actions> {}          // sends: runs its action
export interface LogoValues { label: string; playing: boolean }
export interface LogoContract extends Contract<LogoItem, LogoValues, NoIntents> {}
export interface TextValues { text: string }
export interface TextContract extends Contract<TextItem, TextValues, NoIntents> {}
export interface SwitchValues { label: string; value: ParamValue | null; next: ParamValue | null }
export interface SwitchContract extends Contract<SwitchItem, SwitchValues, SetParamsIntent> {}
export interface FindValues { value: string; placeholder: string }                               // OPEN: open / closed
export interface FindContract extends Contract<FindItem, FindValues, SetParamsIntent> {}
export type HeaderItemContract = ButtonContract | LogoContract | TextContract | SwitchContract | FindContract;

// ── Back layer
export interface DetailValues { title: string; subtitle: string | null; image: string | null; meta: string | null }
export interface DetailContract extends Contract<DetailConfig, DetailValues, NoIntents> {}
export interface BackHeaderValues { title: string; progress: number }      // progress: collapse 0 … 1 (Layout.barView)
export interface BackHeaderChildren { items: HeaderItemContract[]; detail?: DetailContract }   // only the items whose `when` holds
export interface BackHeaderContract extends Contract<BackHeaderConfig, BackHeaderValues, NoIntents> { children: BackHeaderChildren }
export interface InputValues { value: ParamValue | null; options: ParamOption[]; placeholder: string | null }
export interface InputContract extends Contract<BasicActionConfig | ParamRow, InputValues, SetParamsIntent> {}   // one control for one param (basic action, a panel row's control)
export interface ParamRowValues { label: string | null }
export interface ParamRowChildren { control: InputContract }
export interface ParamRowContract extends Contract<ParamRow, ParamRowValues, NoIntents> { children: ParamRowChildren }
export interface SuggestionValues { text: string }
export interface SuggestionContract extends Contract<ItemData, SuggestionValues, SetParamsIntent> {}   // picking it fills the draft (SuggestionsRow.fills)
export interface SuggestionsValues { label: string }
export interface SuggestionsChildren { items: SuggestionContract[] }
export interface SuggestionsContract extends Contract<SuggestionsRow, SuggestionsValues, NoIntents> { children: SuggestionsChildren }
export type PanelRowContract = ParamRowContract | SuggestionsContract;
export type BackRegionName = 'header' | 'actions' | 'basicAction' | 'panel';
export interface BackRegionView { region: BackRegionName; top: number; height: number; opacity: number; interactive: boolean }   // Layout
export interface BackLayerValues { expanded: boolean; headerHidden: boolean; regions: BackRegionView[] }
export interface BackLayerChildren { header: BackHeaderContract; actions: ButtonContract[]; basicAction?: InputContract; panel: PanelRowContract[] }
export interface BackLayerContract extends Contract<BackLayerConfig, BackLayerValues, ToggleExpandedIntent> { children: BackLayerChildren }   // toggle only while toggleOnTap

// ── Front layer
export interface ItemValues { item: ItemData; navigable: boolean }
export interface ItemContract extends Contract<PresentationConfig, ItemValues, OpenIntent> {}   // OPEN: items that play instead of open (Browse carousels)
export interface ContentValues { view: ContentView; presentation: PresentationKey; groups: ItemGroup[] }
export interface ContentChildren { items: ItemContract[] }
export interface ContentContract extends Contract<ContentConfig, ContentValues, RetryIntent> { children: ContentChildren }
export interface FrontHeaderValues { title: string; expanded: boolean; disclosureLabel: string }   // the built-in disclosure: the back layer's expanded + its label (texts backLayer.reveal / backLayer.conceal)
export interface FrontHeaderChildren { items: HeaderItemContract[] }
export interface FrontHeaderContract extends Contract<FrontHeaderConfig, FrontHeaderValues, ToggleExpandedIntent> { children: FrontHeaderChildren }
export interface FrontLayerValues { position: FrontPosition; top: number; contentOffset: number }   // top: Layout.frontLayer · contentOffset: Layout.contentOffset
export interface FrontLayerChildren { header: FrontHeaderContract; content: ContentContract }
export interface FrontLayerContract extends Contract<FrontLayerConfig, FrontLayerValues, ScrollIntent> { children: FrontLayerChildren }

// ── The page
export interface BackdropPageChildren { back: BackLayerContract; front: FrontLayerContract }
export interface BackdropPageContract extends Contract<BackdropPageConfig, NoValues, NoIntents> { children: BackdropPageChildren }

export type ContractName =
  | 'backdropPage' | 'backLayer' | 'backHeader' | 'detail' | 'input' | 'paramRow' | 'suggestions' | 'suggestion'
  | 'frontLayer' | 'frontHeader' | 'content' | 'item'
  | 'button' | 'logo' | 'text' | 'switch' | 'find';
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
export interface EventTo { event: EventName; send: 'intent' | 'action' }   // intent: the contract's intent · action: the item's config action
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
  match?: ItemSelector;                  // header items: a kind or a name
  param?: ParamMatch;                    // basic actions and panel rows
  presentation?: PresentationKey;        // content items
  env?: EnvEquals;                       // e.g. layout compact only
  hire: HireName | null;                 // null: not drawn here (e.g. the menu button on wide, where the rail has it)
}
export interface PageExceptions { page: PageId; placements: Placement[] }   // checked first, then the defaults
export interface Composition { hires: Hire[]; placements: Placement[]; pages: PageExceptions[] }

// Rules (to write in invariants.js): every placement names a hire whose contract matches; every clause names a prop /
// event / slot the free component declares and a value / child the contract offers; a hire meets every value its free
// component's required props need; every hire token aliases an existing design token; composition holds no literals;
// two hires never wrap the same free component for the same contract with identical clauses (duplicate).
