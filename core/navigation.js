// Backdrop Nav — MODEL (implementation of api/api.d.ts)
// Pure: no DOM, no animation state. createModel(config, device, data) → Model
// `data` = { get(dataSource, params) → ContentData } (only needed by queries that resolve items)

export const CONTRACT_VERSION = '18.0.0';
// ICU MessageFormat subset: {name}, {name, plural, =0 {…} one {…} other {…}} with #, {name, select, a {…} other {…}}
export function formatMessage(msg, args = {}, locale = 'en') {
  let out = '', i = 0;
  while (i < msg.length) {
    if (msg[i] !== '{') { out += msg[i++]; continue; }
    let d = 0, j = i; for (; j < msg.length; j++) { if (msg[j] === '{') d++; else if (msg[j] === '}' && --d === 0) break; }
    if (j >= msg.length) throw new Error('unbalanced message: ' + msg);
    const body = msg.slice(i + 1, j); i = j + 1;
    const m = body.match(/^\s*(\w+)\s*(?:,\s*(plural|select)\s*,([\s\S]*))?$/);
    if (!m) throw new Error('bad placeholder {' + body + '}');
    const v = args[m[1]];
    if (!m[2]) { out += v == null ? '' : String(v); continue; }
    const cases = {}, rest = m[3]; let k = 0;
    while (k < rest.length) {
      const mm = rest.slice(k).match(/^\s*(=?[\w-]+)\s*\{/); if (!mm) { if (rest.slice(k).trim()) throw new Error('bad case in ' + body); break; }
      let dd = 0, st = k + mm[0].length - 1, e = st; for (; e < rest.length; e++) { if (rest[e] === '{') dd++; else if (rest[e] === '}' && --dd === 0) break; }
      cases[mm[1]] = rest.slice(st + 1, e); k = e + 1;
    }
    if (!('other' in cases)) throw new Error('no other case in ' + body);
    const pick = m[2] === 'plural' ? (cases['=' + v] ?? cases[new Intl.PluralRules(locale).select(+v)] ?? cases.other) : (cases[v] ?? cases.other);
    out += formatMessage(m[2] === 'plural' ? pick.replace(/#/g, new Intl.NumberFormat(locale).format(+v)) : pick, args, locale);
  }
  return out;
}
export const DERIVED_IDS = ['deckName', 'pageTitle', 'contentSummary', 'total', 'count', 'summary', 'scrolled'];
export const PARAM_TYPES = ['choice', 'choices', 'text', 'flag', 'number', 'date'];
export const INTENT_TYPES = ['open', 'openLayerPage', 'back', 'up', 'switchDeck', 'reselectDeck', 'setParams', 'toggleParam', 'resetParams', 'setExpanded', 'toggleExpanded', 'scroll', 'openLayer', 'closeLayer', 'focus', 'setDevice', 'retry', 'setPrefs', 'openOverlay', 'closeOverlay', 'session', 'navigateUrl', 'restore', 'launched', 'openFind', 'closeFind'];
const major = v => parseInt(String(v || '0').split('.')[0], 10);
export function compatible(v) { return major(v) === major(CONTRACT_VERSION); }

const BASE_SWITCH_CHILDREN = ['deckSwitch', 'layerOpen', 'layerClose'];
// lifecycle events: strings, or { paramChange: name }; 'paramChange' matches any param change
const evMatches = (entry, ev) => {
  if (typeof entry === 'string') return typeof ev === 'string' ? entry === ev || (entry === 'baseSwitch' && BASE_SWITCH_CHILDREN.includes(ev)) : !!ev && ev[entry] !== undefined;   // 'paramChange' / 'paramReselect': any param
  if (!entry || typeof ev !== 'object' || !ev) return false;
  const k = Object.keys(entry)[0]; return ev[k] !== undefined && ev[k] === entry[k];
};
const matches = (list, ev) => (list || []).some(e => evMatches(e, ev));
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
const readPath = (o, path) => path.split('.').reduce((x, k) => x == null ? x : x[k], o);

// ── page state from policy ─────────────────────────────────
export function newPageState(cfg) {
  // a field policy → its initial value; a group of policies (front.find) → a group of values
  const P = cfg.policy, init = p => 'resetOn' in p ? (p.scope ? {} : clone(p.default)) : Object.fromEntries(Object.entries(p).map(([k, x]) => [k, init(x)])), params = {};
  for (const k in P.params || {}) params[k] = init(P.params[k]);
  if (cfg.kind === 'appBar') return { config: cfg, params, scroll: init(P.scroll), ...(cfg.sheet && P.sheet ? { sheet: { expanded: !!P.sheet.expanded.default } } : {}), ...(P.find ? { find: init(P.find) } : {}) };
  const st = { config: cfg, params, back: {}, front: {} };
  for (const L of ['back', 'front']) for (const f in P[L]) st[L][f] = init(P[L][f]);
  return st;
}
function policyOf(ps, path) {           // path: 'back.expanded' | 'scroll' …
  return readPath(ps.config.policy, path);
}
export function getField(ps, path) {
  const p = policyOf(ps, path), v = readPath(ps, path);
  if (!p.scope) return v;
  const k = readPath(ps, p.scope);
  return v && k in v ? v[k] : p.default;
}
function setIn(obj, path, val) {
  const [h, ...rest] = path.split('.');
  return { ...obj, [h]: rest.length ? setIn(obj[h], rest.join('.'), val) : val };
}
export function setField(ps, path, val) {
  const p = policyOf(ps, path);
  return setIn(ps, path, p.scope ? { ...readPath(ps, path), [readPath(ps, p.scope)]: val } : val);
}
// resets, then reactions (policy.on); skip: paths that just changed (a param never reacts to its own change)
function applyEvent(ps, ev, skip) {
  const P = ps.config.policy, fields = [];
  const walk = (node, prefix) => { for (const k in node) { const p = node[k], path = prefix ? prefix + '.' + k : k; if (p && 'resetOn' in p) fields.push([path, p]); else if (p && typeof p === 'object') walk(p, path); } };
  walk(P, '');
  for (const [path, p] of fields) if (!(skip && skip.has(path)) && matches(p.resetOn, ev)) ps = setIn(ps, path, p.scope ? {} : clone(p.default));
  for (const [path, p] of fields) if (!(skip && skip.has(path))) for (const o of p.on || []) if (evMatches(o.event, ev)) ps = setField(ps, path, o.set === 'toggle' ? !getField(ps, path) : clone(o.set === 'default' ? p.default : o.set));
  return ps;
}

// ── helpers on state ───────────────────────────────────────
const underIndex = stack => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].page.config.kind === 'backdrop') return i; return 0; };
const topOf = stack => stack[stack.length - 1];
const contentOf = cfg => cfg.kind === 'backdrop' ? cfg.front.content : cfg.content || null;
// group key of a value (§F GroupSpec)
export function groupKey(v, key) {
  if (v == null || v === '') return '#';
  if (key === 'decade') { const y = parseInt(v, 10); return Number.isFinite(y) ? Math.floor(y / 10) * 10 + 's' : '#'; }
  if (key === 'initial') { const c = String(v).trim().charAt(0).toLocaleUpperCase(); return /\p{L}/u.test(c) ? c : '#'; }
  return String(v);
}
// how a player queue relates to a list of tracks (or track ids)
function queueRelation(player, of) {
  const q = player ? player.getState().queue : [];
  if (!q.length) return 'empty';
  const ids = (Array.isArray(of) ? of : []).map(t => t && typeof t === 'object' ? t.id : t);
  return ids.length && ids.every(id => q.some(t => t.id === id)) ? 'contains' : 'absent';
}

