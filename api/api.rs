//! Backdrop Nav — CONTRACT, Rust rendering of api/api.d.ts (v11.0.1) for comparison.
//! Generated from the TypeScript file; not built or used by anything.
//!
//! Mapping: interface → struct (camelCase JSON via serde) · union of tagged shapes → internally tagged enum
//! (the tag field moves to the enum) · other unions → #[serde(untagged)] enum · string-literal unions → enums ·
//! `T | null` and `x?` → Option<T> · arrays → Vec · Record → HashMap · index signatures → #[serde(flatten)] map ·
//! `extends` → #[serde(flatten)] base · interfaces with methods → traits · recursion → Box<…>.
//!
//!
//! Backdrop Nav — CONTRACT
//! Abstract API layer: shapes, intents, queries, events, invariants.
//! No logic. Every implementation (web model, native, …) must satisfy this.
//! Invariants live in ./invariants.js and run against any Model.
//!
//! VERSION: contract 11.0.1 (semver — see CHANGELOG.md for the compatibility policy)
//!   minor: additive & optional (new optional fields, intents, events, queries, specs keys)
//!   major: removals, renames, changed meaning, newly required fields
//!   Implementations MUST reject config/specs/snapshots whose major differs from theirs.
//!
//! Style: every object shape is a named type; a union lists named members (type A = B | C). No anonymous { } in fields.
//! Order: dependencies first — every type is defined before it is used (recursive shapes: one marked forward reference per cycle).
//!   The numbered sections (§N, referenced in comments) therefore interleave: a section's shared shapes appear where they are first needed.
//!
//! Domains (each maps 1:1 to a future Rust crate / module — see RUST.md):
//!   nav            §1–8   navigation contract (config, policy, state, intents, events, queries)
//!   overlay        §9     transient UI (dialogs, menus, snackbars)
//!   session        §10    gates (signed out, onboarding, permissions)
//!   route          §11    URLs / deep links ↔ state
//!   persist        §12    what survives restart / process death
//!   player         §13    OPTIONAL domain: playback state (shells own actual audio)
//!   layout         §14    pure "what to draw and how it moves" from state + design (no pixels)
//!   specs          §15    design-system data: tokens, components, choreography, screens
//!   wire           §16    backend API (server ↔ core data)
//!   interactive    §20    InteractiveComponent: states + action; null / unsupported action ⇒ disabled
//!   (§1 Bar, Params)      bars are start / title / end lists of ComponentRefs; pages hold typed params that controls bind to
//!
//! Order: every type is defined before it is used, except where shapes are recursive (conditions, prop and visual values;
//! pages ↔ items ↔ intents ↔ actions) — there one declaration per cycle refers ahead, marked 'recursive'.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub const CONTRACT_VERSION: &str = "11.0.1";
pub type SemVer = String;

// ─────────────────────────────────────────────────────────────
// 0. Primitives
// ─────────────────────────────────────────────────────────────
pub type DeckId = String;
pub type LayerId = String;
pub type PageId = String;
pub type ItemId = String;
pub type SourceRef = String;
/// dotted path into a page state, e.g. 'params.tab', 'back.expanded'; in a repeat or item ref also '$<as>' / '$<as>.<field>'
pub type StatePath = String;
/// height defaults to 720 in layout
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub width: f64,
    pub height: Option<f64>,
    pub touch: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LayoutClass {
    #[serde(rename = "compact")] Compact,
    #[serde(rename = "wide")] Wide,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Direction {
    #[serde(rename = "ltr")] Ltr,
    #[serde(rename = "rtl")] Rtl,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Breakpoints {
    pub compact_max: f64,
    pub min_content: f64,
    pub rail_width: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckTarget {
    pub deck: DeckId,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LinkTarget {
    Literal(LinkTargetLiteral),
    DeckTarget(DeckTarget),
}
/// the literal members of `LinkTarget`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LinkTargetLiteral {
    #[serde(rename = "activeDeck")] ActiveDeck,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HistoryMode {
    #[serde(rename = "record")] Record,
    #[serde(rename = "ignore")] Ignore,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryByLayout {
    pub compact: HistoryMode,
    pub wide: HistoryMode,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoversNav {
    pub compact: bool,
    pub wide: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullscreenPresentation {
    pub covers_nav: CoversNav,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleFromItem {
    pub from: String, // always "item"
}
/// ── Params: the values a page holds for its controls (filters, tabs, a query, a date…).
/// The engine knows only their type: state, URL codec, history, reset policy and data params. Any slot can bind a control to one.
pub type ParamName = String;
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ParamType {
    #[serde(rename = "choice")] Choice,
    #[serde(rename = "choices")] Choices,
    #[serde(rename = "text")] Text,
    #[serde(rename = "flag")] Flag,
    #[serde(rename = "number")] Number,
    #[serde(rename = "date")] Date,
}
/// e.g. 'slide' (tabs), 'swap' (filters), 'default'
pub type ParamMotion = String;
pub type NumberRange = (f64, f64);
pub type DateRange = (String, String);
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ParamValue {
    Text(String),
    List(Vec<String>),
    Bool(bool),
    Number(f64),
    NumberRange(NumberRange),
    DateRange(DateRange),
    Null,
}
//   choice: an option value · choices: option values · text: string · flag: boolean · number: number | [from, to] · date: 'YYYY-MM-DD' | [from, to]
// The default lives in the page policy (policy.params.<name>.default), like every other field.
/// typing updates change (a draft), submitting sets both
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftBind {
    pub change: ParamName,
    pub submit: ParamName,
}
/// the param's options (ParamOption)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsOf {
    pub options: ParamName,
}
/// a field of the page's state (or of '$item' / a repeat element)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bind {
    pub bind: StatePath,
}
/// ── Texts: every user-facing string the app owns is a TextRef. Content from the backend arrives localized.
/// BCP 47, e.g. 'en', 'fi', 'he'
pub type LocaleId = String;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedLocale {
    pub id: LocaleId,
    pub dir: Direction,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleConfig {
    pub default: LocaleId,
    pub supported: Vec<SupportedLocale>,
}
/// e.g. 'filters.summary'
pub type TextId = String;
/// page state (deep equality); path must lie in a field declared by the page's policy
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathEquals {
    pub path: StatePath,
    pub equals: Value,
}
/// the list at path contains the value (e.g. 'params.genre' includes 'Jazz')
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathIncludes {
    pub path: StatePath,
    pub includes: Value,
}
/// 'compact' | 'wide' · true | false · sheet: 'none' | 'beside' | 'over'
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvEquals {
    pub env: EnvEqualsEnv,
    pub equals: Value,
}
/// `EnvEquals.env`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EnvEqualsEnv {
    #[serde(rename = "layout")] Layout,
    #[serde(rename = "touch")] Touch,
    #[serde(rename = "sheet")] Sheet,
    #[serde(rename = "dir")] Dir,
}
/// recursive: refers to Not, All, Any (defined below)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Condition {
    PathEquals(PathEquals),
    PathIncludes(PathIncludes),
    EnvEquals(EnvEquals),
    Not(Not),
    All(All),
    Any(Any),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct All {
    pub all: Vec<Condition>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Any {
    pub any: Vec<Condition>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Not {
    pub not: Box<Condition>,
}
/// the engine's list: DERIVED_IDS
pub type DerivedId = String;
/// a value the engine computes (Queries.derived); of: the field it is about
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Derived {
    pub derived: DerivedId,
    pub of: Option<StatePath>,
}
/// recursive: refers to TextRef, IfValue (defined below)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropValue {
    Text(String),
    Number(f64),
    Bool(bool),
    Null,
    Bind(Bind),
    Derived(Derived),
    TextRef(TextRef),
    IfValue(IfValue),
}
/// ICU MessageFormat: "{count, plural, one {# filter} other {# filters}}"
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRef {
    pub text: TextId,
    pub args: Option<HashMap<String, PropValue>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IfValue {
    pub r#if: Condition,
    pub then: Box<PropValue>,
    pub r#else: Box<PropValue>,
}
/// params may bind page state, e.g. { prefix: { bind: 'params.q' } }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceRef {
    pub data_source: SourceRef,
    pub params: Option<HashMap<String, PropValue>>,
}
/// A value that is either fixed in config or fetched (the dataSource's items). Fixed values resolve as 'ready'.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Source<T> {
    Value(T),
    DataSourceRef(DataSourceRef),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Title {
    Source(Source<String>),
    TitleFromItem(TitleFromItem),
    TextRef(TextRef),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamOption {
    pub value: String,
    pub label: ParamOptionLabel,
}
/// `ParamOption.label`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ParamOptionLabel {
    TextRef(TextRef),
    Text(String),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamSpec {
    pub r#type: ParamType,
    pub options: Option<Source<Vec<ParamOption>>>, // choice / choices: the values it may take, in order
    pub axis: Option<bool>, // behaviour: choice options are ordered siblings → paramChanged carries a direction
    pub motion: Option<ParamMotion>, // which param-change motion the design uses (a name the choreography declares); default 'default'
    pub range: Option<bool>, // number / date: the value is [from, to]
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub step: Option<f64>,
    pub url: Option<bool>, // carried in the URL (where routes.params allows); default false
    pub history: Option<ParamSpecHistory>, // pushFirst: leaving the default adds a history entry and back returns to the default; default 'replace'
    pub data: Option<bool>, // passed to the content dataSource (contentParams); default true. false: presentation only, or a draft
}
/// `ParamSpec.history`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ParamSpecHistory {
    #[serde(rename = "replace")] Replace,
    #[serde(rename = "pushFirst")] PushFirst,
}
pub type Params = HashMap<ParamName, ParamSpec>;
/// ── Roles: what a slot demands of its component
/// A role is an abstract component contract. The engine supplies only what it decides; everything else the config binds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RoleId {
    #[serde(rename = "interactive")] Interactive,
    #[serde(rename = "input")] Input,
    #[serde(rename = "item")] Item,
    #[serde(rename = "navigation")] Navigation,
    #[serde(rename = "disclosure")] Disclosure,
}
/// value: a ParamValue · options: ParamOption[] (labels resolved)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PropType {
    #[serde(rename = "string")] String,
    #[serde(rename = "number")] Number,
    #[serde(rename = "boolean")] Boolean,
    #[serde(rename = "token")] Token,
    #[serde(rename = "slot")] Slot,
    #[serde(rename = "string[]")] String,
    #[serde(rename = "value")] Value,
    #[serde(rename = "options")] Options,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub supplies: HashMap<String, PropType>, // props the engine fills in; the config may not set them
    pub emits: HashMap<String, Option<PropType>>, // events the component reports, with payload type
}
/// repeat / item elements by name: { item: ItemData } → '$item.<field>'
pub type RefScope = HashMap<String, Value>;
/// ── Placement identity
/// Where a component sits IS its identity: interaction state, focus and press feedback belong to a slot path,
/// never to a position on screen or to the component type.
pub type SlotPath = String;
//   '<surface>/<page id>/<slot>' + '[i]' per list position + '#<item id>' per data item (page and item ids percent-encoded)
//   surface: 'deck:<id>' | 'layer:<id>' | 'peek:<layer>' | 'nav' | 'overlay:<id>' | 'gate:<id>'
// Rules: distinct places → distinct paths; the same place on the same page keeps its path; another page → another path.
/// Hierarchy: baseSwitch ⊃ { deckSwitch, layerOpen, layerClose }
///  reselect = active deck's nav item tapped while its stack is already at base (fires on the base page)
/// that param changed (a param never reacts to its own change)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamChangeOf {
    pub param_change: ParamName,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LifecycleEvent {
    Literal(LifecycleEventLiteral),
    ParamChangeOf(ParamChangeOf),
}
/// the literal members of `LifecycleEvent`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LifecycleEventLiteral {
    #[serde(rename = "enter")] Enter,
    #[serde(rename = "return")] Return,
    #[serde(rename = "reselect")] Reselect,
    #[serde(rename = "paramChange")] ParamChange,
    #[serde(rename = "baseSwitch")] BaseSwitch,
    #[serde(rename = "deckSwitch")] DeckSwitch,
    #[serde(rename = "layerOpen")] LayerOpen,
    #[serde(rename = "layerClose")] LayerClose,
}
/// e.g. back.expanded on { paramChange: 'tab' } set true
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyReaction<T> {
    pub event: LifecycleEvent,
    pub set: PolicyReactionSet<T>,
}
/// the literal members of `PolicyReactionSet`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PolicyReactionSetLiteral {
    #[serde(rename = "default")] Default,
}
/// `PolicyReaction.set`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PolicyReactionSet<T> {
    Literal(PolicyReactionSetLiteral),
    Value(T),
}

