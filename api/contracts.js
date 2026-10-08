// Backdrop Nav — CONTRACTS (single source, draft for 18.0.0)
// What each drawn config object offers whatever draws it, as data: its config type, its values (current, computed by core from
// State, queries and Layout), the intents it may send ('action': the item's own config action) and its children (config fields
// holding other drawn objects). Only config types listed here are drawn; every other config type is engine-only.
// Used by: the rules (composition checks), core (values / children), api/gen-contracts.js (the TS block in api/draft.d.ts).

// a child: one contract, or a named union of contracts (UNIONS); list: an array; optional: may be absent
const one = (contract, optional = false) => ({ contract, ...(optional ? { optional } : {}) });
const list = (contract, optional = false) => ({ contract, list: true, ...(optional ? { optional } : {}) });

export const UNIONS = {
  headerItem: ['button', 'logo', 'text', 'switch', 'find'],
  bodyItem: ['button', 'text', 'detail', 'seek'],
  panelRow: ['paramRow', 'suggestions'],
  page: ['backdropPage', 'appBarPage'],
};

export const CONTRACTS = {
  // items
  button: { config: 'ButtonItem', values: { label: 'string', checked: 'boolean | null', state: 'string | null', interaction: 'InteractionView' }, intents: ['action'] },
  logo: { config: 'LogoItem', values: { label: 'string', playing: 'boolean' }, intents: [] },
  text: { config: 'TextItem', values: { text: 'string' }, intents: [] },
  switch: { config: 'SwitchItem', values: { label: 'string', value: 'ParamValue | null', next: 'ParamValue | null' }, intents: ['setParams'], note: 'steps its param to the next option' },
  find: { config: 'FindItem', values: { open: 'boolean', value: 'string', placeholder: 'string', closeLabel: 'string' }, intents: ['openFind', 'closeFind', 'setParams'], note: 'closeLabel: text find.close' },
  detail: { config: 'DetailConfig | DetailItem', values: { title: 'string', subtitle: 'string | null', image: 'string | null', meta: 'string | null' }, intents: [] },
  seek: { config: 'SeekItem', values: { label: 'string', positionMs: 'number', durationMs: 'number | null' }, intents: ['seek'] },
  // headers: the back layer's, an app-bar page's, the peek's (composition tells them apart by the contract they sit in)
  header: { config: 'HeaderConfig', values: { title: 'string | null', progress: 'number' }, intents: [], children: { items: list('headerItem'), detail: one('detail', true) }, note: 'progress: collapse 0 … 1 (Layout.barView)' },
  // controls and rows
  input: { config: 'BasicActionConfig | ParamRow', values: { value: 'ParamValue | null', options: 'ParamOption[]', placeholder: 'string | null' }, intents: ['setParams'], note: 'one control for one param' },
  paramRow: { config: 'ParamRow', values: { label: 'string | null' }, intents: [], children: { control: one('input') } },
  suggestion: { config: 'ItemData', values: { text: 'string' }, intents: ['setParams'], note: 'picking it fills the draft (SuggestionsRow.fills)' },
  suggestions: { config: 'SuggestionsRow', values: { label: 'string' }, intents: [], children: { items: list('suggestion') } },
  // content
  item: { config: 'PresentationConfig', values: { item: 'ItemData', navigable: 'boolean' }, intents: ['action'], children: { entries: list('item', true) }, note: "action: open it (ItemData.opens), else the presentation's itemAction · entries: a shelf's (absent on other items)" },
  contentState: { config: 'ContentConfig', values: { state: 'ContentViewState', retry: 'boolean' }, intents: ['retry'], note: 'empty · error · offlineStale (the banner) · its words are design texts of the free component' },
  content: { config: 'ContentConfig', values: { view: 'ContentView', presentation: 'PresentationKey', groups: 'ItemGroup[]', placeholders: 'number' }, intents: [], children: { items: list('item'), state: one('contentState', true), banner: one('contentState', true) } },
  // backdrop page
  backLayer: { config: 'BackLayerConfig', values: { expanded: 'boolean', headerHidden: 'boolean', regions: 'BackRegionView[]' }, intents: ['toggleExpanded'], children: { header: one('header'), actions: list('button'), basicAction: one('input', true), panel: list('panelRow') }, note: 'toggle only while toggleOnTap' },
  frontHeader: { config: 'FrontHeaderConfig', values: { title: 'string', expanded: 'boolean', disclosureLabel: 'string' }, intents: ['toggleExpanded'], children: { items: list('headerItem') }, note: 'the built-in disclosure: the back layer\'s expanded + its label (texts backLayer.reveal / backLayer.conceal)' },
  frontLayer: { config: 'FrontLayerConfig', values: { position: 'FrontPosition', top: 'number', contentOffset: 'number' }, intents: ['scroll'], children: { header: one('frontHeader'), content: one('content') }, note: 'top: Layout.frontLayer · contentOffset: Layout.contentOffset' },
  backdropPage: { config: 'BackdropPageConfig', values: {}, intents: [], children: { back: one('backLayer'), front: one('frontLayer') } },
  // app-bar page
  pageSheet: { config: 'PageSheetConfig', values: { expanded: 'boolean' }, intents: ['toggleExpanded'], children: { control: one('input', true), content: one('content') } },
  appBarPage: { config: 'AppBarPageConfig', values: { contentOffset: 'number' }, intents: ['scroll'], children: { header: one('header'), content: one('content', true), body: list('bodyItem'), sheet: one('pageSheet', true) } },
  // layers: each draws its open page; stacks and policy are engine-only
  sheetLayer: { config: 'LayerConfig', values: { open: 'boolean', form: 'SheetForm', side: 'SideMode | null', peek: 'Rect | null' }, intents: ['openLayer', 'closeLayer'], children: { peek: one('header'), page: one('page') }, note: 'open: the peek was tapped · peek: Layout.peekPlacement' },
  drawerLayer: { config: 'LayerConfig', values: { open: 'boolean', form: 'DrawerForm' }, intents: ['closeLayer'], children: { page: one('page') }, note: 'close: the scrim was tapped' },
  fullscreenLayer: { config: 'LayerConfig', values: { open: 'boolean' }, intents: [], children: { page: one('page') } },
  // app
  destination: { config: 'DeckConfig', values: { deck: 'DeckId', label: 'string', selected: 'boolean' }, intents: ['switchDeck', 'reselectDeck'] },
  navigation: { config: 'NavigationConfig', values: { expanded: 'boolean' }, intents: [], children: { destinations: list('destination'), items: list('button', true) }, note: 'expanded: a rail-form drawer is open · items: drawn where a form has room (the rail)' },
  splash: { config: 'LaunchConfig', values: { label: 'string' }, intents: [] },
  overlay: { config: 'OverlaySpec', values: { texts: 'OverlayValueText[]' }, intents: ['closeOverlay'], children: { items: list('button', true) }, note: 'items: a menu\'s' },
};

// intent types → their TS names ('action' is the item's own Actions)
export const INTENT_TS = {
  action: 'Actions', setParams: 'SetParamsIntent', toggleExpanded: 'ToggleExpandedIntent', scroll: 'ScrollIntent',
  retry: 'RetryIntent', openLayer: 'OpenLayerIntent', closeLayer: 'CloseLayerIntent', closeOverlay: 'CloseOverlayIntent',
  switchDeck: 'SwitchDeckIntent', reselectDeck: 'ReselectDeckIntent', seek: 'Seek', openFind: 'OpenFindIntent', closeFind: 'CloseFindIntent',
};