export function createModel(config, device, data, player, sizes = {}) {   // sizes: { railWidth, sideSheetWidth } from Layout.sizes (design through composition)
  if (!compatible(config.contractVersion)) throw new Error('incompatible config contractVersion ' + config.contractVersion + ' (model ' + CONTRACT_VERSION + ')');
  const deckCfg = id => config.decks.find(d => d.id === id);
  const layerCfg = id => config.layers.find(l => l.id === id);
  const deckState = d => ({ stack: [{ page: newPageState(d.page), openedFrom: null }] });
  const layerState = L => ({ open: false, stack: [{ page: newPageState(L.pages.set[L.pages.base]), openedFrom: null }] });

  const DEFAULT_PREFS = { reducedMotion: false, theme: 'default', tokenOverrides: {}, textScale: 1, locale: (config.locales && config.locales.default) || 'en' };
  const DEFAULT_SESSION = { signedIn: true, onboarded: true, permissions: {} };
  let state = {
    launch: config.launch ? 'starting' : 'ready',
    device: { ...device },
    prefs: { ...DEFAULT_PREFS },
    session: { ...DEFAULT_SESSION, ...(config.session && config.session.initial || {}) },
    overlays: [],
    focusReturns: [],
    activeDeck: config.startDeck,
    focus: config.startDeck,
    decks: Object.fromEntries(config.decks.map(d => [d.id, deckState(d)])),
    layers: Object.fromEntries(config.layers.map(L => [L.id, layerState(L)])),
    history: []
  };

  // ── params ───────────────────────────────────────────────
  function paramValue(page, name) { return page && page.config.policy.params && page.config.policy.params[name] ? getField(page, 'params.' + name) : undefined; }
  const paramDefault = (page, name) => page.config.policy.params[name].default;
  function sourceList(src, page) {
    if (Array.isArray(src)) return src;
    if (src && src.dataSource && data) { const p = {}; for (const k in src.params || {}) p[k] = resolveValue(src.params[k], page); return (data.get(src.dataSource, p).items) || []; }
    return [];
  }
  function optionValues(page, name) { const S = page.config.params && page.config.params[name]; return S && S.options ? sourceList(S.options, page).map(o => o.value) : null; }
  // a pushFirst param off its default (back returns it to the default)
  function pushedParam(page) {
    const P = (page && page.config.params) || {};
    return Object.keys(P).find(k => P[k].history === 'pushFirst' && JSON.stringify(paramValue(page, k)) !== JSON.stringify(paramDefault(page, k))) || null;
  }
  // ── queries ──────────────────────────────────────────────
  const query = {
    supports(s, c, intent) {
      if (!intent || !INTENT_TYPES.includes(intent.type)) return false;
      const t = intent.target || {};
      if ((intent.deck || t.deck) && !deckCfg(intent.deck || t.deck)) return false;
      const lid = intent.layer || t.layer;
      if (lid && !layerCfg(lid)) return false;
      if (intent.type === 'openLayerPage' && !(lid && layerCfg(lid).pages.set[intent.page])) return false;
      if ((intent.type === 'openLayer' || intent.type === 'closeLayer') && !lid) return false;
      if ((intent.type === 'switchDeck' || intent.type === 'reselectDeck') && !intent.deck) return false;
      if (intent.type === 'open' && !(intent.item && intent.item.opens)) return false;
      return true;
    },
    layoutClass: (s, c) => s.device.width < c.breakpoints.compactMax ? 'compact' : 'wide',
    sideMode(s, c, layer) {
      const L = c.layers.find(l => l.id === layer);
      if (query.layoutClass(s, c) === 'compact' || !L || L.presentation.kind !== 'sheet') return null;
      if (s.device.width - (sizes.railWidth || 0) - (sizes.sideSheetWidth || 0) >= c.breakpoints.minContent) return 'beside';
      return s.device.touch ? 'modal' : 'auto';
    },
    currentPage(s) {
      const f = s.focus;
      if (s.layers[f] && s.layers[f].open) return topOf(s.layers[f].stack).page;
      return topOf(s.decks[s.activeDeck].stack).page;
    },
    underPage(s) { const st = s.decks[s.activeDeck].stack; return st[underIndex(st)].page; },
    isBase(s) { return underIndex(s.decks[s.activeDeck].stack) === 0; },
    frontPosition(s) {
      const u = query.underPage(s);
      return u.back.expanded ? u.config.front.collapse : 'expanded';
    },
    visibleItems(page, content) { return (content && content.items) || []; },   // the data source applies the params
    presentation(page) {
      const cc = contentOf(page.config); if (!cc) return { key: 'default' };
      const P = cc.presentations || [], key = cc.view ? paramValue(page, cc.view) : 'default';
      return P.find(p => p.key === key) || P[0] || { key: 'default' };
    },
    contentParams(page) {
      const out = {}, P = page.config.params || {}, cc = contentOf(page.config);
      for (const x of (cc && cc.params) || []) out[x.name] = resolveValue(x.value, page);   // e.g. { name: 'id', value: { bind: '$opener.id' } }
      for (const k in P) if (P[k].data !== false) out[k] = paramValue(page, k);
      return out;
    },
    navVisible(s, c) {
      if (query.layoutClass(s, c) === 'wide') return true;
      return !c.layers.some(L => s.layers[L.id].open && L.presentation.kind === 'sheet' && L.presentation.compact.hidesNavWhenOpen);
    },
    historyMode(s, c, L) { return typeof L.history === 'string' ? L.history : L.history[query.layoutClass(s, c)]; },
    backAction(s, c) {
      if (s.overlays.some(o => o.spec.blocking)) return 'closeOverlay';
      if (c.layers.some(L => L.presentation.kind === 'drawer' && s.layers[L.id].open)) return 'closeDrawer';   // drawers are transient: back closes them first (also on pointer)
      if (!s.device.touch) return lastValidRecord(s) >= 0 ? 'undoRecord' : 'exit';
      const f = s.focus;
      if (s.layers[f] && s.layers[f].open) { const lt = topOf(s.layers[f].stack).page; return lt.sheet && lt.sheet.expanded ? 'collapseSheet' : s.layers[f].stack.length > 1 ? 'popLayer' : 'closeLayer'; }
      const st = s.decks[s.activeDeck].stack, top = topOf(st).page, u = query.underPage(s);
      if (top.sheet && top.sheet.expanded) return 'collapseSheet';
      if (top.config.kind === 'backdrop' && u.back.expanded && !u.config.policy.back.expanded.default) return 'collapse';
      if (top.config.kind === 'backdrop' && pushedParam(u)) return 'resetParam';
      if (st.length > 1) return 'pop';
      if (s.activeDeck !== c.startDeck) return 'startDeck';
      return 'exit';
    },
    historyEntries(s, c) {
      if (!s.device.touch) return s.history.slice();
      const out = [], st = s.decks[s.activeDeck].stack, u = query.underPage(s);
      if (s.activeDeck !== c.startDeck) out.push({ kind: 'deckSwitch', from: c.startDeck, to: s.activeDeck });
      st.slice(1).forEach(() => out.push({ kind: 'push', deck: s.activeDeck }));
      if (topOf(st).page.config.kind === 'backdrop' && u.back.expanded && !u.config.policy.back.expanded.default) out.push({ kind: 'expand', deck: s.activeDeck });
      if (topOf(st).page.config.kind === 'backdrop' && pushedParam(u)) out.push({ kind: 'param', deck: s.activeDeck, param: pushedParam(u), page: u.config.id });
      c.layers.forEach(L => { const ls = s.layers[L.id]; if (!ls.open) return; out.push({ kind: 'layerOpen', layer: L.id }); ls.stack.slice(1).forEach(() => out.push({ kind: 'layerPush', layer: L.id })); });
      s.overlays.filter(o => o.spec.blocking && o.spec.history !== 'ignore').forEach(o => out.push({ kind: 'overlay', id: o.spec.id }));
      return out;
    },
    gate(s, c) {
      const gates = (c.session && c.session.gates) || [];
      const hit = gates.find(g => g.when === 'signedOut' ? !s.session.signedIn
        : g.when === 'onboardingPending' ? s.session.signedIn && !s.session.onboarded
        : g.when && g.when.permissionMissing ? s.session.permissions[g.when.permissionMissing] !== 'granted' : false);
      return hit ? hit.id : null;
    },
    // the destination (§11): a gate, else an open recorded layer, else the active deck's stack; params of its top page as a query
    url(s, c) {
      const R = c.routes; if (!R) return '/';
      const g = query.gate(s, c);
      if (g && R.gate && R.gate[g]) return R.base + R.gate[g];
      const L = c.layers.find(L => s.layers[L.id].open && query.historyMode(s, c, L) === 'record' && R.layer && R.layer[L.id]);
      let u, st;
      if (L) { st = s.layers[L.id].stack; u = R.base + R.layer[L.id] + st.slice(1).map(e => '/' + slug(layerKey(L, e.page.config.id))).join(''); }
      else { st = s.decks[s.activeDeck].stack; u = R.base + R.deck[s.activeDeck] + st.slice(1).map((e, k) => '/' + slug(lastSegment(e.page.config.id, st[k].page.config.id))).join(''); }
      return u + ((R.params || 'none') === 'top' ? paramQuery(topOf(st).page) : '');
    },
    snapshot(s, c) {
      const P = c.persist || { stacks: 'all', pageFields: [], layers: 'none' };
      const decks = {};
      Object.keys(s.decks).forEach(id => {
        if (P.stacks === 'none' || (P.stacks === 'activeDeck' && id !== s.activeDeck)) return;
        decks[id] = { pages: s.decks[id].stack.map(e => ({ id: e.page.config.id, fields: Object.fromEntries(P.pageFields.filter(p => readPath(e.page, p) !== undefined).map(p => [p, clone(readPath(e.page, p))])) })) };
      });
      const layers = {};
      if (P.layers !== 'none') c.layers.forEach(L => { if (P.layers === 'all' || query.historyMode(s, c, L) === 'record') layers[L.id] = s.layers[L.id].open ? s.layers[L.id].stack.map(e => e.page.config.id) : []; });
      return { version: 1, contractVersion: CONTRACT_VERSION, activeDeck: s.activeDeck, decks, layers };
    },
    intentForShortcut(s, c, keys) {
      const sc = (c.shortcuts || []).find(x => x.keys === keys && (x.when !== 'pointer' || !s.device.touch));
      return sc ? sc.intent : null;
    }
  };
  function currentSurface(s) {
    const top = s.overlays.length ? s.overlays[s.overlays.length - 1] : null;
    if (top && top.spec.blocking) return { kind: 'overlay', id: top.spec.id };
    if (s.layers[s.focus] && s.layers[s.focus].open) return { kind: 'layer', layer: s.focus };
    const st = s.decks[s.activeDeck].stack;
    return topOf(st).page.config.kind === 'appBar' ? { kind: 'appBarPage', deck: s.activeDeck } : { kind: 'frontLayer', deck: s.activeDeck };
  }
  const sameSurface = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  function restoreFocus(s, opened, ev) {
    let k = s.focusReturns.length - 1;
    while (k >= 0 && !sameSurface(s.focusReturns[k].opened, opened)) k--;
    if (k < 0) return s;
    const r = s.focusReturns[k];
    ev.push({ type: 'focusRestore', surface: r.surface, element: r.element });
    return { ...s, focusReturns: s.focusReturns.filter((_, j) => j !== k) };
  }
  // '$player' paths: the player state plus its current track
  // '$content' paths: the page's content items, all their tracks (item.track / item.tracks) and their number
  const contentView = page => {
    const cc = page && contentOf(page.config); if (!cc || !data) return undefined;
    const items = query.visibleItems(page, data.get(cc.dataSource, query.contentParams(page)));
    return { items, total: items.length, tracks: items.flatMap(i => i.track ? [i.track] : Array.isArray(i.tracks) ? i.tracks : []) };
  };
  const playerView = () => { if (!player) return undefined; const p = player.getState(); return { ...p, current: player.current() }; };
  // ── component references (config → design system) ─────
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function pageValue(page, path, scope) {
    if (path && path[0] === '$') { const [h, ...rest] = path.slice(1).split('.'); const v = scope && h in scope ? scope[h] : h === 'opener' && page ? page.opener : h === 'player' ? playerView() : h === 'content' ? contentView(page) : undefined; return rest.length ? readPath(v, rest.join('.')) : v; }
    if (!page) return undefined;
    const p = readPath(page.config.policy, path);
    return p && typeof p === 'object' && 'resetOn' in p ? getField(page, path) : readPath(page, path);
  }
  // a PropValue → a plain value (bind, derived, text, if); scope: repeat elements
  function resolveValue(v, page, scope, s = state, c = config) {
    const val = x => resolveValue(x, page, scope, s, c);
    return v === null || typeof v !== 'object' || Array.isArray(v) ? v
      : 'bind' in v ? pageValue(page, v.bind, scope)
      : 'derived' in v ? query.derived(s, c, v.derived, page, v.of)
      : 'text' in v ? query.text(s, c, { text: v.text, args: Object.fromEntries(Object.entries(v.args || {}).map(([k, x]) => [k, val(x)])) })
      : 'if' in v ? val(query.condition(s, c, v.if, page, scope) ? v.then : v.else) : v;
  }
  const deepResolve = (x, page, scope) => x === null || typeof x !== 'object' ? x : Array.isArray(x) ? x.map(y => deepResolve(y, page, scope)) : 'bind' in x && Object.keys(x).length === 1 ? pageValue(page, x.bind, scope) : Object.fromEntries(Object.entries(x).map(([k, y]) => [k, deepResolve(y, page, scope)]));
  Object.assign(query, {
    derived(s, c, id, page, of) {
      const v = of ? pageValue(page, of) : undefined;
      switch (id) {
        case 'deckName': { const nm = (deckCfg(s.activeDeck) || {}).name; return nm ? query.text(s, c, nm) : ''; }
        case 'pageTitle': { const t = page && page.config.title; return typeof t === 'string' ? t : t && t.text ? query.text(s, c, t) : ''; }
        case 'total': {
          if (!page || !data) return 0;
          const cc = contentOf(page.config); if (!cc) return 0;
          return query.visibleItems(page, data.get(cc.dataSource, query.contentParams(page))).length;
        }
        case 'scrolled': {
          if (!page) return false;
          return (page.config.kind === 'appBar' ? getField(page, 'scroll') : getField(page, 'front.scroll')) > 0;
        }
        case 'count': return Array.isArray(v) ? v.length : v == null || v === '' || v === false ? 0 : 1;
        case 'summary': {
          const name = of && of.startsWith('params.') ? of.slice(7) : null, opts = name && page ? query.paramOptions(s, c, page, name) : [];
          const label = x => { const o = opts.find(o => o.value === x); return o ? o.label : String(x); };
          return v == null ? '' : Array.isArray(v) ? v.map(label).join(', ') : typeof v === 'string' && opts.length ? label(v) : String(v);
        }
        case 'contentSummary': {
          if (!page) return '';
          if (page.config.kind === 'appBar') return query.derived(s, c, 'pageTitle', page);
          const F = page.config.front;
          const d = data ? data.get(F.content.dataSource, query.contentParams(page)) : null;
          return query.text(s, c, { text: 'content.count', args: { count: query.visibleItems(page, d).length } });
        }
      }
      return undefined;
    },
    condition(s, c, k, page, scope) {
      if (!k) return true;
      if ('not' in k) return !query.condition(s, c, k.not, page, scope);
      if ('all' in k) return k.all.every(x => query.condition(s, c, x, page, scope));
      if ('any' in k) return k.any.some(x => query.condition(s, c, x, page, scope));
      if ('env' in k) {
        if (k.env === 'sheet') {
          const S = c.layers.find(L => L.presentation.kind === 'sheet'), open = !!(S && s.layers[S.id].open && query.layoutClass(s, c) === 'wide');
          return same(!open ? 'none' : query.sideMode(s, c, S.id) === 'beside' ? 'beside' : 'over', k.equals);
        }
        return same(k.env === 'layout' ? query.layoutClass(s, c) : k.env === 'touch' ? s.device.touch : k.env === 'dir' ? query.dir(s, c) : undefined, k.equals);
      }
      if ('layer' in k && 'open' in k) return !!(s.layers[k.layer] && s.layers[k.layer].open) === !!k.open;
      if ('derived' in k) return same(query.derived(s, c, k.derived, page, k.of), deepResolve(k.equals, page, scope));
      if ('player' in k) {
        if (!player) return false;
        const p = player.getState();
        if (k.player === 'queue') return queueRelation(player, k.of ? pageValue(page, k.of, scope) : []) === k.equals;
        return same(p[k.player], k.equals);
      }
      if ('path' in k && 'includes' in k) { const v = pageValue(page, k.path, scope), x = deepResolve(k.includes, page, scope); return Array.isArray(v) && v.some(y => same(y, x)); }
      if ('path' in k) return same(pageValue(page, k.path, scope), deepResolve(k.equals, page, scope));
      return false;
    },
    paramOptions(s, c, page, name) {
      const S = page && page.config.params && page.config.params[name]; if (!S || !S.options) return [];
      return sourceList(S.options, page).map(o => ({ value: o.value, label: typeof o.label === 'object' && o.label ? query.text(s, c, o.label) : o.label == null ? o.value : o.label }));
    },
    paramTarget(s, intent) { return paramTargetLoc(s, intent).page; },
    groups(s, c, page, items) {
      const P = query.presentation(page), G = (P.groups || []).find(g => !g.when || query.condition(s, c, g.when, page));
      if (!G) return [{ key: '', items: items.slice() }];
      const out = [];
      for (const it of items) { const k = groupKey(pageValue(page, G.by, { item: it }), G.key), last = out[out.length - 1]; if (last && last.key === k) last.items.push(it); else out.push({ key: k, items: [it] }); }
      return out;
    },
    text(s, c, ref) {
      const id = typeof ref === 'string' ? ref : ref.text, args = (ref && ref.args) || {}, T = c.texts || {}, loc = s.prefs.locale, def = c.locales ? c.locales.default : loc;
      const msg = (T[loc] && T[loc][id]) ?? (T[def] && T[def][id]);
      return msg == null ? id : formatMessage(msg, args, loc);
    },
    dir(s, c) { const L = c.locales && c.locales.supported.find(l => l.id === s.prefs.locale); return (L && L.dir) || 'ltr'; },
    contentView(page, d, c, offline) {
      const pc = page.config, cc = pc.kind === 'backdrop' ? pc.front.content : pc.content;
      const items = d && d.items ? query.visibleItems(page, d) : [];
      if (!d || d.status === 'loading') return { state: 'loading', showItems: false, placeholders: 6, banner: false, retry: false };
      if (d.status === 'error') {
        if (offline && items.length) return { state: 'offlineStale', showItems: true, placeholders: 0, banner: true, retry: true };
        return { state: 'error', showItems: false, placeholders: 0, banner: false, retry: !offline && (d.error ? d.error.retryable : true) };
      }
      if (offline && d.stale) return { state: 'offlineStale', showItems: items.length > 0, placeholders: 0, banner: true, retry: true };
      if (!items.length) return { state: 'empty', showItems: false, placeholders: 0, banner: false, retry: false };
      return { state: 'ready', showItems: true, placeholders: 0, banner: false, retry: false };
    },
    focusOrder(s, c) {
      const top = s.overlays.length ? s.overlays[s.overlays.length - 1] : null;
      if (top && top.spec.blocking) return [{ kind: 'overlay', id: top.spec.id }];
      const wide = query.layoutClass(s, c) === 'wide';
      for (const L of c.layers) {
        if (!s.layers[L.id].open) continue;
        const railForm = L.presentation.kind === 'drawer' && L.presentation.wide === 'rail' && wide;
        if (railForm) continue;
        const covering = L.presentation.kind !== 'sheet' || !wide || query.sideMode(s, c, L.id) !== 'beside';
        if (covering) return [{ kind: 'layer', layer: L.id }];
      }
      const d = s.activeDeck, st = s.decks[d].stack, order = [{ kind: 'nav' }];
      if (topOf(st).page.config.kind === 'appBar') order.push({ kind: 'appBarPage', deck: d });
      else order.push({ kind: 'backLayer', deck: d }, { kind: 'frontLayer', deck: d });
      c.layers.forEach(L => { if (s.layers[L.id].open) order.push({ kind: 'layer', layer: L.id }); });
      return order;
    }
  });
  // URL (§11): lowercase slugs, '-' for spaces in segments and option values; the top page's url params as ?name=value&…
  const enc = encodeURIComponent, dec = x => { try { return decodeURIComponent(x); } catch (e) { return x; } };
  // slug: lowercase; every run of characters other than letters, digits and '.' becomes one '-' (trimmed); non-ASCII letters percent-encoded
  const slug = x => enc(String(x).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, '-').replace(/^-+|-+$/g, ''));
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function encParam(S, v, page, name) {
    if (S.type === 'choice') return slug(v);
    if (S.type === 'choices') { const o = optionValues(page, name) || []; return [...v].sort((a, b) => o.indexOf(a) - o.indexOf(b)).map(slug).join(','); }
    if (S.type === 'text') return enc(String(v).toLowerCase()).replace(/%20/g, '+');
    if (S.type === 'flag') return v ? '1' : '0';
    if (S.range && Array.isArray(v)) return v.map(x => enc(String(x))).join('..');
    return enc(String(v));
  }
  function decParam(S, raw, page, name) {
    const o = optionValues(page, name), okNum = x => Number.isFinite(x) && (S.min == null || x >= S.min) && (S.max == null || x <= S.max);
    const pick = r => { const k = dec(r).toLowerCase(); return o ? o.find(v => dec(slug(v)) === k) : dec(r); };   // options match by slug, case-insensitive
    const one = r => S.type === 'number' ? (r.trim() !== '' && okNum(+r) ? +r : undefined) : S.type === 'date' ? (DATE.test(dec(r)) ? dec(r) : undefined) : dec(r);
    switch (S.type) {
      case 'choice': return pick(raw);
      case 'choices': { const v = raw ? raw.split(',').map(pick) : []; return v.every(x => x !== undefined) ? v : undefined; }
      case 'text': return dec(raw.replace(/\+/g, ' ')).toLowerCase();
      case 'flag': return raw === '1' ? true : raw === '0' ? false : undefined;
      default: {
        if (!S.range) return one(raw);
        const p = raw.split('..'); if (p.length !== 2) return undefined;
        const a = one(p[0]), b = one(p[1]); return a === undefined || b === undefined || a > b ? undefined : [a, b];
      }
    }
  }
  function paramQuery(page) {
    const P = (page && page.config.params) || {}, out = [];
    for (const k in P) { if (!P[k].url) continue; const v = paramValue(page, k); if (JSON.stringify(v) === JSON.stringify(paramDefault(page, k))) continue; out.push(enc(k) + '=' + encParam(P[k], v, page, k)); }
    return out.length ? '?' + out.join('&') : '';
  }
  function applyQuery(page, qs) {
    const P = (page && page.config.params) || {}; if (!qs) return page;
    for (const x of qs.split('&').filter(Boolean)) {
      const j = x.indexOf('='), raw = j < 0 ? '' : x.slice(j + 1), want = dec(j < 0 ? x : x.slice(0, j)).toLowerCase();
      const k = Object.keys(P).find(n => n.toLowerCase() === want); if (!k || !P[k].url) continue;
      const v = decParam(P[k], raw, page, k); if (v !== undefined) page = setField(page, 'params.' + k, v);
    }
    return page;
  }
  const layerKey = (L, pageId) => Object.keys(L.pages.set).find(k => L.pages.set[k].id === pageId) || lastSegment(pageId, L.id);
  // page id = parentId + '/' + itemId  →  itemId
  function lastSegment(id, parentId) { return id.slice(parentId.length + 1); }
  // resolve a child config of parentCfg by item id (searches every content param set, e.g. all tabs)
  function resolveChild(parentCfg, itemId, opener) {
    const pc = contentOf(parentCfg); if (!pc) return null; const ds = pc.dataSource;
    const fresh = { ...newPageState(parentCfg), opener }, base = query.contentParams(fresh), P = parentCfg.params || {}, variants = [base];
    for (const k in P) if (P[k].type === 'choice' && P[k].data !== false) (optionValues(fresh, k) || []).forEach(v => variants.push({ ...base, [k]: v }));
    for (const params of variants) {
      const items = (data && data.get(ds, params).items) || [];
      const it = items.find(i => (i.id === itemId || dec(slug(i.id)) === dec(itemId).toLowerCase()) && i.opens && i.opens.kind !== 'layerPage');
      if (it) { const cfg = childConfig(parentCfg, it); if (cfg) return { cfg, item: it }; }
    }
    return null;
  }
  // segs: item ids or their slugs, one per level below the base
  function stackFromSegs(baseCfg, segs) {
    const out = [{ page: newPageState(baseCfg), openedFrom: null }];
    let parent = baseCfg, parentOpener;
    for (const sg of segs) {
      const hit = resolveChild(parent, sg, parentOpener);
      if (!hit) break;
      const { cfg, item } = hit;
      out.push({ page: pageFor(cfg, item), openedFrom: item.id });
      if (cfg.kind === 'appBar') break;
      parent = cfg; parentOpener = item;
    }
    return out;
  }

  function lastValidRecord(s) {
    for (let k = s.history.length - 1; k >= 0; k--) {
      const r = s.history[k];
      if (r.kind === 'push' && s.decks[r.deck].stack.length < 2) continue;
      if (r.kind === 'layerOpen' && !s.layers[r.layer].open) continue;
      if (r.kind === 'layerPush' && s.layers[r.layer].stack.length < 2) continue;
      if (r.kind === 'param') { const st = s.decks[r.deck].stack, u = st[underIndex(st)].page; if (r.deck !== s.activeDeck || u.config.id !== r.page || pushedParam(u) !== r.param) continue; }
      return k;
    }
    return -1;
  }

  // ── state transforms ─────────────────────────────────────
  const patchDeck = (s, id, fn) => ({ ...s, decks: { ...s.decks, [id]: fn(s.decks[id]) } });
  const patchLayer = (s, id, fn) => ({ ...s, layers: { ...s.layers, [id]: fn(s.layers[id]) } });
  const patchUnder = (s, fn, deck = s.activeDeck) => patchDeck(s, deck, d => {
    const stack = d.stack.slice(), i = underIndex(stack);
    stack[i] = { ...stack[i], page: fn(stack[i].page) };
    return { ...d, stack };
  });
  const patchTop = (s, fn) => {
    const f = s.focus;
    if (s.layers[f] && s.layers[f].open) return patchLayer(s, f, l => { const st = l.stack.slice(); st[st.length - 1] = { ...topOf(st), page: fn(topOf(st).page) }; return { ...l, stack: st }; });
    return patchDeck(s, s.activeDeck, d => { const st = d.stack.slice(); st[st.length - 1] = { ...topOf(st), page: fn(topOf(st).page) }; return { ...d, stack: st }; });
  };
  const record = (s, r) => s.device.touch ? s : { ...s, history: [...s.history, r] };
  const dropLast = (s, pred) => { const h = s.history.slice(); for (let k = h.length - 1; k >= 0; k--) if (pred(h[k])) { h.splice(k, 1); break; } return { ...s, history: h }; };
  const popDeck = (s, id) => patchDeck(s, id, d => {
    const stack = d.stack.slice(0, -1), i = underIndex(stack);
    stack[i] = { ...stack[i], page: applyEvent(stack[i].page, 'return') };
    return { ...d, stack };
  });
  const enterDeck = (s, id) => {
    const D = deckCfg(id);
    if (D.policy && D.policy.stack && matches(D.policy.stack.resetOn, 'deckSwitch')) return patchDeck(s, id, () => deckState(D));
    return patchUnder(s, p => applyEvent(p, 'deckSwitch'), id);
  };
  // a page template opened by an item: id = parent id + '/' + item id; { from: 'item' } titles read the item's field
  const childConfig = (parentCfg, item) => {
    const T = (config.pages || {})[item.opens.template]; if (!T) return null;
    const t = T.title && T.title.from === 'item' ? String(item[T.title.field || 'title'] ?? item.id) : T.title;
    return { ...T, id: parentCfg.id + '/' + item.id, title: t };
  };
  const pageFor = (cfg, item) => ({ ...newPageState(cfg), opener: item });
  const isOver = (s, L) => query.layoutClass(s, config) === 'compact' || query.sideMode(s, config, L.id) !== 'beside';

  function closeLayerState(s, id, fromHistory) {
    const L = layerCfg(id);
    let hist = s.history;
    if (!fromHistory && query.historyMode(s, config, L) === 'record') {
      let k = hist.length - 1; while (k >= 0 && !(hist[k].kind === 'layerOpen' && hist[k].layer === id)) k--;
      if (k >= 0) hist = hist.filter((r, j) => j < k || (j > k && r.layer !== id));
    }
    return { ...patchLayer(s, id, l => ({ ...l, open: false })), focus: s.activeDeck, history: hist };
  }
  const closeLayerWithFocus = (s, id, fromHistory, ev) => restoreFocus(closeLayerState(s, id, fromHistory), { kind: 'layer', layer: id }, ev);

  // the page a params intent applies to, and how to patch it in place
  function findPage(s, id) {
    const where = [{ st: s.decks[s.activeDeck].stack, patch: (s2, k, fn) => patchDeck(s2, s2.activeDeck, d => { const st = d.stack.slice(); st[k] = { ...st[k], page: fn(st[k].page) }; return { ...d, stack: st }; }) }];
    config.layers.forEach(L => { if (s.layers[L.id].open) where.push({ st: s.layers[L.id].stack, patch: (s2, k, fn) => patchLayer(s2, L.id, l => { const st = l.stack.slice(); st[k] = { ...st[k], page: fn(st[k].page) }; return { ...l, stack: st }; }) }); });
    for (const w of where) for (let k = w.st.length - 1; k >= 0; k--) if (w.st[k].page.config.id === id) return { page: w.st[k].page, patch: fn => w.patch(s, k, fn) };
    return { page: null };
  }
  function paramTargetLoc(s, intent) {
    if (intent.page) return findPage(s, intent.page);
    const names = intent.type === 'setParams' ? Object.keys(intent.values || {}) : intent.type === 'toggleParam' ? [intent.name] : intent.names || [];
    const declares = p => { const P = p.config.params || {}; return names.length ? names.every(k => P[k]) : Object.keys(P).length > 0; };
    const cur = query.currentPage(s);
    if (declares(cur)) return { page: cur, patch: fn => patchTop(s, fn) };
    const u = query.underPage(s);
    return declares(u) ? { page: u, patch: fn => patchUnder(s, fn) } : { page: null };
  }
  let pushNext = false;   // set when a pushFirst param leaves its default (the URL change pushes)
  // set params on a page: only declared, changed values; then policy reactions (resets, on), history, events
  function changeParams(s, loc, vals, ev, fromBack) {
    const P = loc.page, D = P.config.params || {};
    const changed = Object.keys(vals || {}).filter(k => D[k] && JSON.stringify(paramValue(P, k)) !== JSON.stringify(vals[k]));
    if (!changed.length) {   // picked again (e.g. the active tab): only policy reactions on paramReselect
      const same = Object.keys(vals || {}).filter(k => D[k]); if (!same.length || fromBack) return s;
      let np = P; same.forEach(k => { np = applyEvent(np, { paramReselect: k }); });
      if (np === P) return s;
      s = loc.patch(() => np);
      if (P.back && np.back && P.back.expanded !== np.back.expanded) ev.push({ type: 'expandedChanged', expanded: np.back.expanded });
      if (P.sheet && np.sheet && P.sheet.expanded !== np.sheet.expanded) ev.push({ type: 'expandedChanged', expanded: np.sheet.expanded, sheet: true });
      return s;
    }
    let np = P; changed.forEach(k => { np = setField(np, 'params.' + k, clone(vals[k])); });
    const skip = new Set(changed.map(k => 'params.' + k));
    changed.forEach(k => { np = applyEvent(np, { paramChange: k }, skip); });
    s = loc.patch(() => np);
    changed.forEach(k => {
      const S = D[k], was = paramValue(P, k), def = paramDefault(P, k);
      if (!fromBack && S.history === 'pushFirst' && JSON.stringify(was) === JSON.stringify(def)) { pushNext = true; if (P.config.kind === 'backdrop') s = record(s, { kind: 'param', deck: s.activeDeck, param: k, page: P.config.id }); }
      let direction = 0;
      if (S.type === 'choice' && S.axis) { const o = optionValues(P, k) || []; direction = Math.sign(o.indexOf(vals[k]) - o.indexOf(was)); }
      ev.push({ type: 'paramChanged', name: k, motion: S.motion || 'default', direction });
    });
    if (P.back && np.back) {
      if (P.back.expanded !== np.back.expanded) ev.push({ type: 'expandedChanged', expanded: np.back.expanded });
      if (!!P.back.headerHidden !== !!np.back.headerHidden) ev.push({ type: 'headerVisibilityChanged', hidden: !!np.back.headerHidden });
    }
    return s;
  }

  // ── reducer ──────────────────────────────────────────────
  function reduce(s, intent) {
    const ev = [];
    switch (intent.type) {
      case 'open': {
        const { item, origin } = intent;
        if (!item || !item.opens) break;
        if (item.opens.kind === 'layerPage') return reduce(s, { type: 'openLayerPage', layer: origin.layer, page: item.opens.page });
        const L = origin.layer ? layerCfg(origin.layer) : null;
        const target = (L ? L.linkTarget : deckCfg(origin.deck).linkTarget) || 'activeDeck';
        const deck = target === 'activeDeck' ? s.activeDeck : target.deck;
        const parent = L ? deckCfg(deck).page : query.underPage(s).config;
        const cfg = childConfig(parent, item); if (!cfg) break;
        const prev = s.activeDeck;
        s = patchDeck(s, deck, d => ({ ...d, stack: [...d.stack, { page: pageFor(cfg, item), openedFrom: L ? null : item.id }] }));
        s = { ...s, activeDeck: deck, focus: deck };
        if (L && isOver(s, L)) { s = patchLayer(s, L.id, l => ({ ...l, open: false })); ev.push({ type: 'layerClosed', layer: L.id }); }
        s = record(s, { kind: 'push', deck, prevDeck: prev });
        if (prev !== deck) ev.push({ type: 'deckSwitched', from: prev, to: deck });
        ev.push({ type: 'pushed', target: { deck }, openedFrom: L ? null : item.id, kind: cfg.kind });
        break;
      }
      case 'openLayerPage': {
        const L = layerCfg(intent.layer);
        s = patchLayer(s, L.id, l => ({ ...l, stack: [...l.stack, { page: newPageState(L.pages.set[intent.page]), openedFrom: null }] }));
        if (query.historyMode(s, config, L) === 'record') s = record(s, { kind: 'layerPush', layer: L.id });
        ev.push({ type: 'pushed', target: { layer: L.id }, openedFrom: null, kind: L.pages.set[intent.page].kind });
        break;
      }
      case 'back': {
        const a = query.backAction(s, config);
        if (a === 'exit') { ev.push({ type: 'exit' }); break; }
        if (a === 'closeOverlay') { const k = s.overlays.map(o => o.spec.blocking).lastIndexOf(true); const id = s.overlays[k].spec.id; s = { ...s, overlays: s.overlays.filter((_, j) => j !== k) }; ev.push({ type: 'overlayClosed', id }); s = restoreFocus(s, { kind: 'overlay', id }, ev); break; }
        if (a === 'undoRecord') {
          const k = lastValidRecord(s), r = s.history[k];
          s = { ...s, history: s.history.slice(0, k) };
          if (r.kind === 'push') {
            const entry = topOf(s.decks[r.deck].stack);
            s = popDeck(s, r.deck);
            if (r.prevDeck !== r.deck) { s = { ...s, activeDeck: r.prevDeck, focus: r.prevDeck }; ev.push({ type: 'deckSwitched', from: r.deck, to: r.prevDeck }); }
            ev.push({ type: 'popped', target: { deck: r.deck }, openedFrom: entry.openedFrom, kind: entry.page.config.kind });
          } else if (r.kind === 'deckSwitch') {
            s = { ...enterDeck(s, r.from), activeDeck: r.from, focus: r.from };
            ev.push({ type: 'deckSwitched', from: r.to, to: r.from });
          } else if (r.kind === 'layerOpen') {
            s = closeLayerWithFocus(s, r.layer, true, ev); ev.push({ type: 'layerClosed', layer: r.layer });
          } else if (r.kind === 'param') {
            const u = query.underPage(s);
            s = changeParams(s, { page: u, patch: fn => patchUnder(s, fn, r.deck) }, { [r.param]: clone(paramDefault(u, r.param)) }, ev, true);
          } else if (r.kind === 'layerPush') {
            const kind = topOf(s.layers[r.layer].stack).page.config.kind;
            s = patchLayer(s, r.layer, l => ({ ...l, stack: l.stack.slice(0, -1) }));
            ev.push({ type: 'popped', target: { layer: r.layer }, openedFrom: null, kind });
          }
          break;
        }
        if (a === 'popLayer') { const kind = topOf(s.layers[s.focus].stack).page.config.kind; s = patchLayer(s, s.focus, l => ({ ...l, stack: l.stack.slice(0, -1) })); ev.push({ type: 'popped', target: { layer: s.focus }, openedFrom: null, kind }); break; }
        if (a === 'closeDrawer') { const L = config.layers.find(L => L.presentation.kind === 'drawer' && s.layers[L.id].open); s = closeLayerWithFocus(s, L.id, false, ev); ev.push({ type: 'layerClosed', layer: L.id }); break; }
        if (a === 'closeLayer') { const id = s.focus; s = closeLayerWithFocus(s, id, false, ev); ev.push({ type: 'layerClosed', layer: id }); break; }
        if (a === 'resetParam') { const u = query.underPage(s), k = pushedParam(u); s = changeParams(s, { page: u, patch: fn => patchUnder(s, fn) }, { [k]: clone(paramDefault(u, k)) }, ev, true); s = dropLast(s, r => r.kind === 'param' && r.param === k); break; }
        if (a === 'collapseSheet') { s = patchTop(s, p => ({ ...p, sheet: { expanded: false } })); ev.push({ type: 'expandedChanged', expanded: false, sheet: true }); break; }
        if (a === 'collapse') { s = patchUnder(s, p => ({ ...p, back: { ...p.back, expanded: false } })); ev.push({ type: 'expandedChanged', expanded: false }); break; }
        if (a === 'pop') { const entry = topOf(s.decks[s.activeDeck].stack); s = popDeck(s, s.activeDeck); ev.push({ type: 'popped', target: { deck: s.activeDeck }, openedFrom: entry.openedFrom, kind: entry.page.config.kind }); break; }
        if (a === 'startDeck') { const from = s.activeDeck; s = { ...enterDeck(s, config.startDeck), activeDeck: config.startDeck, focus: config.startDeck }; ev.push({ type: 'deckSwitched', from, to: config.startDeck }); break; }
        break;
      }
      case 'up': {              // in-app back arrow: pop that stack, drop its matching record
        const t = intent.target || (s.layers[s.focus] && s.layers[s.focus].open ? { layer: s.focus } : { deck: s.activeDeck });
        if (t.layer) {
          if (s.layers[t.layer].stack.length < 2) break;
          const kind = topOf(s.layers[t.layer].stack).page.config.kind;
          s = patchLayer(s, t.layer, l => ({ ...l, stack: l.stack.slice(0, -1) }));
          s = dropLast(s, r => r.kind === 'layerPush' && r.layer === t.layer);
          ev.push({ type: 'popped', target: { layer: t.layer }, openedFrom: null, kind });
        } else {
          const d = t.deck;
          if (s.decks[d].stack.length < 2) break;
          const entry = topOf(s.decks[d].stack);
          s = dropLast(popDeck(s, d), r => r.kind === 'push' && r.deck === d);
          ev.push({ type: 'popped', target: { deck: d }, openedFrom: entry.openedFrom, kind: entry.page.config.kind });
        }
        break;
      }
      case 'switchDeck': {
        const from = s.activeDeck, to = intent.deck;
        if (from === to) break;
        s = { ...enterDeck(s, to), activeDeck: to, focus: to };
        config.layers.forEach(L => { const p = L.policy && L.policy.open; if (p && s.layers[L.id].open && matches(p.resetOn, 'deckSwitch')) { s = closeLayerWithFocus(s, L.id, false, ev); ev.push({ type: 'layerClosed', layer: L.id }); } });
        s = { ...s, focus: to };
        s = record(s, { kind: 'deckSwitch', from, to });
        ev.push({ type: 'deckSwitched', from, to });
        break;
      }
      case 'reselectDeck': {
        const id = intent.deck;
        const st = s.decks[id].stack;
        if (st.length < 2) {
          const before = st[0].page, after = applyEvent(before, 'reselect');
          s = patchDeck(s, id, d => ({ ...d, stack: [{ ...d.stack[0], page: after }] }));
          if (before.config.kind === 'backdrop' && before.back.expanded !== after.back.expanded) ev.push({ type: 'expandedChanged', expanded: after.back.expanded });
          break;
        }
        const leaving = topOf(st);
        s = patchDeck(s, id, d => ({ ...d, stack: [{ ...d.stack[0], page: applyEvent(d.stack[0].page, 'return') }] }));
        s = { ...s, history: s.history.filter(r => !(r.kind === 'push' && r.deck === id)) };
        ev.push({ type: 'popped', target: { deck: id }, openedFrom: st[1].openedFrom, kind: leaving.page.config.kind, depth: st.length - 1 });
        break;
      }
      case 'setParams': case 'toggleParam': case 'resetParams': {
        const loc = paramTargetLoc(s, intent); if (!loc.page) break;
        const P = loc.page, D = P.config.params || {};
        let vals;
        if (intent.type === 'setParams') vals = intent.values;
        else if (intent.type === 'toggleParam') { const cur = paramValue(P, intent.name) || []; vals = { [intent.name]: cur.includes(intent.option) ? cur.filter(x => x !== intent.option) : [...cur, intent.option] }; }
        else vals = Object.fromEntries((intent.names || Object.keys(D)).filter(k => D[k]).map(k => [k, clone(paramDefault(P, k))]));
        s = changeParams(s, loc, vals, ev, false);
        break;
      }
      case 'setExpanded': {
        const cp = query.currentPage(s);
        if (cp.sheet) { if (cp.sheet.expanded !== intent.expanded) { s = patchTop(s, p => ({ ...p, sheet: { expanded: intent.expanded } })); ev.push({ type: 'expandedChanged', expanded: intent.expanded, sheet: true }); } break; }
        if (intent.expanded && query.underPage(s).back.headerHidden) { s = patchUnder(s, p => ({ ...p, back: { ...p.back, headerHidden: false } })); ev.push({ type: 'headerVisibilityChanged', hidden: false }); }
        s = patchUnder(s, p => ({ ...p, back: { ...p.back, expanded: intent.expanded } }));
        ev.push({ type: 'expandedChanged', expanded: intent.expanded });
        break;
      }
      case 'toggleExpanded': { const cp = query.currentPage(s); return reduce(s, { type: 'setExpanded', expanded: cp.sheet ? !cp.sheet.expanded : !query.underPage(s).back.expanded }); }
      case 'openFind': case 'closeFind': {   // 18.0: the local search's open / closed state (FindState) on the page part that scrolls
        const cur = query.currentPage(s), app = cur.config.kind === 'appBar', base = app ? 'find' : 'front.find';
        const pol = app ? cur.config.policy.find : cur.config.policy.front.find; if (!pol) break;
        const item = (app ? cur.config.header.items : cur.config.front.header.items).find(x => x.kind === 'find');
        const patch = p => { let q = setField(setField(p, base + '.opened', intent.type === 'openFind'), base + '.closed', intent.type === 'closeFind'); if (intent.type === 'closeFind' && item) q = setField(q, 'params.' + item.param, ''); return q; };
        s = app ? patchTop(s, patch) : patchUnder(s, patch);
        break;
      }
      case 'scroll': {
        const cur = query.currentPage(s);
        const atTop = (prev, p) => prev > 0 && intent.top <= 0 ? applyEvent(p, 'scrollTop') : p;
        if (cur.config.kind === 'appBar') { const prev = getField(cur, 'scroll') || 0; s = patchTop(s, p => atTop(prev, setField(p, 'scroll', intent.top))); break; }
        const u0 = query.underPage(s), prevTop = getField(u0, 'front.scroll') || 0, wasHidden = !!u0.back.headerHidden;
        s = patchUnder(s, p => atTop(prevTop, setField(p, 'front.scroll', intent.top)));
        if (u0.config.back.hideHeaderOnScroll && !u0.back.expanded) {
          const d = intent.top - prevTop, hide = intent.top <= 0 ? false : d > 4 ? true : d < -4 ? false : wasHidden;
          if (hide !== wasHidden) { s = patchUnder(s, p => ({ ...p, back: { ...p.back, headerHidden: hide } })); ev.push({ type: 'headerVisibilityChanged', hidden: hide }); }
        }
        break;
      }
      case 'openLayer': {
        const L = layerCfg(intent.layer);
        if (s.layers[L.id].open) break;
        const reset = L.policy.stack && matches(L.policy.stack.resetOn, 'layerOpen');
        const from = currentSurface(s);
        s = patchLayer(s, L.id, l => ({ open: true, stack: reset ? layerState(L).stack : l.stack }));
        s = { ...s, focus: L.id, focusReturns: [...s.focusReturns, { opened: { kind: 'layer', layer: L.id }, surface: from, element: intent.returnFocus || null }] };
        if (query.historyMode(s, config, L) === 'record') s = record(s, { kind: 'layerOpen', layer: L.id });
        ev.push({ type: 'layerOpened', layer: L.id });
        break;
      }
      case 'closeLayer': {
        if (!s.layers[intent.layer].open) break;
        s = closeLayerWithFocus(s, intent.layer, false, ev);
        ev.push({ type: 'layerClosed', layer: intent.layer });
        break;
      }
      case 'focus': if (s.focus !== intent.target) s = { ...s, focus: intent.target }; break;
      case 'setDevice': s = { ...s, device: { ...intent.device } }; break;
      case 'retry': {
        const cur = query.currentPage(s), cc = cur.config.kind === 'backdrop' ? cur.config.front.content : cur.config.content;
        const ref = intent.dataSource || (cc && cc.dataSource);
        if (ref) ev.push({ type: 'retryRequested', dataSource: ref, params: query.contentParams(cur) });
        break;
      }
      case 'setPrefs': s = { ...s, prefs: { ...s.prefs, ...intent.prefs } }; break;
      case 'openOverlay': {
        if (s.overlays.some(o => o.spec.id === intent.overlay.id)) break;
        const from = currentSurface(s);
        s = { ...s, overlays: [...s.overlays, { spec: intent.overlay, openedFrom: null }] };
        if (intent.overlay.blocking) s = { ...s, focusReturns: [...s.focusReturns, { opened: { kind: 'overlay', id: intent.overlay.id }, surface: from, element: intent.returnFocus || null }] };
        ev.push({ type: 'overlayOpened', id: intent.overlay.id });
        break;
      }
      case 'closeOverlay': {
        const list = s.overlays; if (!list.length) break;
        const idx = intent.id ? list.findIndex(o => o.spec.id === intent.id) : list.length - 1;
        if (idx < 0) break;
        const id = list[idx].spec.id;
        s = { ...s, overlays: list.filter((_, k) => k !== idx) };
        ev.push({ type: 'overlayClosed', id, result: intent.result });
        s = restoreFocus(s, { kind: 'overlay', id }, ev);
        break;
      }
      case 'launched': if (s.launch === 'starting') { s = { ...s, launch: 'ready' }; ev.push({ type: 'launched' }); } break;
      case 'session': {
        const e = intent.event, ses = { ...s.session, permissions: { ...s.session.permissions } };
        if (e.type === 'signedIn') ses.signedIn = true;
        if (e.type === 'onboarded') ses.onboarded = true;
        if (e.type === 'permission') ses.permissions[e.name] = e.status;
        if (e.type === 'signedOut') {
          ses.signedIn = false;
          s = { ...s, decks: Object.fromEntries(config.decks.map(d => [d.id, deckState(d)])), layers: Object.fromEntries(config.layers.map(L => [L.id, layerState(L)])),
                overlays: [], focusReturns: [], history: [], activeDeck: config.startDeck, focus: config.startDeck };
        }
        s = { ...s, session: ses };
        ev.push({ type: 'sessionChanged', session: ses });
        break;
      }
      case 'navigateUrl': {
        const R = config.routes; if (!R) break;
        const qi = intent.url.indexOf('?'), path = qi < 0 ? intent.url : intent.url.slice(0, qi), qs = qi < 0 ? '' : intent.url.slice(qi + 1);
        const segs = path.slice(R.base.length).split('/').filter(Boolean).map(x => dec(x).toLowerCase());
        const find = T => T ? Object.keys(T).find(k => T[k].toLowerCase() === segs[0]) : undefined;
        const closeRecorded = () => config.layers.forEach(L => { if (s.layers[L.id].open && query.historyMode(s, config, L) === 'record') s = patchLayer(s, L.id, l => ({ ...l, open: false })); });
        const gid = find(R.gate), lid = find(R.layer), deck = find(R.deck);
        if (gid) {   // a gate shows only while it applies; otherwise the start deck
          if (query.gate(s, config) !== gid) { closeRecorded(); s = { ...s, activeDeck: config.startDeck, focus: config.startDeck }; }
          break;
        }
        if (lid) {
          const L = layerCfg(lid), keys = Object.keys(L.pages.set);
          const pages = segs.slice(1).map(sg => keys.find(k => dec(slug(k)) === sg)).filter(Boolean);
          const stack = [layerState(L).stack[0], ...pages.map(p => ({ page: newPageState(L.pages.set[p]), openedFrom: null }))];
          stack[stack.length - 1] = { ...stack[stack.length - 1], page: applyQuery(stack[stack.length - 1].page, qs) };
          s = patchLayer(s, lid, () => ({ open: true, stack }));
          s = { ...s, focus: lid };
          break;
        }
        const d = deck || config.startDeck, base = deckCfg(d).page;
        const stack = stackFromSegs(base, deck ? segs.slice(1) : []);
        stack[stack.length - 1] = { ...stack[stack.length - 1], page: applyQuery(stack[stack.length - 1].page, qs) };
        closeRecorded();
        s = patchDeck(s, d, () => ({ stack }));
        s = { ...s, activeDeck: d, focus: d };
        break;
      }
      case 'restore': {
        const snap = intent.snapshot; if (!snap || snap.version !== 1 || (snap.contractVersion && !compatible(snap.contractVersion))) break;
        Object.keys(snap.decks || {}).forEach(id => {
          const D = deckCfg(id); if (!D) return;
          const pages = snap.decks[id].pages;
          let stack = stackFromSegs(D.page, pages.slice(1).map((p, k) => lastSegment(p.id, pages[k].id)));
          stack = stack.map((e, k) => {
            const f = pages[k] && pages[k].fields; if (!f || e.page.config.kind !== 'backdrop') return e;
            let p = e.page; Object.keys(f).forEach(path => { p = setIn(p, path, clone(f[path])); });
            return { ...e, page: p };
          });
          s = patchDeck(s, id, () => ({ stack }));
        });
        Object.keys(snap.layers || {}).forEach(id => {
          const L = layerCfg(id), ids = snap.layers[id]; if (!L || !ids.length) return;
          s = patchLayer(s, id, () => ({ open: true, stack: ids.map(pid => ({ page: newPageState(Object.values(L.pages.set).find(p => p.id === pid) || L.pages.set[L.pages.base]), openedFrom: null })) }));
        });
        if (snap.activeDeck && s.decks[snap.activeDeck]) s = { ...s, activeDeck: snap.activeDeck, focus: snap.activeDeck };
        break;
      }
    }
    return { state: s, events: ev };
  }

  return {
    config,
    data,
    player,
    getState: () => state,
    dispatch(intent) {
      const before = config.routes ? query.url(state, config) : null;
      pushNext = false;
      const r = reduce(state, intent); state = r.state;
      const paramIntent = intent.type === 'setParams' || intent.type === 'toggleParam' || intent.type === 'resetParams';
      if (config.routes && intent.type !== 'scroll') {
        const after = query.url(state, config);
        if (after !== before) r.events.push({ type: 'urlChanged', url: after, replace: intent.type === 'navigateUrl' || intent.type === 'restore' || (paramIntent && !pushNext) });
      }
      return r.events;
    },
    query
  };
}