// ─────────────────────────────────────────────────────────────
// 2. POLICY (metastate config — mirrors state shape)
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldPolicy<T> {
    pub default: T,
    pub reset_on: Vec<LifecycleEvent>, // a parent event matches all its children
    pub scope: Option<StatePath>, // null = one value; path = one value per value at that path (e.g. 'params.tab')
    pub on: Option<Vec<PolicyReaction<T>>>, // reactions after resets, in order
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackPolicy {
    pub expanded: FieldPolicy<bool>,
    pub header_hidden: Option<FieldPolicy<bool>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontPolicy {
    pub scroll: FieldPolicy<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackdropPagePolicy {
    pub params: HashMap<ParamName, FieldPolicy<ParamValue>>, // one per declared param
    pub back: BackPolicy,
    pub front: FrontPolicy,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBarPagePolicy {
    pub params: Option<HashMap<ParamName, FieldPolicy<ParamValue>>>,
    pub scroll: FieldPolicy<f64>,
}

// ─────────────────────────────────────────────────────────────
// 3. DATA (fetched; keyed by dataSource + params)
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Status {
    #[serde(rename = "loading")] Loading,
    #[serde(rename = "ready")] Ready,
    #[serde(rename = "error")] Error,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataError {
    pub message: String,
    pub retryable: bool,
}
/// What an item opens. Where it opens is decided by origin (linkTarget), never by item type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageIdentity {
    pub id: Option<PageId>,
    pub title: Option<Title>,
}
/// navigation within a layer's fixed set
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerPageSpec {
    pub page: PageId,
}
/// headerHidden: set by the scroll intent when the 'header' region is hideOnScroll; cleared at the top, scrolling up and on expand
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackState {
    pub expanded: bool,
    pub header_hidden: Option<bool>,
}
/// A field with a policy scope is stored per scope key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Scoped<T> {
    Value(T),
    Record(HashMap<String, T>),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontState {
    pub scroll: Scoped<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavRecord {
    pub kind: NavRecordKind, // 'expand' / 'overlay' only in derived (touch) entries; 'param' = a pushFirst param left its default (back resets it)
    pub deck: Option<DeckId>,
    pub prev_deck: Option<DeckId>,
    pub from: Option<DeckId>,
    pub to: Option<DeckId>,
    pub layer: Option<LayerId>,
    pub id: Option<String>,
    pub param: Option<ParamName>,
    pub page: Option<PageId>,
}
/// `NavRecord.kind`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NavRecordKind {
    #[serde(rename = "push")] Push,
    #[serde(rename = "deckSwitch")] DeckSwitch,
    #[serde(rename = "layerOpen")] LayerOpen,
    #[serde(rename = "layerPush")] LayerPush,
    #[serde(rename = "expand")] Expand,
    #[serde(rename = "overlay")] Overlay,
    #[serde(rename = "param")] Param,
}

// ─────────────────────────────────────────────────────────────
// 5. INTENTS (the only way to change state)
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerTarget {
    pub layer: LayerId,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Origin {
    DeckTarget(DeckTarget),
    LayerTarget(LayerTarget),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLayerPageIntent {
    pub layer: LayerId,
    pub page: PageId,
}
/// system/browser back; device decides semantics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackIntent {
}
/// in-app back arrow: pops that stack (drops its matching record); default = the focused stack
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpIntent {
    pub target: Option<Origin>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchDeckIntent {
    pub deck: DeckId,
}
/// tap active deck: depth > 1 → pop to base ('return'); at base → 'reselect' lifecycle event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReselectDeckIntent {
    pub deck: DeckId,
}
/// page default: the focused top page if it declares every name, else the backdrop page under it
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetParamsIntent {
    pub values: HashMap<ParamName, ParamValue>,
    pub page: Option<PageId>,
}
/// choices: add / remove one option
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleParamIntent {
    pub name: ParamName,
    pub option: String,
    pub page: Option<PageId>,
}
/// to policy defaults (all when omitted) — e.g. 'Clear all'
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetParamsIntent {
    pub names: Option<Vec<ParamName>>,
    pub page: Option<PageId>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetExpandedIntent {
    pub expanded: bool,
}
/// = setExpanded(!current) on the page under the focus
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleExpandedIntent {
}
/// may be applied without re-render
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollIntent {
    pub top: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLayerIntent {
    pub layer: LayerId,
    pub return_focus: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseLayerIntent {
    pub layer: LayerId,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusIntent {
    pub target: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDeviceIntent {
    pub device: Device,
}
/// §17 — current page's content if omitted
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryIntent {
    pub data_source: Option<SourceRef>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseOverlayIntent {
    pub id: Option<String>,
    pub result: Option<Value>,
}
/// §11 deep link / browser URL
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigateUrlIntent {
    pub url: String,
}
/// the shell has restored state and loaded first data (once)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchedIntent {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckSwitchedEvent {
    pub from: DeckId,
    pub to: DeckId,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpandedChangedEvent {
    pub expanded: bool,
}
/// the back-layer header (hideOnScroll)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderVisibilityChangedEvent {
    pub hidden: bool,
}
/// one per changed param; direction = sign of the option index change on an axis param, else 0
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamChangedEvent {
    pub name: ParamName,
    pub motion: ParamMotion,
    pub direction: i8,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerEvent {
    pub layer: LayerId,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayEvent {
    pub id: String,
    pub result: Option<Value>,
}
/// shell mirrors to the address bar / history. replace: navigateUrl, restore and param changes — except a pushFirst param leaving its default, which pushes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlChangedEvent {
    pub url: String,
    pub replace: bool,
}
/// data layer refetches
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryRequestedEvent {
    pub data_source: SourceRef,
    pub params: HashMap<String, Value>,
}
/// splash → app (choreography)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchedEvent {
}
/// back with nothing left
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitEvent {
}

// ─────────────────────────────────────────────────────────────
// 7. QUERIES (derived — never stored)
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BackAction {
    #[serde(rename = "closeOverlay")] CloseOverlay,
    #[serde(rename = "collapse")] Collapse,
    #[serde(rename = "resetParam")] ResetParam,
    #[serde(rename = "pop")] Pop,
    #[serde(rename = "popLayer")] PopLayer,
    #[serde(rename = "closeLayer")] CloseLayer,
    #[serde(rename = "startDeck")] StartDeck,
    #[serde(rename = "undoRecord")] UndoRecord,
    #[serde(rename = "exit")] Exit,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SideMode {
    #[serde(rename = "beside")] Beside,
    #[serde(rename = "modal")] Modal,
    #[serde(rename = "auto")] Auto,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FrontPosition {
    #[serde(rename = "expanded")] Expanded,
    #[serde(rename = "partial")] Partial,
    #[serde(rename = "full")] Full,
}

// ─────────────────────────────────────────────────────────────
// PREFS
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub reduced_motion: bool, // presentation swaps transitions for 'instant' / 'fade'
    pub theme: String, // token set id (§15)
    pub token_overrides: HashMap<String, PrefsTokenOverrides>, // personalization: never forks components
    pub text_scale: f64,
    pub locale: LocaleId, // one of AppConfig.locales.supported; default AppConfig.locales.default
}
/// `Prefs.tokenOverrides`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PrefsTokenOverrides {
    Text(String),
    Number(f64),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPrefsIntent {
    pub prefs: PrefsPatch,
}

// ─────────────────────────────────────────────────────────────
// 10. SESSION — gates before the app
// ─────────────────────────────────────────────────────────────
pub type GateId = String;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionMissing {
    pub permission_missing: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SessionPredicate {
    Literal(SessionPredicateLiteral),
    PermissionMissing(PermissionMissing),
}
/// the literal members of `SessionPredicate`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SessionPredicateLiteral {
    #[serde(rename = "signedOut")] SignedOut,
    #[serde(rename = "onboardingPending")] OnboardingPending,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PermissionStatus {
    #[serde(rename = "granted")] Granted,
    #[serde(rename = "denied")] Denied,
    #[serde(rename = "unknown")] Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub signed_in: bool,
    pub onboarded: bool,
    pub permissions: HashMap<String, PermissionStatus>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionChangedEvent {
    pub session: SessionState,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedIn {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedOut {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Onboarded {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionChanged {
    pub name: String,
    pub status: PermissionChangedStatus,
}
/// `PermissionChanged.status`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PermissionChangedStatus {
    #[serde(rename = "granted")] Granted,
    #[serde(rename = "denied")] Denied,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SessionEvent {
    #[serde(rename = "signedIn")] SignedIn(SignedIn),
    #[serde(rename = "signedOut")] SignedOut(SignedOut),
    #[serde(rename = "onboarded")] Onboarded(Onboarded),
    #[serde(rename = "permission")] Permission(PermissionChanged),
}
// Invariant: signing out resets every deck and layer stack, overlays, focus returns and history (unconditional, not policy-driven).
/// §10
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIntent {
    pub event: SessionEvent,
}

// ─────────────────────────────────────────────────────────────
// 11. ROUTE — URLs / deep links ↔ state
// ─────────────────────────────────────────────────────────────
/// A URL names one destination: a gate, else an open recorded layer, else the active deck's stack — plus the url params of
/// that destination's top page. AppConfig is plain data (JSON): no functions anywhere in it.
/// Transient UI (expanded, overlays, transient layers) is never in the URL.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteTable {
    pub base: String, // e.g. '/'
    pub deck: HashMap<DeckId, String>, // DeckId → path segment ('browse'); route names are slugs (lowercase, '-')
    pub layer: Option<HashMap<LayerId, String>>, // recorded layers: their own destination ('/dedede/fliboo')
    pub gate: Option<HashMap<GateId, String>>, // gates: their own destination ('/sign-in')
    pub params: Option<RouteTableParams>, // 'top': the destination's top page carries its url params as a query string (default 'none')
}
/// `RouteTable.params`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RouteTableParams {
    #[serde(rename = "none")] None,
    #[serde(rename = "top")] Top,
}
//   /<deck>/<page>/<page>?<name>=<value>&…   e.g. /library?tab=audiobooks&genre=mystery
//   /<layer>/<page>…                         e.g. /dedede/fliboo
//   /<gate>                                  e.g. /sign-in
// Segments: the slug of the item id (layers: of the page key) — lowercase; each run of characters other than letters, digits and '.'
// becomes one '-' (trimmed at the ends); non-ASCII letters percent-encoded;
// navigateUrl matches by slug, case-insensitively. Sibling items have distinct slugs.
// Values: choice / choices → slugs of option values (choices comma-separated, options order), matched case-insensitively ·
// text → lowercased, spaces as '+' · flag '1' | '0' · number / date as is · range 'from..to'. Only values that differ from the
// policy default; unknown names and invalid values are ignored.
// navigateUrl: a deck URL closes recorded layers; a layer URL opens the layer over the current deck; a gate URL that doesn't
// apply goes to the start deck.
// Invariant: navigateUrl(url(state)) reproduces the destination: deck + stack page ids + top-page url params (text case-insensitively),
// or the layer and its stack, or the gate.

// ─────────────────────────────────────────────────────────────
// 12. PERSIST — restart / process death
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistPolicy {
    pub stacks: PersistPolicyStacks,
    pub page_fields: Vec<StatePath>, // e.g. ['params', 'front.scroll'] or a single 'params.genre'; others reset to policy defaults
    pub layers: PersistPolicyLayers,
}
/// `PersistPolicy.stacks`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PersistPolicyStacks {
    #[serde(rename = "all")] All,
    #[serde(rename = "activeDeck")] ActiveDeck,
    #[serde(rename = "none")] None,
}
/// `PersistPolicy.layers`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PersistPolicyLayers {
    #[serde(rename = "none")] None,
    #[serde(rename = "recordedOnly")] RecordedOnly,
    #[serde(rename = "all")] All,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSnapshot {
    pub id: PageId,
    pub fields: HashMap<String, Value>,
}
// Invariant: restore(snapshot(state)) equals state on every persisted field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckSnapshot {
    pub pages: Vec<PageSnapshot>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub version: f64,
    pub contract_version: Option<SemVer>,
    pub active_deck: DeckId,
    pub decks: HashMap<DeckId, DeckSnapshot>,
    pub layers: Option<HashMap<LayerId, Vec<PageId>>>,
}
/// §12
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreIntent {
    pub snapshot: Snapshot,
}

// ─────────────────────────────────────────────────────────────
// 13. PLAYER — OPTIONAL domain: playback state (shells own actual audio)
// ─────────────────────────────────────────────────────────────
/// Apps and implementations may omit this section entirely; nothing else in the contract depends on it
/// (player actions in §20 are simply unavailable without a player). What is playing is shown by a design
/// component each platform implements against its player (e.g. nowPlaying) — not through config.
/// Core owns WHAT should play; shells own MAKING SOUND (Media3 / <audio> / desktop engine)
/// and report back facts via 'reported' intents. Separate model instance; shares data layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: ItemId,
    pub title: String,
    pub duration_ms: Option<f64>,
    pub source: SourceRef,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PlayerStatus {
    #[serde(rename = "idle")] Idle,
    #[serde(rename = "loading")] Loading,
    #[serde(rename = "playing")] Playing,
    #[serde(rename = "paused")] Paused,
    #[serde(rename = "ended")] Ended,
    #[serde(rename = "error")] Error,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RepeatMode {
    #[serde(rename = "off")] Off,
    #[serde(rename = "all")] All,
    #[serde(rename = "one")] One,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub queue: Vec<Track>,
    pub index: f64, // -1 = nothing
    pub status: PlayerStatus,
    pub position_ms: f64, // last reported
    pub repeat: RepeatMode,
    pub shuffle: bool,
    pub order: Vec<f64>, // play order (shuffled permutation of queue indices)
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayQueue {
    pub tracks: Vec<Track>,
    pub start: Option<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Enqueue {
    pub tracks: Vec<Track>,
    pub next: Option<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transport {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Seek {
    pub position_ms: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetRepeat {
    pub repeat: RepeatMode,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetShuffle {
    pub shuffle: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionFact {
    pub ms: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorFact {
    pub message: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleFact {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum PlayerFact {
    #[serde(rename = "position")] Position(PositionFact),
    #[serde(rename = "error")] Error(ErrorFact),
    #[serde(rename = "ended")] Ended(SimpleFact),
    #[serde(rename = "buffering")] Buffering(SimpleFact),
    #[serde(rename = "ready")] Ready(SimpleFact),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reported {
    pub fact: PlayerFact,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PlayerIntent {
    #[serde(rename = "playQueue")] PlayQueue(PlayQueue),
    #[serde(rename = "enqueue")] Enqueue(Enqueue),
    #[serde(rename = "play")] Play(Transport),
    #[serde(rename = "pause")] Pause(Transport),
    #[serde(rename = "toggle")] Toggle(Transport),
    #[serde(rename = "next")] Next(Transport),
    #[serde(rename = "previous")] Previous(Transport),
    #[serde(rename = "seek")] Seek(Seek),
    #[serde(rename = "setRepeat")] SetRepeat(SetRepeat),
    #[serde(rename = "setShuffle")] SetShuffle(SetShuffle),
    #[serde(rename = "reported")] Reported(Reported),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadCommand {
    pub track: Track,
    pub autoplay: bool,
    pub position_ms: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekCommand {
    pub position_ms: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleCommand {
}
/// what the shell must do after a dispatch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PlayerCommand {
    #[serde(rename = "load")] Load(LoadCommand),
    #[serde(rename = "seek")] Seek(SeekCommand),
    #[serde(rename = "play")] Play(SimpleCommand),
    #[serde(rename = "pause")] Pause(SimpleCommand),
    #[serde(rename = "stop")] Stop(SimpleCommand),
}
pub trait PlayerModel {
    fn get_state(&self) -> PlayerState;
    fn dispatch(&self, i: &PlayerIntent) -> Vec<PlayerCommand>;
    fn current(&self) -> Option<Track>;
    fn supports(&self, i: &PlayerIntent) -> bool; // §20 — known type + preconditions: transport (play/pause/toggle/next/previous/seek) needs a current track; playQueue/enqueue need tracks
}

// ─────────────────────────────────────────────────────────────
// 14. LAYOUT — pure "what to draw and how it moves" (no pixels, no timers)
// ─────────────────────────────────────────────────────────────
/// Turns state + the design (§15) into descriptors the shells render. Shells measure (item rects)
/// and pass measurements in; layout never touches the platform. Sizes come from config (breakpoints,
/// layer presentation) and design tokens — layout has no constants of its own.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Geometry {
    pub width: f64,
    pub height: f64,
    pub rail_width: f64,
    pub nav_height: f64,
    pub peek_height: f64,
    pub content_width: f64,
    pub content_height: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub top: f64,
    pub left: f64,
    pub w: f64,
    pub h: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionInstance {
    pub region: String,
    pub top: f64,
    pub opacity: f64,
    pub interactive: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontLayerView {
    pub top: f64,
    pub state: FrontLayerViewState,
    pub visual: HashMap<String, Value>, // resolved from component spec states (e.g. { divider: null, cornerTR: 0 })
}
/// `FrontLayerView.state`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FrontLayerViewState {
    #[serde(rename = "expanded")] Expanded,
    #[serde(rename = "partlyCollapsed")] PartlyCollapsed,
    #[serde(rename = "fullyCollapsed")] FullyCollapsed,
}
/// Motion is design (§15 motions): the contract only fixes the shape. kind = a motion the design declares (or 'instant');
/// params = that motion's declared parameters, tokens resolved and defaults applied. Platforms implement each kind they list.
pub type MotionId = String;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionDescriptor {
    pub kind: String,
}
/// a visual changing value · pointer down · pointer up · runs while shown (loading indicators)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MotionTrigger {
    #[serde(rename = "change")] Change,
    #[serde(rename = "press")] Press,
    #[serde(rename = "release")] Release,
    #[serde(rename = "loop")] Loop,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutEnv {
    pub layout: LayoutClass,
    pub touch: bool,
    pub sheet: LayoutEnvSheet,
    pub dir: Direction,
}
/// `LayoutEnv.sheet`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LayoutEnvSheet {
    #[serde(rename = "none")] None,
    #[serde(rename = "beside")] Beside,
    #[serde(rename = "over")] Over,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontLayerContext {
    pub env: Option<LayoutEnv>,
    pub measured: Option<HashMap<String, f64>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurements {
    pub item_rect: Option<Rect>,
    pub target_rect: Option<Rect>,
    pub origin: Option<Point>,
}

// ─────────────────────────────────────────────────────────────
// 15. SPECS — design-system data (design system → design → code)
// ─────────────────────────────────────────────────────────────
pub type ComponentId = String;
/// the app starts on the splash until the shell reports 'launched'
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchConfig {
    pub splash: ComponentId,
    pub min_ms: Option<f64>,
}

// ─────────────────────────────────────────────────────────────
// 9. OVERLAY — transient UI (dialogs, menus, sheets, snackbars)
// ─────────────────────────────────────────────────────────────
/// Overlays sit above everything; back closes the topmost blocking overlay first.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySpec {
    pub id: String,
    pub kind: OverlaySpecKind,
    pub component: ComponentId, // must be in the registry (§15)
    pub props: Option<HashMap<String, Value>>, // the component's content (a menu: its items with labels and actions)
    pub blocking: bool, // blocking → captures back & focus; snackbar = false
    pub timeout_ms: Option<f64>, // snackbars auto-close (shell runs the timer, dispatches closeOverlay)
    pub history: Option<OverlaySpecHistory>, // touch: a blocking overlay adds one derived back entry
}
/// `OverlaySpec.kind`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OverlaySpecKind {
    #[serde(rename = "dialog")] Dialog,
    #[serde(rename = "menu")] Menu,
    #[serde(rename = "actionSheet")] ActionSheet,
    #[serde(rename = "snackbar")] Snackbar,
}
/// `OverlaySpec.history`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OverlaySpecHistory {
    #[serde(rename = "transient")] Transient,
    #[serde(rename = "ignore")] Ignore,
}
/// §9; returnFocus = element id in the opener
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenOverlayIntent {
    pub overlay: OverlaySpec,
    pub return_focus: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayEntry {
    pub spec: OverlaySpec,
    pub opened_from: Option<Origin>,
}
/// Directions in motion params (e.g. sharedAxis direction) are logical: +1 = toward the end side. Shells mirror them in RTL.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutGeometry {
    #[serde(flatten)] pub geometry: Geometry,
    pub side: Option<SideMode>,
    pub wide: bool,
    pub navigation: ComponentId,
}
/// 'color.divider', 'motion.duration.medium', 'motion.easing.standard', …
pub type TokenSet = HashMap<String, TokenSetValue>;
/// `TokenSet.undefined`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TokenSetValue {
    Text(String),
    Number(f64),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenRef {
    pub token: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MotionParamType {
    #[serde(rename = "duration")] Duration,
    #[serde(rename = "easing")] Easing,
    #[serde(rename = "number")] Number,
    #[serde(rename = "string")] String,
    #[serde(rename = "boolean")] Boolean,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionParam {
    pub r#type: MotionParamType,
    pub default: Option<Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionDef {
    pub params: HashMap<String, MotionParam>,
    pub reduced: String, // what it becomes under prefs.reducedMotion (component motion; events use choreography.reducedMotion)
}
pub type MotionRegistry = HashMap<MotionId, MotionDef>;
/// param values: literal or TokenRef
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionTemplate {
    pub motion: MotionId,
    pub trigger: Option<MotionTrigger>,
}
/// the surface's colour role (registry `provides`)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceRole {
    pub role: String,
}
/// recursive: refers to VariantCases, IfVisual (defined below)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum VisualValue {
    TokenRef(TokenRef),
    Text(String),
    Number(f64),
    Null,
    SurfaceRole(SurfaceRole),
    VariantCases(VariantCases),
    IfVisual(IfVisual),
}
/// by layout env or page state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IfVisual {
    pub r#if: Condition,
    pub then: Box<VisualValue>,
    pub r#else: Box<VisualValue>,
}
/// by the placement's variant on that axis
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantCases {
    pub variant: String,
    pub cases: HashMap<String, VisualValue>,
}
/// visual → state → value
pub type Visuals = HashMap<String, HashMap<String, VisualValue>>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantAxis {
    pub options: Vec<String>,
    pub default: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderForm {
    pub visuals: Option<Visuals>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfacePattern {
    pub layer: Option<LayerId>,
}
/// the param's motion name (ParamSpec.motion); omitted: any
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamPattern {
    pub motion: Option<ParamMotion>,
}
/// signedIn: matches the session after the change (sign-in vs sign-out)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPattern {
    pub signed_in: Option<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlainPattern {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionTemplate {
    pub kind: String,
    pub ms: Option<TokenRef>,
    pub easing: Option<TokenRef>,
}
/// Which components a platform has built is a fact about that platform's code, not about the design:
/// each platform publishes a manifest next to its code.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformManifest {
    pub platform: String,
    pub implements: Vec<ComponentId>,
    pub motions: Vec<MotionId>,
}
// Placement: a component's { role } values resolve against the surface it sits on — every surface it is placed on provides
// every role it uses. A placement's variants are declared by the component, with a declared option.
// Texts: every TextRef id exists in the default locale; every supported locale has every id; every message parses.
// Placeholders: every component implementing item, or input accepting choice / choices, declares a placeholder form.
// Content: presentations cover every option of the view param (or 'default'); layouts are registered components every platform implements;
// presentation items bind only '$item.*' or page fields.
// Params: every bind names a param of its page; the bound component implements input and accepts its type; every param has a policy;
// choice / choices declare options; defaults are valid values of their type; every param's motion names a paramChanged rule.
// Invariants: every component the config uses (slots, overlays, content states) is registered and implemented by
// every platform manifest — a variant counts as implemented wherever its parent is; extends chains end at a registered
// component without cycles, and a child keeps its parent's roles, props and visuals; every ModelEvent type has a choreography rule.
// Motion: every motion the choreography or a component uses is declared, with declared params only; every platform implements
// every motion used; reduced motion replaces every event motion by choreography.reducedMotion and every component motion by its reduced form.

// ─────────────────────────────────────────────────────────────
// 16. WIRE — backend API (server ↔ core)
// ─────────────────────────────────────────────────────────────
/// The data section (§3) IS the wire format. A SourceRef resolves to an endpoint; the core's data
/// layer adds caching, offline and status. Navigation/UI state never goes over the wire.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireEndpoint {
    pub r#ref: SourceRef,
    pub method: String, // always "GET"
    pub path: String,
    pub params: Option<HashMap<String, WireEndpointParams>>,
}
/// `WireEndpoint.params`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WireEndpointParams {
    #[serde(rename = "string")] String,
    #[serde(rename = "number")] Number,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wire {
    pub endpoints: Vec<WireEndpoint>,
}

// ─────────────────────────────────────────────────────────────
// 17. CONTENT STATES — loading / empty / error / offline
// ─────────────────────────────────────────────────────────────
/// loading: the item component's placeholder form
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentStateComponents {
    pub empty: ComponentId,
    pub error: ComponentId,
    pub stale_banner: ComponentId,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ContentViewState {
    #[serde(rename = "loading")] Loading,
    #[serde(rename = "ready")] Ready,
    #[serde(rename = "empty")] Empty,
    #[serde(rename = "error")] Error,
    #[serde(rename = "offlineStale")] OfflineStale,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentView {
    pub state: ContentViewState,
    pub show_items: bool, // false for loading/empty/error
    pub component: Option<ComponentId>, // empty / error component (registry); null while loading
    pub placeholders: f64, // loading: how many placeholder items to draw (item component's placeholder form)
    pub banner: Option<ComponentId>, // staleBanner when offline with cached items
    pub retry: bool, // retryable error or offlineStale → offers the retry intent
}
// Rules: loading never shows items; empty never shows placeholders; retryable errors offer retry;
// offline with cached items shows them with a stale banner; offline without items = error (not retryable until online).

// ─────────────────────────────────────────────────────────────
// 18. FOCUS — accessibility / keyboard
// ─────────────────────────────────────────────────────────────
/// nav bar / rail
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavSurface {
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckSurface {
    pub deck: DeckId,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerSurface {
    pub layer: LayerId,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySurface {
    pub id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Surface {
    #[serde(rename = "nav")] Nav(NavSurface),
    #[serde(rename = "backLayer")] BackLayer(DeckSurface),
    #[serde(rename = "frontLayer")] FrontLayer(DeckSurface),
    #[serde(rename = "appBarPage")] AppBarPage(DeckSurface),
    #[serde(rename = "layer")] Layer(LayerSurface),
    #[serde(rename = "overlay")] Overlay(OverlaySurface),
}
/// shell moves focus
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusRestoreEvent {
    pub surface: Surface,
    pub element: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusReturn {
    pub opened: Surface,
    pub surface: Surface,
    pub element: Option<String>,
}
// Rules: a blocking overlay traps focus (focusOrder = [overlay]); a covering layer (fullscreen, compact sheet,
// modal/auto side sheet) traps focus; a 'beside' layer joins the deck's order; closing a surface emits focusRestore to its opener.

// ─────────────────────────────────────────────────────────────
// 19. WINDOWS — DECIDED: single window
// ─────────────────────────────────────────────────────────────
// One AppState, one window, on every platform (desktop included). No WindowId in the contract.
// Revisit only with a major version.

// ─────────────────────────────────────────────────────────────
// 20. INTERACTIVE COMPONENTS — buttons, nav items, list rows, chips…
// ─────────────────────────────────────────────────────────────
/// Abstract contract every actionable component implements (registry entry implements the 'interactive' role).
/// The component never decides "enabled" itself: it's derived from its action against the current state.
/// Disabled means "not available", NOT "would change nothing": idempotent actions (switch to the active deck,
/// close a closed layer) stay enabled. A shell passes action = null for anything it hasn't implemented.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum InteractionState {
    #[serde(rename = "enabled")] Enabled,
    #[serde(rename = "disabled")] Disabled,
    #[serde(rename = "hover")] Hover,
    #[serde(rename = "pressed")] Pressed,
    #[serde(rename = "focus")] Focus,
    #[serde(rename = "keyboardFocus")] KeyboardFocus,
}
/// shell-owned commands with no core state (share, copy link, open system settings…)
pub type ShellActionId = String;
/// dispatched to the player model (§13)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerAction {
    pub player: PlayerIntent,
}
/// run by the shell
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellAction {
    pub shell: ShellActionId,
}
/// The engine reads only id and opens. Every other field is content for the components (bound through '$item.<field>').
/// recursive: refers to PageSpec (defined below)
/// opens null = not navigable
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemData {
    pub id: ItemId,
    pub opens: Option<Box<PageSpec>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenIntent {
    pub item: Box<ItemData>,
    pub origin: Origin,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Intent {
    #[serde(rename = "open")] Open(OpenIntent),
    #[serde(rename = "openLayerPage")] OpenLayerPage(OpenLayerPageIntent),
    #[serde(rename = "back")] Back(BackIntent),
    #[serde(rename = "up")] Up(UpIntent),
    #[serde(rename = "switchDeck")] SwitchDeck(SwitchDeckIntent),
    #[serde(rename = "reselectDeck")] ReselectDeck(ReselectDeckIntent),
    #[serde(rename = "setParams")] SetParams(SetParamsIntent),
    #[serde(rename = "toggleParam")] ToggleParam(ToggleParamIntent),
    #[serde(rename = "resetParams")] ResetParams(ResetParamsIntent),
    #[serde(rename = "setExpanded")] SetExpanded(SetExpandedIntent),
    #[serde(rename = "toggleExpanded")] ToggleExpanded(ToggleExpandedIntent),
    #[serde(rename = "scroll")] Scroll(ScrollIntent),
    #[serde(rename = "openLayer")] OpenLayer(OpenLayerIntent),
    #[serde(rename = "closeLayer")] CloseLayer(CloseLayerIntent),
    #[serde(rename = "focus")] Focus(FocusIntent),
    #[serde(rename = "setDevice")] SetDevice(SetDeviceIntent),
    #[serde(rename = "setPrefs")] SetPrefs(SetPrefsIntent),
    #[serde(rename = "openOverlay")] OpenOverlay(OpenOverlayIntent),
    #[serde(rename = "retry")] Retry(RetryIntent),
    #[serde(rename = "closeOverlay")] CloseOverlay(CloseOverlayIntent),
    #[serde(rename = "session")] Session(SessionIntent),
    #[serde(rename = "navigateUrl")] NavigateUrl(NavigateUrlIntent),
    #[serde(rename = "restore")] Restore(RestoreIntent),
    #[serde(rename = "launched")] Launched(LaunchedIntent),
}
/// dispatched to the nav model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavAction {
    pub nav: Box<Intent>,
}
/// null = not implemented
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Action {
    NavAction(NavAction),
    PlayerAction(PlayerAction),
    ShellAction(ShellAction),
    Null,
}
/// ── Component references (config → design system)
/// A place in the UI names a registered component (§15), its props, its action (§20) and when it shows.
/// Values may depend on state, but only through paths, derived values and conditions — no expressions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentRef {
    pub component: ComponentId, // must be registered (§15)
    pub props: Option<HashMap<String, PropValue>>, // must be declared by the component, with matching types
    pub action: Option<Box<Action>>, // §20 — required key for interactive components (null = not built), unless bound (bind → role input)
    pub when: Option<Condition>, // shown only while true
    pub slots: Option<HashMap<String, Vec<ComponentRef>>>, // children, for props the component declares as 'slot'
    pub variant: Option<HashMap<String, String>>, // design variants the component declares (e.g. { size: 'md' }); unset axes use the declared default
    pub checked: Option<PropValue>, // toggles: true | false | 'mixed' (→ status checked / indeterminate, §20)
    pub bind: Option<ComponentRefBind>, // a control for a page param (role input)
}
/// `ComponentRef.bind`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ComponentRefBind {
    ParamName(ParamName),
    DraftBind(DraftBind),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repeat {
    pub repeat: RepeatRepeat,
    pub r#as: String, // '$<as>' / '$<as>.<field>' bind paths in the ref's props, checked, when and action
    pub r#ref: Box<ComponentRef>,
}
/// `Repeat.repeat`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RepeatRepeat {
    Source(Source<Vec<Value>>),
    OptionsOf(OptionsOf),
}
/// A slot is a component, or one per element of a list (predictions, one chip per option…)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Slot {
    ComponentRef(ComponentRef),
    Repeat(Repeat),
}
/// ── Bar: every header (back, front, app bar, peek) — start items, a title, end items
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bar {
    pub start: Vec<Slot>,
    pub title: Option<Box<ComponentRef>>,
    pub end: Vec<Slot>,
    pub visible: Option<BarVisible>, // whenScrolled: shown once the content scrolls (front headers)
}
/// `Bar.visible`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BarVisible {
    #[serde(rename = "always")] Always,
    #[serde(rename = "whenScrolled")] WhenScrolled,
}
/// hideOnScroll: slides away while the front layer scrolls down (back.headerHidden); everything below moves up into its space
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarRegion {
    pub height: f64,
    pub bar: Box<Bar>,
    pub hide_on_scroll: Option<bool>,
}
/// 'content': as tall as its content (measured by the shell)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotsRegion {
    pub height: SlotsRegionHeight,
    pub content: Vec<Slot>,
}
/// the literal members of `SlotsRegionHeight`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SlotsRegionHeightLiteral {
    #[serde(rename = "content")] Content,
}
/// `SlotsRegion.height`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SlotsRegionHeight {
    Literal(SlotsRegionHeightLiteral),
    Number(f64),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Region {
    #[serde(rename = "bar")] Bar(BarRegion),
    #[serde(rename = "slots")] Slots(SlotsRegion),
}
/// ── Regions: a surface made of named regions, drawn in one of several layouts (ordered region ids)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionSet<L> {
    #[serde(flatten)] pub string = string>: string = string>,
    pub regions: HashMap<String, Region>,
    pub layouts: HashMap<L, Vec<String>>,
}
/// ── Back layer: the strict RegionSet of backdrop pages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackLayerConfig {
    #[serde(flatten)] pub region_set: RegionSet,
    pub toggle_on_tap: Option<bool>, // default true: tapping the back layer outside any interactive element (disabled ones included) toggles it (expand ⇄ conceal)
}
// Rules: region 'header' is a bar whose end ends in a disclosure control (a caret that follows back.expanded);
// region 'basicAction' holds slots with exactly one bound control; layouts.concealed starts with 'header'; layouts list declared regions only.
///   interactive:  supplies {}                                       emits { activate: null }  → its action; state via §20
///   input:        supplies { value: value; options: options }       emits { change: value; submit: value }   → setParams on its bind (submit: bind.submit and bind.change)
///                 registry 'accepts' lists the ParamTypes it can hold (a tab bar: choice; chips: choices; a search field: text)
///   item:         supplies { navigable: boolean }                   emits { open: null } → open (only items that open something); otherwise the ref's action
///   navigation:   supplies { destinations: string[]; selected: string }   emits { select: string } → switchDeck, or reselectDeck for the active deck
///   disclosure:   supplies { expanded: boolean }                    emits { toggle: null }    → toggleExpanded
/// the component must implement R (checked by rules)
pub type SlotRef = Box<ComponentRef>; // the component must implement the role (checked by rules)
/// How the items are drawn is presentation, not engine: a layout component arranges them, an item component draws each.
/// its action runs for items that don't open anything (e.g. play the track)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presentation {
    pub layout: Box<ComponentRef>, // a design component that arranges items (list, responsive grid, scroller…)
    pub item: SlotRef, // drawn once per item, with '$item' in scope: props bind item fields ({ bind: '$item.title' });
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentConfig {
    pub data_source: SourceRef,
    pub states: Option<ContentStateComponentsPatch>,
    pub view: Option<ParamName>, // a choice param of the page that picks the presentation; omitted: the single 'default' one
    pub presentations: HashMap<String, Presentation>, // keyed by the view param's option values ('default' without a view)
}
/// ── Front layer
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontLayerConfig {
    pub header: Box<Bar>,
    pub collapse: FrontLayerConfigCollapse,
    pub content: Box<ContentConfig>,
}
/// `FrontLayerConfig.collapse`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FrontLayerConfigCollapse {
    #[serde(rename = "partial")] Partial,
    #[serde(rename = "full")] Full,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackdropPageConfig {
    pub id: PageId,
    pub title: Title,
    pub params: Params,
    pub back: Box<BackLayerConfig>,
    pub front: Box<FrontLayerConfig>,
    pub policy: BackdropPagePolicy,
}
/// (BackdropPageConfig without id, title, plus PageIdentity)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackdropPageSpec {
    pub params: Params,
    pub back: Box<BackLayerConfig>,
    pub front: Box<FrontLayerConfig>,
    pub policy: BackdropPagePolicy,
    pub id: Option<PageId>,
    pub title: Option<Title>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBarPageConfig {
    pub id: PageId,
    pub title: Title,
    pub header: Box<Bar>,
    pub params: Option<Params>, // e.g. tabs: a bound control in the header
    pub content: Box<ContentConfig>,
    pub policy: AppBarPagePolicy,
}
/// (AppBarPageConfig without id, title, plus PageIdentity)
/// child fully defined by the item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBarPageSpec {
    pub header: Box<Bar>,
    pub params: Option<Params>, // e.g. tabs: a bound control in the header
    pub content: Box<ContentConfig>,
    pub policy: AppBarPagePolicy,
    pub id: Option<PageId>,
    pub title: Option<Title>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum PageSpec {
    #[serde(rename = "appBar")] AppBar(AppBarPageSpec),
    #[serde(rename = "backdrop")] Backdrop(BackdropPageSpec),
    #[serde(rename = "layerPage")] LayerPage(LayerPageSpec),
}
/// which component shows the decks, per layout class
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationConfig {
    pub compact: SlotRef,
    pub wide: SlotRef,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shortcut {
    pub keys: String,
    pub intent: Intent,
    pub when: Option<ShortcutWhen>,
}
/// `Shortcut.when`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ShortcutWhen {
    #[serde(rename = "pointer")] Pointer,
    #[serde(rename = "always")] Always,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peek {
    pub height: f64,
    pub header: Bar,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BottomSheetForm {
    pub form: String, // always "bottomSheet"
    pub peek: Peek,
    pub hides_nav_when_open: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatingCardPeek {
    #[serde(flatten)] pub peek: Peek,
    pub form: String, // always "floatingCard"
    pub max_width: f64,
    pub persists_when_open: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SideSheetForm {
    pub form: String, // always "sideSheet"
    pub width: f64,
    pub peek: FloatingCardPeek,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetPresentation {
    pub compact: BottomSheetForm,
    pub wide: SideSheetForm,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum LayerPresentation {
    #[serde(rename = "sheet")] Sheet(SheetPresentation),
    #[serde(rename = "fullscreen")] Fullscreen(FullscreenPresentation),
}
/// ── Pages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum PageConfig {
    #[serde(rename = "backdrop")] Backdrop(BackdropPageConfig),
    #[serde(rename = "appBar")] AppBar(AppBarPageConfig),
}
/// fixed set of pages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerPages {
    pub base: PageId,
    pub set: HashMap<PageId, PageConfig>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRef {
    pub component: ComponentId,
    pub props: HashMap<String, Value>,
    pub action: Option<Action>,
    pub visible: bool,
    pub slots: HashMap<String, Vec<ResolvedRef>>,
    pub key: Option<SlotPath>,
    pub variant: HashMap<String, String>,
    pub checked: Option<ResolvedRefChecked>,
    pub bind: Option<ComponentRefBind>,
}
/// the literal members of `ResolvedRefChecked`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ResolvedRefCheckedLiteral {
    #[serde(rename = "mixed")] Mixed,
}
/// `ResolvedRef.checked`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResolvedRefChecked {
    Literal(ResolvedRefCheckedLiteral),
    Bool(bool),
}
/// one per component of a Slot list (repeats expanded)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpandedSlot {
    pub r#ref: ComponentRef,
    pub scope: Option<RefScope>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentData {
    pub status: Status,
    pub items: Vec<ItemData>,
    pub total: Option<f64>,
    pub stale: Option<bool>,
    pub error: Option<DataError>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackdropPageState {
    pub config: BackdropPageConfig,
    pub params: HashMap<ParamName, Scoped<ParamValue>>,
    pub back: BackState,
    pub front: FrontState,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBarPageState {
    pub config: AppBarPageConfig,
    pub params: HashMap<ParamName, Scoped<ParamValue>>,
    pub scroll: Scoped<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PageState {
    BackdropPageState(BackdropPageState),
    AppBarPageState(AppBarPageState),
}
/// origin default: active deck; bind: input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotContext {
    pub role: RoleId,
    pub page: PageState,
    pub item: Option<ItemData>,
    pub origin: Option<Origin>,
    pub bind: Option<ComponentRefBind>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackEntry {
    pub page: PageState,
    pub opened_from: Option<ItemId>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckPolicy {
    pub stack: FieldPolicy<Vec<StackEntry>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckConfig {
    pub id: DeckId,
    pub name: String,
    pub icon: String,
    pub page: BackdropPageConfig, // base page
    pub link_target: Option<LinkTarget>, // default 'activeDeck' (= its own stack)
    pub policy: DeckPolicy,
}
/// open: only deckSwitch / baseSwitch apply — the layer closes on them
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerPolicy {
    pub stack: FieldPolicy<Vec<StackEntry>>,
    pub open: FieldPolicy<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerConfig {
    pub id: LayerId,
    pub name: String,
    pub pages: LayerPages,
    pub link_target: Option<LinkTarget>, // where links to deck content go (Nonono: { deck: 'browse' })
    pub presentation: LayerPresentation,
    pub history: LayerConfigHistory,
    pub policy: LayerPolicy,
}
/// `LayerConfig.history`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LayerConfigHistory {
    HistoryMode(HistoryMode),
    HistoryByLayout(HistoryByLayout),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckState {
    pub stack: Vec<StackEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerState {
    pub open: bool,
    pub stack: Vec<StackEntry>,
}

// ─────────────────────────────────────────────────────────────
// 4. STATE (runtime, user-driven)
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub launch: AppStateLaunch, // 'ready' from the start when AppConfig.launch is not set
    pub device: Device,
    pub prefs: Prefs, // accessibility + personal
    pub session: SessionState, // §10
    pub overlays: Vec<OverlayEntry>, // §9 — topmost last
    pub focus_returns: Vec<FocusReturn>, // §18 — where focus goes back to when a surface closes
    pub active_deck: DeckId,
    pub focus: String,
    pub decks: HashMap<DeckId, DeckState>,
    pub layers: HashMap<LayerId, LayerState>,
    pub history: Vec<NavRecord>, // wide/pointer only; compact/touch derives it
}
/// `AppState.launch`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AppStateLaunch {
    #[serde(rename = "starting")] Starting,
    #[serde(rename = "ready")] Ready,
}

// ─────────────────────────────────────────────────────────────
// 6. EVENTS (emitted by the model; motion/data react)
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushedEvent {
    pub target: Origin,
    pub opened_from: Option<ItemId>,
    pub kind: PageKind,
}
/// depth = pages removed (default 1; reselectDeck pops many). openedFrom = item on the revealed page
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoppedEvent {
    pub target: Origin,
    pub opened_from: Option<ItemId>,
    pub kind: PageKind,
    pub depth: Option<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ModelEvent {
    #[serde(rename = "pushed")] Pushed(PushedEvent),
    #[serde(rename = "popped")] Popped(PoppedEvent),
    #[serde(rename = "deckSwitched")] DeckSwitched(DeckSwitchedEvent),
    #[serde(rename = "expandedChanged")] ExpandedChanged(ExpandedChangedEvent),
    #[serde(rename = "headerVisibilityChanged")] HeaderVisibilityChanged(HeaderVisibilityChangedEvent),
    #[serde(rename = "paramChanged")] ParamChanged(ParamChangedEvent),
    #[serde(rename = "layerOpened")] LayerOpened(LayerEvent),
    #[serde(rename = "layerClosed")] LayerClosed(LayerEvent),
    #[serde(rename = "overlayOpened")] OverlayOpened(OverlayEvent),
    #[serde(rename = "overlayClosed")] OverlayClosed(OverlayEvent),
    #[serde(rename = "sessionChanged")] SessionChanged(SessionChangedEvent),
    #[serde(rename = "urlChanged")] UrlChanged(UrlChangedEvent),
    #[serde(rename = "retryRequested")] RetryRequested(RetryRequestedEvent),
    #[serde(rename = "focusRestore")] FocusRestore(FocusRestoreEvent),
    #[serde(rename = "launched")] Launched(LaunchedEvent),
    #[serde(rename = "exit")] Exit(ExitEvent),
}
/// view param value, or 'default'
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentPresentation {
    #[serde(flatten)] pub presentation: Presentation,
    pub key: String,
}
pub trait DataSource {
    fn get(&self, data_source: &str, params: Option<&HashMap<String, Value>>) -> ContentData;
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gate {
    pub id: GateId,
    pub when: SessionPredicate,
    pub page: PageConfig,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    pub initial: Option<SessionStatePatch>, // state at startup (before any persisted session is applied)
    pub gates: Vec<Gate>, // first matching gate wins
}

// ─────────────────────────────────────────────────────────────
// 1. CONFIG (fixed per app version)
// ─────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub contract_version: SemVer, // major must match the implementation
    pub decks: Vec<DeckConfig>, // nav bar / rail destinations
    pub layers: Vec<LayerConfig>, // parallel layers (beside/over decks)
    pub start_deck: DeckId,
    pub breakpoints: Breakpoints,
    pub routes: Option<RouteTable>, // §11
    pub persist: Option<PersistPolicy>, // §12
    pub session: Option<SessionConfig>, // §10
    pub shortcuts: Option<Vec<Shortcut>>, // desktop keyboard → intents
    pub launch: Option<LaunchConfig>,
    pub locales: LocaleConfig,
    pub texts: HashMap<LocaleId, HashMap<TextId, String>>, // app texts (app/texts) + design texts (design/texts), merged by the loader; ICU MessageFormat
    pub content_states: Option<ContentStateComponents>, // §17 defaults; pages may override
    pub wire: Option<Wire>, // §16
    pub navigation: NavigationConfig,
}
pub trait Queries {
    fn layout_class(&self, state: &AppState, config: &AppConfig) -> LayoutClass;
    fn side_mode(&self, state: &AppState, config: &AppConfig, layer: &str) -> Option<SideMode>; // null on compact
    fn current_page(&self, state: &AppState) -> PageState; // top of the focused stack
    fn content_params(&self, page: &PageState) -> HashMap<String, Value>; // the page's params with data ≠ false (e.g. { tab: 'music', genre: ['Jazz'] })
    fn param_options(&self, state: &AppState, config: &AppConfig, page: &PageState, name: &str) -> Vec<ParamOption>; // labels resolved to text
    fn param_target(&self, state: &AppState, intent: &Intent) -> Option<PageState>; // the page a setParams / toggleParam / resetParams applies to
    fn history_mode(&self, state: &AppState, config: &AppConfig, layer: &LayerConfig) -> HistoryMode;
    fn under_page(&self, state: &AppState) -> BackdropPageState; // top backdrop page of active deck
    fn is_base(&self, state: &AppState) -> bool; // active deck at stack[0]
    fn front_position(&self, state: &AppState) -> FrontPosition;
    fn visible_items(&self, page: &PageState, data: &ContentData) -> Vec<ItemData>; // the items to draw (the data source applies the params)
    fn presentation(&self, page: &PageState) -> CurrentPresentation;
    fn nav_visible(&self, state: &AppState, config: &AppConfig) -> bool;
    fn back_action(&self, state: &AppState, config: &AppConfig) -> BackAction;
    fn history_entries(&self, state: &AppState, config: &AppConfig) -> Vec<NavRecord>; // touch: derived; pointer: state.history
    fn url(&self, state: &AppState, config: &AppConfig) -> String; // §11
    fn gate(&self, state: &AppState, config: &AppConfig) -> Option<GateId>; // §10 — non-null hides decks behind a gate
    fn snapshot(&self, state: &AppState, config: &AppConfig) -> Snapshot; // §12
    fn intent_for_shortcut(&self, state: &AppState, config: &AppConfig, keys: &str) -> Option<Intent>;
    fn content_view(&self, page: &PageState, data: &ContentData, config: &AppConfig, offline: bool) -> ContentView; // §17
    fn focus_order(&self, state: &AppState, config: &AppConfig) -> Vec<Surface>; // §18 — reachable surfaces, in tab order
    fn supports(&self, state: &AppState, config: &AppConfig, intent: &Intent) -> bool; // §20 — type in INTENT_TYPES and its references (deck, layer, page, item.opens) exist
    fn derived(&self, state: &AppState, config: &AppConfig, id: &str, page: Option<&PageState>, of: Option<&str>) -> Value; // undefined for unknown ids
    fn condition(&self, state: &AppState, config: &AppConfig, cond: &Condition, page: Option<&PageState>, scope: Option<&RefScope>) -> bool;
    fn resolve_ref(&self, state: &AppState, config: &AppConfig, r#ref: &ComponentRef, page: Option<&PageState>, path: Option<&str>, scope: Option<&RefScope>) -> ResolvedRef; // page = the page the slot belongs to (null for peeks); scope: { item } for presentation items
    fn expand_slots(&self, state: &AppState, config: &AppConfig, slots: &Vec<Slot>, page: Option<&PageState>) -> Vec<ExpandedSlot>;
    fn slot_path(&self, surface: &str, page_id: Option<&PageId>, slot: &str, index: Option<f64>, item_id: Option<&str>) -> SlotPath;
    fn text(&self, state: &AppState, config: &AppConfig, r#ref: &QueriesRef) -> String; // current locale, falling back to the default locale, then the id
    fn dir(&self, state: &AppState, config: &AppConfig) -> Direction;
    fn role_props(&self, state: &AppState, config: &AppConfig, slot: &SlotContext) -> HashMap<String, Value>; // the role's supplied values
    fn role_intent(&self, state: &AppState, config: &AppConfig, slot: &SlotContext, event: &str, payload: Option<&Value>) -> Option<Intent>; // null: no intent (unknown event, an item that opens nothing)
}
/// `Queries.ref`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum QueriesRef {
    TextRef(TextRef),
    TextId(TextId),
}

// ─────────────────────────────────────────────────────────────
// 8. MODEL (what an implementation exposes)
// ─────────────────────────────────────────────────────────────
pub trait Model {
    fn config(&self) -> &AppConfig;
    fn data(&self) -> &dyn DataSource;
    fn query(&self) -> &dyn Queries;
    fn get_state(&self) -> AppState;
    fn dispatch(&self, intent: &Intent) -> Vec<ModelEvent>;
}
pub type CreateModel = fn(AppConfig, Device, Box<dyn DataSource>) -> Box<dyn Model>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackPattern {
    pub kind: Option<StackPatternKind>,
}
/// the literal members of `StackPatternKind`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum StackPatternKindLiteral {
    #[serde(rename = "layerPage")] LayerPage,
}
/// `StackPattern.kind`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StackPatternKind {
    Literal(StackPatternKindLiteral),
    PageConfig['kind'](PageKind),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event")]
pub enum ChoreoPattern {
    #[serde(rename = "pushed")] Pushed(StackPattern),
    #[serde(rename = "popped")] Popped(StackPattern),
    #[serde(rename = "deckSwitched")] DeckSwitched(SurfacePattern),
    #[serde(rename = "expandedChanged")] ExpandedChanged(SurfacePattern),
    #[serde(rename = "layerOpened")] LayerOpened(SurfacePattern),
    #[serde(rename = "layerClosed")] LayerClosed(SurfacePattern),
    #[serde(rename = "overlayOpened")] OverlayOpened(SurfacePattern),
    #[serde(rename = "overlayClosed")] OverlayClosed(SurfacePattern),
    #[serde(rename = "paramChanged")] ParamChanged(ParamPattern),
    #[serde(rename = "sessionChanged")] SessionChanged(SessionPattern),
    #[serde(rename = "headerVisibilityChanged")] HeaderVisibilityChanged(PlainPattern),
    #[serde(rename = "launched")] Launched(PlainPattern),
    #[serde(rename = "urlChanged")] UrlChanged(PlainPattern),
    #[serde(rename = "retryRequested")] RetryRequested(PlainPattern),
    #[serde(rename = "focusRestore")] FocusRestore(PlainPattern),
    #[serde(rename = "exit")] Exit(PlainPattern),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoreoRule {
    pub on: ChoreoPattern,
    pub transition: TransitionTemplate,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Choreography {
    pub rules: Vec<ChoreoRule>, // event pattern → transition template (durations/easings by token)
    pub reduced_motion: TransitionTemplate, // replaces every rule when prefs.reducedMotion
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSpec {
    pub regions: Option<HashMap<String, ComponentId>>,
    pub header: Option<Bar>,
}
pub trait DataLayer: DataSource {
    fn offline(&self) -> bool;
    fn status(&self, r#ref: &str, params: Option<&HashMap<String, Value>>) -> Status;
    fn refresh(&self, r#ref: &str, params: Option<&HashMap<String, Value>>) -> void;
}
/// Status: what a control currently represents, alongside its interaction state (any combination).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum StatusState {
    #[serde(rename = "selected")] Selected,
    #[serde(rename = "checked")] Checked,
    #[serde(rename = "indeterminate")] Indeterminate,
    #[serde(rename = "busy")] Busy,
    #[serde(rename = "error")] Error,
    #[serde(rename = "dragged")] Dragged,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualContext {
    pub surface: Option<ComponentId>, // the surface the component sits on: resolves { role } values
    pub variant: Option<HashMap<String, String>>, // the placement's variants (ComponentRef.variant): resolves { variant } values
    pub env: Option<LayoutEnv>, // resolves { if } values (env conditions)
    pub page: Option<PageState>, // resolves { if } values (path conditions)
    pub status: Option<Vec<StatusState>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentDef {
    pub extends: Option<ComponentId>, // inherits roles and statuses (union), props, variants, states, visuals; own values win (resolved when the design is loaded)
    pub variant: Option<bool>, // drawn by its parent's implementation — no code of its own on any platform
    pub states: Option<Vec<String>>,
    pub props: Option<HashMap<String, PropType>>,
    pub variants: Option<HashMap<String, VariantAxis>>,
    pub statuses: Option<Vec<StatusState>>, // statuses its visuals may key on (§20)
    pub motion: Option<HashMap<String, MotionTemplate>>, // key = a name: a visual it animates (trigger change) or any named motion (e.g. 'press', 'levels', 'placeholder'); the template's trigger says when it runs. Inherited and merged like visuals
    pub placeholder: Option<PlaceholderForm>, // skeleton form while its data loads; required for components that show data
    pub provides: Option<HashMap<String, VisualValue>>, // surfaces: colour roles for the components placed on them (e.g. content, focusRing)
    pub visuals: Option<Visuals>,
    pub implements: Option<Vec<RoleId>>, // roles it fulfils; must declare each role's supplied props. 'interactive' → all six InteractionStates (§20)
    pub accepts: Option<Vec<ParamType>>, // input: the param types it can hold
}
pub type ComponentRegistry = HashMap<ComponentId, ComponentDef>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Specs {
    pub tokens: TokenSet, // resolved for the active theme + prefs.tokenOverrides
    pub components: ComponentRegistry,
    pub choreography: Choreography,
    pub motions: MotionRegistry, // the motion kinds this design system uses
    pub screens: Option<HashMap<PageId, ScreenSpec>>,
}
pub trait Layout {
    fn env(&self, state: &AppState, config: &AppConfig, q: &dyn Queries) -> LayoutEnv;
    fn geometry(&self, state: &AppState, config: &AppConfig, q: &dyn Queries, specs: &Specs) -> LayoutGeometry;
    fn regions(&self, page: &BackdropPageState, measured: Option<&HashMap<String, f64>>) -> Vec<RegionInstance>; // measured: heights of 'content' regions (by region id); missing = 0. Hidden back header → all tops shift up by its height
    fn resolve_visuals(&self, specs: &Specs, component: &str, state: &str, ctx: Option<&VisualContext>) -> HashMap<String, Value>; // visuals for a state: tokens, roles, variants and conditions resolved
    fn front_layer(&self, page: &BackdropPageState, g: &LayoutGeometry, specs: &Specs, ctx: Option<&FrontLayerContext>, peek: Option<f64>) -> FrontLayerView; // peek = extra top offset (px) when concealed; top never leaves less than the front header visible
    fn transition_for(&self, event: &ModelEvent, specs: &Specs, prefs: &Prefs, measure: Option<&Measurements>) -> TransitionDescriptor; // event motion (choreography); a declared 'direction' param takes event.direction
    fn motion_for(&self, specs: &Specs, component: &str, key: &str, prefs: &Prefs) -> TransitionDescriptor; // component motion: key = a visual (trigger change) or a named motion; reduced motion → the motion's declared reduced form
    fn peek_placement(&self, state: &AppState, config: &AppConfig, g: &LayoutGeometry, front_top: f64, page: Option<&BackdropPageState>) -> Option<Rect>; // page: to sit on a fully collapsed front layer
}
/// the control's own value (ComponentRef.checked)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionFacts {
    pub checked: Option<InteractionFactsChecked>,
}
/// the literal members of `InteractionFactsChecked`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum InteractionFactsCheckedLiteral {
    #[serde(rename = "mixed")] Mixed,
}
/// `InteractionFacts.checked`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum InteractionFactsChecked {
    Literal(InteractionFactsCheckedLiteral),
    Bool(bool),
}
/// raw platform input, reported by the shell
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionInput {
    pub hovered: bool, // pointer over (ignored on touch devices)
    pub pressed: bool, // pointer / touch / key down
    pub focused: bool,
    pub focus_visible: bool, // focus arrived by keyboard / d-pad (:focus-visible)
    pub dragging: Option<bool>, // being dragged (reordering)
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveComponent {
    pub id: SlotPath, // where it sits (§1 Placement identity); state is keyed by it
    pub component: ComponentId, // registry entry implementing 'interactive'
    pub action: Action,
    pub label: String, // accessible name (required — icon-only included)
}
/// for layering visuals; all false when disabled
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionFlags {
    pub hover: bool,
    pub pressed: bool,
    pub focus: bool,
    pub keyboard_focus: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionView {
    pub state: InteractionState, // resolved: disabled > pressed > keyboardFocus > focus > hover > enabled
    pub enabled: bool,
    pub flags: InteractionFlags,
    pub status: Vec<StatusState>, // derived from the action (selected, busy, error), the facts (checked, indeterminate) and the input (dragged)
    pub activatable: bool, // enabled and not busy — activating otherwise does nothing
}
// (holds trait objects: not serialized)
pub struct InteractionEnv {
    pub model: Box<dyn Model>, // device (touch) + nav availability
    pub player: Option<Box<dyn PlayerModel>>, // required for player actions
    pub shell_actions: Option<Vec<ShellActionId>>, // shell actions this shell implements
}
// Status rules: selected — the action targets what is already current (the active deck, setParams to the current values, toggleParam of an included option);
// busy — its effect is in progress (retry while the content loads, play while the track loads); error — its last attempt failed;
// checked / indeterminate — from facts.checked (true / 'mixed'); dragged — input.dragging on an enabled control.
// Busy blocks activation but is not disabled (no disabled visuals, still focusable). Visual lookup per visual:
// interaction-state column, else the first status column present, else default. A component keys visuals only on statuses it declares.
// Visuals: shells draw a state with Layout.resolveVisuals(specs, component, view.state, { surface, variant, env }) (§14).
// Rules: available iff nav → model.query.supports; player → player.supports; shell → listed in env.shellActions; null / anything else → false.
// Unavailable → disabled. Idempotent actions stay enabled. Disabled ignores hover/pressed/focus (all flags false),
// is not focusable, and activating it does nothing. Every interactive registry entry declares all six states.
// Shells: re-resolve on every state change — availability is live (e.g. player "next" is disabled with an empty queue).

// ─────────────────────────────────────────────────────────────
// Constants and free functions the TS file declares (`declare const` / `declare function`)
// ─────────────────────────────────────────────────────────────
pub trait Registry {
    /// 'deckName' | 'pageTitle' | 'contentSummary' (item count text) | 'count' (of: list length; other values 1 unless empty) | 'summary' (of a param: its option labels / its value)
    fn derived_ids() -> Vec<DerivedId>;
    fn roles() -> HashMap<RoleId, Role>;
    fn player_intent_types() -> Vec<String>;
    /// all six, in precedence order below
    fn interaction_states() -> Vec<InteractionState>;
    /// every Intent type; implementations export it and supports() checks against it
    fn intent_types() -> Vec<String>;
    fn status_states() -> Vec<StatusState>;
}
pub trait InteractionFns {
    fn action_available(action: &Action, env: &InteractionEnv) -> bool;
    fn resolve_interaction(action: &Action, input: &InteractionInput, env: &InteractionEnv, facts: Option<&InteractionFacts>) -> InteractionView;
    fn status_of(action: &Action, env: &InteractionEnv, facts: Option<&InteractionFacts>) -> Vec<StatusState>;
}

/// `PageConfig['kind']`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PageKind {
    #[serde(rename = "backdrop")] Backdrop,
    #[serde(rename = "appBar")] AppBar,
}

/// `Partial<Prefs>`: every field optional
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPatch {
    pub reduced_motion: Option<bool>,
    pub theme: Option<String>,
    pub token_overrides: Option<HashMap<String, PrefsTokenOverrides>>,
    pub text_scale: Option<f64>,
    pub locale: Option<LocaleId>,
}

/// `Partial<ContentStateComponents>`: every field optional
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentStateComponentsPatch {
    pub empty: Option<ComponentId>,
    pub error: Option<ComponentId>,
    pub stale_banner: Option<ComponentId>,
}

/// `Partial<SessionState>`: every field optional
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatePatch {
    pub signed_in: Option<bool>,
    pub onboarded: Option<bool>,
    pub permissions: Option<HashMap<String, PermissionStatus>>,
}
