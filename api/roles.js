// Backdrop Nav — ROLES (single source, 16.0)
// Every role's contract as data: what the engine supplies (from state), what the component emits (→ intents), its minimum
// slots (ref roles) or parts (page / surface roles: the config object's own fields). `ts` names the TypeScript types.
// Used by: core (ROLES re-exported from core/navigation.js), the rules (api/invariants.js), design/build.js (.d.ts).
// api.d.ts §M2 is generated from this file by api/gen-roles.js — edit here, then regenerate.

export const ROLES = {
  interactive: { supplies: {}, emits: { activate: null }, ts: { emits: { activate: 'Actions' } }, note: 'its action(s); state via §O' },
  input: { supplies: { value: 'value', options: 'options' }, emits: { change: 'value', submit: 'value' },
    ts: { supplies: { value: 'ParamValue | null', options: 'ParamOption[]' }, emits: { change: 'SetParamsIntent | Seek', submit: 'SetParamsIntent' } }, note: 'setParams on its bind (PlayerBind: seek)' },
  item: { supplies: { navigable: 'boolean' }, emits: { open: null }, ts: { emits: { open: 'OpenIntent' } }, note: 'open (inside a repeat: the element is the item)' },
  navigation: { supplies: { destinations: 'string[]', selected: 'string' }, emits: { select: 'string' },
    ts: { supplies: { destinations: 'DeckId[]', selected: 'DeckId' }, emits: { select: 'SwitchDeckIntent | ReselectDeckIntent' } } },
  disclosure: { supplies: { expanded: 'boolean' }, emits: { toggle: null }, ts: { emits: { toggle: 'ToggleExpandedIntent' } } },
  bar: { supplies: { progress: 'number' }, emits: {}, slots: { start: {}, title: { max: 1 }, end: {}, expanded: { max: 1 } }, note: 'back-layer header regions; progress from Layout.barView' },
  frontHeader: { supplies: {}, emits: {}, slots: { start: { first: 'disclosure' }, title: { max: 1 }, end: {}, fab: { max: 1, roles: ['fab'] } } },
  appBar: { supplies: { progress: 'number' }, emits: {}, slots: { start: {}, title: { max: 1 }, end: {}, expanded: { max: 1 }, fab: { max: 1, roles: ['fab'] }, bottom: {} }, note: 'bottom: a row at the bar\'s bottom edge, stays when it collapses' },
  peek: { supplies: {}, emits: {}, slots: { start: {}, title: { max: 1 }, end: {} } },
  fab: { supplies: {}, emits: { activate: null }, ts: { emits: { activate: 'Actions' } } },
  layout: { supplies: { groups: 'list' }, emits: {}, ts: { supplies: { groups: 'ItemGroup[]' } }, note: 'arranges content items (list, grid, scroller); groups from Queries.groups' },
  emptyState: { supplies: {}, emits: { retry: null }, ts: { emits: { retry: 'RetryIntent' } } },
  errorState: { supplies: {}, emits: { retry: null }, ts: { emits: { retry: 'RetryIntent' } } },
  staleBanner: { supplies: {}, emits: { retry: null }, ts: { emits: { retry: 'RetryIntent' } } },
  splash: { supplies: {}, emits: {} },
  overlay: { supplies: {}, emits: { close: 'value' }, ts: { emits: { close: 'CloseOverlayIntent' } } },
  // page / surface roles: design registers exactly one component per role; positions, heights and offsets come from Layout
  backdropPage: { supplies: {}, emits: {}, parts: { back: { field: 'back' }, front: { field: 'front', role: 'frontLayer' } } },
  backLayer: { supplies: { expanded: 'boolean', headerHidden: 'boolean' }, emits: { toggle: null }, parts: { header: { field: 'regions.header.bar', role: 'bar' } },
    ts: { emits: { toggle: 'ToggleExpandedIntent' } }, note: 'toggle only while BackLayerConfig.toggleOnTap' },
  frontLayer: { supplies: { position: 'string' }, emits: { scroll: 'number', retry: null }, parts: { header: { field: 'header', role: 'frontHeader' }, content: { field: 'content' } },
    ts: { supplies: { position: 'FrontPosition' }, emits: { scroll: 'ScrollIntent', retry: 'RetryIntent' } } },
  appBarPage: { supplies: {}, emits: { scroll: 'number', retry: null }, parts: { header: { field: 'header', role: 'appBar' }, content: { field: 'content', optional: true }, body: { field: 'body', optional: true }, sheet: { field: 'sheet', role: 'pageSheet', optional: true } },
    ts: { emits: { scroll: 'ScrollIntent', retry: 'RetryIntent' } } },
  pageSheet: { supplies: { expanded: 'boolean' }, emits: { toggle: null }, parts: { header: { field: 'header', role: 'bar' }, content: { field: 'content' } }, ts: { emits: { toggle: 'ToggleExpandedIntent' } } },
  sheetLayer: { supplies: { open: 'boolean', form: 'string', side: 'string' }, emits: { open: null, close: null },
    parts: { peekCompact: { field: 'presentation.compact.peek.header', role: 'peek' }, peekWide: { field: 'presentation.wide.peek.header', role: 'peek' } },
    ts: { supplies: { form: 'SheetForm', side: 'SideMode | null' }, emits: { open: 'OpenLayerIntent', close: 'CloseLayerIntent' } }, note: 'open: the peek was tapped' },
  drawerLayer: { supplies: { open: 'boolean', form: 'string' }, emits: { close: null }, ts: { supplies: { form: 'DrawerWideForm' }, emits: { close: 'CloseLayerIntent' } }, note: 'close: the scrim was tapped' },
  fullscreenLayer: { supplies: { open: 'boolean' }, emits: {} }
};
