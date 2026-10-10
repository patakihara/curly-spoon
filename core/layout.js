// Backdrop Nav — LAYOUT
// Pure: state + design (+ shell measurements) → what to draw and how it moves. No pixels, no timers, no DOM.
// No size constants: sizes come from design through composition (a look, core/compose.js lookAt); config holds none.

const sheetLayer = config => config.layers.find(L => L.presentation.kind === 'sheet');

// facts about the current layout that design values may depend on (Condition env keys)
export function env(state, config, q) {
  const layout = q.layoutClass(state, config), S = sheetLayer(config);
  const open = !!(S && state.layers[S.id].open && layout === 'wide');
  return { layout, touch: !!state.device.touch, dir: q.dir ? q.dir(state, config) : 'ltr', sheet: !open ? 'none' : q.sideMode(state, config, S.id) === 'beside' ? 'beside' : 'over' };
}

// 18.0: sizes come from design through composition — look = compose.js lookAt(specs, composition, env)
//   places: { contract, page, within } as composition matches them (within: the ancestor contracts, nearest first)
export const PEEK = { contract: 'header', page: null, within: ['sheetLayer'] };
export const NAVIGATION = { contract: 'navigation', page: null };
export const SHEET_LAYER = { contract: 'sheetLayer', page: null };
export const sizes = look => ({ railWidth: look.size(NAVIGATION, 'width'), sideSheetWidth: look.size(SHEET_LAYER, 'sideWidth') });   // core navigation's createModel sizes (wide look)
export const pageId = page => page.template || page.config.id;   // an opened page: its template (composition's page exceptions name it)
const backAt = page => ({ contract: 'backLayer', page: pageId(page), within: ['backdropPage'] });
// the contract a page is drawn as (api/contracts.js): an app-bar page with a sheet is a player page
export const pageContract = cfg => cfg.kind === 'backdrop' ? 'backdropPage' : cfg.sheet ? 'playerPage' : 'appBarPage';
const headerAt = (page, within = []) => page.config.kind === 'appBar'
  ? { contract: 'header', page: pageId(page), within: [pageContract(page.config), ...within] }
  : { contract: 'header', page: pageId(page), within: ['backLayer', 'backdropPage', ...within] };

export function geometry(state, config, q, look) {
  const wide = q.layoutClass(state, config) === 'wide', S = sheetLayer(config);
  const side = S ? q.sideMode(state, config, S.id) : null;
  const sheetOpen = !!(S && state.layers[S.id].open);
  const navigation = look.hire(NAVIGATION);
  const rail = wide ? look.size(NAVIGATION, 'width') : 0;
  const navHeight = wide ? 0 : look.size(NAVIGATION, 'height');
  const peekHeight = wide || !S ? 0 : look.size(PEEK, 'height');
  const width = state.device.width, height = state.device.height || 720;
  const contentWidth = width - rail - (wide && side === 'beside' && sheetOpen ? look.size(SHEET_LAYER, 'sideWidth') : 0);
  const contentHeight = height - navHeight - peekHeight;
  return { width, height, railWidth: rail, navHeight, peekHeight, contentWidth, contentHeight, side, wide, navigation };
}

// back-layer regions (18.0: fixed) — header · actions · controls (the 'always' param-control rows) show concealed and expanded and
// stay put; panel (the 'expanded' rows) shows only expanded. An open More is the whole back layer: the panel holds it, at the top,
// and every other region fades out
// a header with a detail shrinks from expandedHeight to height over the first (expandedHeight − height) of scroll (progress 0 → 1; collapse-first, 15.0)
const scrollOf = page => { const pol = page.config.kind === 'appBar' ? page.config.statePolicy.scroll : page.config.statePolicy.front.scroll, v = page.config.kind === 'appBar' ? page.scroll : page.front.scroll; if (!pol.scope) return +v || 0; const k = pol.scope.split('.').reduce((x, y) => x == null ? x : x[y], page); return v && k in v ? +v[k] || 0 : +pol.default || 0; };
const progressOf = (scroll, from, to) => from > to ? Math.max(0, Math.min(1, scroll / (from - to))) : 1;
// a back layer's panel scroll (collapse-first too): the header collapses by the larger of the two
const panelScroll = page => page.config.kind === 'backdrop' && page.back.expanded ? +page.back.scroll || 0 : 0;
export function barView(page, look, within = []) {
  const header = page.config.kind === 'appBar' ? page.config.header : page.config.back.header, at = headerAt(page, within);
  const h = look.size(at, 'height'), x = header.detail ? look.size(at, 'expandedHeight') || h : h, p = progressOf(Math.max(scrollOf(page), panelScroll(page)), x, h);   // from the scrolls only: expanding the back layer keeps the detail
  return { height: x - (x - h) * p, progress: p, distance: Math.max(0, x - h) };
}
// 15.0: scroll is collapse-first — 0 … distance collapses the bar (content still), beyond it the content scrolls
export function contentOffset(page, look, within = []) { return Math.max(0, scrollOf(page) - barView(page, look, within).distance); }
// the panel's own offset: its scroll past the collapse
export function panelOffset(page, look) { return Math.max(0, panelScroll(page) - barView(page, look).distance); }
export const BACK_REGIONS = ['header', 'actions', 'controls', 'panel'];
function regionHeights(page, look, measured) {
  const B = page.config.back, at = backAt(page);
  return {
    header: barView(page, look).height,
    actions: (B.actions || []).length ? look.size(at, 'actionsHeight') : 0,
    controls: (B.controls || []).length * look.size(at, 'basicHeight'),   // each controls row: the design's row height
    panel: has(page, 'panel') ? +((measured || {}).panel || 0) : 0,
  };
}
// the regions this back layer fills: from its config (an open More fills the panel)
const has = (page, region) => { const B = page.config.back; return region === 'header' || (region === 'actions' ? (B.actions || []).length > 0 : region === 'controls' ? (B.controls || []).length > 0 : (B.panel || []).length > 0 || (page.back.more || []).length > 0); };
// a hidden back-layer header lifts everything below it by its height
const headerLift = (page, H) => page.back.headerHidden ? H.header : 0;
const moreOpen = page => (page.back.more || []).length > 0;
// with geometry, a revealed panel is held to the room above the front layer's header (its top, capped); taller content scrolls
export function regions(page, look, measured, g) {
  const ex = page.back.expanded, more = moreOpen(page), H = regionHeights(page, look, measured), lift = headerLift(page, H), out = [];
  const front = g && ex ? frontLayer(page, g, look, { measured }).top : Infinity;
  let top = -lift;
  for (const region of BACK_REGIONS) {
    if (!has(page, region)) continue;
    const panel = region === 'panel', shown = more ? panel : !panel || ex, at = more && panel ? 0 : top;
    const height = panel ? Math.min(H.panel, Math.max(0, front - at)) : H[region];
    out.push({ region, top: at, height, opacity: shown ? 1 : 0, interactive: shown, scrolls: panel && H.panel > height });
    top += H[region];
  }
  return out;
}
const backHeight = (page, look, measured, expanded) => { const H = regionHeights(page, look, measured); return moreOpen(page) ? H.panel : H.header + H.actions + H.controls + (expanded ? H.panel : 0) - headerLift(page, H); };

// conditions in design values (same Condition as config, §1): env keys + page-state paths
const readPath = (o, p) => p.split('.').reduce((x, k) => x == null ? x : x[k], o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function holds(k, ctx) {
  if (!k) return true;
  if ('not' in k) return !holds(k.not, ctx);
  if ('all' in k) return k.all.every(x => holds(x, ctx));
  if ('any' in k) return k.any.some(x => holds(x, ctx));
  if ('env' in k) return same(ctx.env ? ctx.env[k.env] : undefined, k.equals);
  if ('path' in k) return same(ctx.page ? readPath(ctx.page, k.path) : undefined, k.equals);
  return false;
}

// a design value → a plain value: tokens, surface roles, placement variants and conditions resolved (§15 VisualValue)
export function resolveValue(specs, comp, v, ctx = {}, depth = 0) {
  if (depth > 8 || v === null || typeof v !== 'object') return v;
  const again = x => resolveValue(specs, comp, x, ctx, depth + 1);
  if ('token' in v) return specs.tokens[v.token];
  if ('role' in v) { const S = ctx.surface && specs.components[ctx.surface]; return S && S.provides && v.role in S.provides ? resolveValue(specs, ctx.surface, S.provides[v.role], {}, depth + 1) : undefined; }
  if ('variant' in v) { const C = specs.components[comp] || {}, ax = (C.variants || {})[v.variant]; const pick = (C.picks && C.picks[v.variant]) || (ctx.variant && ctx.variant[v.variant]) || (ax && ax.default); return again(v.cases[pick]); }   // a child's pick, else the hire's, else the default
  if ('if' in v) return again(holds(v.if, ctx) ? v.then : v.else);
  return v;
}

// a component's visuals for a state from the registry (§15); ctx.over: a hire's own visuals over them
export function resolveVisuals(specs, componentId, stateName, ctx = {}) {
  const C = componentId && specs.components[componentId]; if (!C || !C.visuals) return {};
  const out = {}, over = ctx.over || {}, V = { ...C.visuals };
  for (const v in over) V[v] = { ...(V[v] || {}), ...over[v] };   // a hire's own visuals win, per visual and state
  for (const v in V) {
    const row = V[v], st = (ctx.status || []).find(x => row[x] !== undefined);
    const val = row[stateName] !== undefined ? row[stateName] : st !== undefined ? row[st] : row.default;
    out[v] = resolveValue(specs, componentId, val, ctx);
  }
  return out;
}

export function frontLayer(page, g, look, ctx = {}, peek = 0) {
  const ex = page.back.expanded, full = page.config.front.collapse === 'full';
  const st = !ex ? 'expanded' : full ? 'fullyCollapsed' : 'partlyCollapsed';
  const visual = look.visuals({ contract: 'frontLayer', page: pageId(page), within: ['backdropPage'] }, st, { page }) || {};
  const hh = +visual.headerHeight || 0, cap = g.contentHeight - hh;
  const raw = ex && full ? cap : backHeight(page, look, ctx.measured, ex) + (ex ? 0 : peek);
  return { top: Math.max(0, Math.min(raw, cap)), state: st, visual };
}

// motion (§14 / §15 motions): generic — a template names a declared motion; params resolve tokens and take the motion's defaults
export function resolveMotion(specs, tpl, extra = {}) {
  if (!tpl) return { kind: 'instant' };
  const kind = tpl.kind || tpl.motion;
  if (!kind || kind === 'instant') return { kind: 'instant' };
  const M = (specs.motions || {})[kind]; if (!M) return { kind: 'instant' };
  const tok = r => r && typeof r === 'object' && 'token' in r ? specs.tokens[r.token] : r;
  const out = { kind };
  for (const [p, d] of Object.entries(M.params || {})) {
    const v = p in extra ? extra[p] : p in tpl ? tok(tpl[p]) : d.default;
    if (v !== undefined) out[p] = v;
  }
  return out;
}
// 17.0: every field a pattern gives must match the event (signedIn: the session after the change; motion: default 'default')
const matches = (on, ev) => Object.keys(on).every(k => k === 'event' ? on.event === ev.type : k === 'signedIn' ? !!(ev.session && ev.session.signedIn === on.signedIn) : k === 'motion' ? on.motion === (ev.motion || 'default') : on[k] === ev[k]);
const ruleFor = (event, specs) => specs.choreography.rules.find(r => matches(r.on, event));
// 17.0 steps: tokens, ByEvent and sequences resolved; measures stay for the platform
function resolveStepValue(specs, v, event, params) {
  if (typeof v === 'string' && v[0] === '$' && params && v.slice(1) in params) return resolveStepValue(specs, params[v.slice(1)], event, null);
  if (Array.isArray(v)) return v.map(x => resolveStepValue(specs, x, event, params));
  if (!v || typeof v !== 'object') return v;
  if ('token' in v && Object.keys(v).length === 1) return specs.tokens[v.token];
  if ('by' in v && 'cases' in v) { const k = event ? String(event[v.by]) : undefined; return k in v.cases ? resolveStepValue(specs, v.cases[k], event, params) : null; }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveStepValue(specs, x, event, params)]));
}
function resolveSteps(specs, steps, event, params) {
  return (steps || []).flatMap(s => {
    if (s.do !== 'use') return [resolveStepValue(specs, s, event, params)];
    const Q = ((specs.choreography.sequences || {})[s.sequence]); if (!Q) return [];
    return resolveSteps(specs, Q.steps, event, { ...(params || {}), ...resolveStepValue(specs, s.with || {}, event, params) });
  });
}
export function stepsFor(event, specs, prefs) {
  if (prefs && prefs.reducedMotion) { const r = ruleFor(event, specs); return resolveSteps(specs, (r && r.reduced) || specs.choreography.reduced, event); }
  const r = ruleFor(event, specs); return r ? resolveSteps(specs, r.steps, event) : [];
}
export function componentSteps(specs, componentId, key, prefs) {
  const C = specs.components[componentId], steps = C && C.motion && C.motion[key];
  return steps ? resolveSteps(specs, steps, null) : [];
}
// TEMPORARY (17.0): the hand-built kinds, played through a rule's first KindStep
const kindOf = steps => (steps || []).find(s => s.do === 'kind');
export function transitionFor(event, specs, prefs, measure = {}) {
  const r = prefs && prefs.reducedMotion ? null : ruleFor(event, specs);
  const k = prefs && prefs.reducedMotion ? kindOf((ruleFor(event, specs) || {}).reduced || specs.choreography.reduced) : r && kindOf(r.steps);
  if (!k) return { kind: 'instant' };
  const extra = { ...('direction' in event ? { direction: event.direction || 0 } : {}), ...measure };
  return resolveMotion(specs, k, extra);
}
export function motionFor(specs, componentId, key, prefs) {
  const C = specs.components[componentId], tpl = C && C.motion && kindOf(C.motion[key]);
  if (!tpl) return { kind: 'instant' };
  if (prefs && prefs.reducedMotion) {
    const M = (specs.motions || {})[tpl.kind], r = M ? M.reduced : 'instant';
    return r === 'instant' ? { kind: 'instant' } : resolveMotion(specs, { ...tpl, kind: r });
  }
  return resolveMotion(specs, tpl);
}

// floating peek (wide): centred on content; sits on the front layer's edge when fully collapsed
export function peekPlacement(state, config, g, frontTop, page, look) {
  if (!sheetLayer(config) || !g.wide) return null;
  const h = look.size(PEEK, 'height'), w = Math.min(look.size(PEEK, 'maxWidth'), g.contentWidth - 32);
  const fully = page && page.back.expanded && page.config.front.collapse === 'full';
  return { top: fully ? frontTop - h / 2 : g.contentHeight - 16 - h, left: g.railWidth + (g.contentWidth - w) / 2, w, h };
}
