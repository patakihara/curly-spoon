// Backdrop Nav — LAYOUT (implements api.d.ts §14)
// Pure: state + design (+ shell measurements) → what to draw and how it moves. No pixels, no timers, no DOM.
// No size constants: sizes come from config (breakpoints, layer presentation) and design tokens.

const sheetLayer = config => config.layers.find(L => L.presentation.kind === 'sheet');

// facts about the current layout that design values may depend on (Condition env keys)
export function env(state, config, q) {
  const layout = q.layoutClass(state, config), S = sheetLayer(config);
  const open = !!(S && state.layers[S.id].open && layout === 'wide');
  return { layout, touch: !!state.device.touch, dir: q.dir ? q.dir(state, config) : 'ltr', sheet: !open ? 'none' : q.sideMode(state, config, S.id) === 'beside' ? 'beside' : 'over' };
}

export function geometry(state, config, q, specs) {
  const wide = q.layoutClass(state, config) === 'wide', S = sheetLayer(config);
  const side = S ? q.sideMode(state, config, S.id) : null;
  const sheetOpen = !!(S && state.layers[S.id].open);
  const navigation = (config.navigation && config.navigation[wide ? 'wide' : 'compact'] || {}).component || null;
  const rail = wide ? config.breakpoints.railWidth : 0;
  const navHeight = wide ? 0 : +(resolveVisuals(specs, navigation, 'enabled').height || 0);
  const peekHeight = wide || !S ? 0 : S.presentation.compact.peek.height;
  const width = state.device.width, height = state.device.height || 720;
  const contentWidth = width - rail - (wide && side === 'beside' && sheetOpen ? S.presentation.wide.width : 0);
  const contentHeight = height - navHeight - peekHeight;
  return { width, height, railWidth: rail, navHeight, peekHeight, contentWidth, contentHeight, side, wide, navigation };
}

// back-layer regions: fade if in one layout; static if shared & stays put; crossfade if shared & moved
// a bar region with an expanded slot shrinks from expandedHeight to height over the first (expandedHeight − height) of scroll (progress 0 → 1; collapse-first, 15.0)
const scrollOf = page => { const pol = page.config.kind === 'appBar' ? page.config.policy.scroll : page.config.policy.front.scroll, v = page.config.kind === 'appBar' ? page.scroll : page.front.scroll; if (!pol.scope) return +v || 0; const k = pol.scope.split('.').reduce((x, y) => x == null ? x : x[y], page); return v && k in v ? +v[k] || 0 : +pol.default || 0; };
const progressOf = (scroll, from, to) => from > to ? Math.max(0, Math.min(1, scroll / (from - to))) : 1;
let curPage = null;   // regions() sets it so heights can read the page's scroll
const regionHeight = (B, id, measured) => {
  const R = B.regions[id], h = R.height;
  if (R.kind === 'bar' && R.expandedHeight && curPage) return R.expandedHeight - (R.expandedHeight - h) * progressOf(scrollOf(curPage), R.expandedHeight, h);
  return h === 'content' ? +((measured || {})[id] || 0) : h;
};
export function barView(page, specs) {
  if (page.config.kind === 'appBar') {
    const V = resolveVisuals(specs, page.config.header.component, 'enabled', { page }), hasX = !!(page.config.header.slots && page.config.header.slots.expanded && page.config.header.slots.expanded.length);
    const h = +V.height || 0, x = hasX ? +V.expandedHeight || h : h, p = progressOf(scrollOf(page), x, h);
    return { height: x - (x - h) * p, progress: p, distance: Math.max(0, x - h) };
  }
  const R = page.config.back.regions.header; if (!R) return { height: 0, progress: 1, distance: 0 };
  const x = R.expandedHeight || R.height, p = progressOf(scrollOf(page), x, R.height);   // from the scroll only: expanding the back layer keeps the detail info
  return { height: x - (x - R.height) * p, progress: p, distance: Math.max(0, x - R.height) };
}
// 15.0: scroll is collapse-first — 0 … distance collapses the bar (content still), beyond it the content scrolls
export function contentOffset(page, specs) { return Math.max(0, scrollOf(page) - barView(page, specs).distance); }
const layoutHeight = (B, L, measured) => L.reduce((s, id) => s + regionHeight(B, id, measured), 0);
const topIn = (B, L, id, measured) => layoutHeight(B, L.slice(0, L.indexOf(id)), measured);
// a hidden back-layer header lifts everything below it by its height
const headerLift = page => { const H = page.config.back.regions.header; return page.back.headerHidden && H ? H.height : 0; };
const staysPut = (B, id) => { const C = B.layouts.concealed, X = B.layouts.expanded; return C.slice(0, C.indexOf(id)).join('|') === X.slice(0, X.indexOf(id)).join('|'); };
export function regions(page, measured) {
  curPage = page;
  const B = page.config.back, ex = page.back.expanded, C = B.layouts.concealed, X = B.layouts.expanded, out = [], lift = headerLift(page);
  for (const id in B.regions) {
    const inC = C.includes(id), inX = X.includes(id);
    const height = regionHeight(B, id, measured);
    if (inC && inX && staysPut(B, id)) { out.push({ region: id, top: topIn(B, C, id, measured) - lift, height, opacity: 1, interactive: true }); continue; }
    if (inC) out.push({ region: id, top: topIn(B, C, id, measured) - lift, height, opacity: ex ? 0 : 1, interactive: !ex });
    if (inX) out.push({ region: id, top: topIn(B, X, id, measured) - lift, height, opacity: ex ? 1 : 0, interactive: ex });
  }
  curPage = null;
  return out;
}

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
  if ('variant' in v) { const C = specs.components[comp] || {}, ax = (C.variants || {})[v.variant]; const pick = (ctx.variant && ctx.variant[v.variant]) || (ax && ax.default); return again(v.cases[pick]); }
  if ('if' in v) return again(holds(v.if, ctx) ? v.then : v.else);
  return v;
}

// a component's visuals for a state from the registry (§15)
export function resolveVisuals(specs, componentId, stateName, ctx = {}) {
  const C = componentId && specs.components[componentId]; if (!C || !C.visuals) return {};
  const out = {};
  for (const v in C.visuals) {
    const row = C.visuals[v], st = (ctx.status || []).find(x => row[x] !== undefined);
    const val = row[stateName] !== undefined ? row[stateName] : st !== undefined ? row[st] : row.default;
    out[v] = resolveValue(specs, componentId, val, ctx);
  }
  return out;
}

// 16.0: the design component implementing a page / surface role (design registers exactly one — rule)
export function componentFor(specs, role) {
  const ids = Object.keys(specs.components || {}).filter(id => (specs.components[id].implements || []).includes(role));
  return ids.length ? ids[0] : null;
}

export function frontLayer(page, g, specs, ctx = {}, peek = 0) {
  const B = page.config.back, ex = page.back.expanded, full = page.config.front.collapse === 'full';
  const st = !ex ? 'expanded' : full ? 'fullyCollapsed' : 'partlyCollapsed';
  const visual = resolveVisuals(specs, componentFor(specs, 'frontLayer'), st, { env: ctx.env, page });
  const hh = +visual.headerHeight || 0, cap = g.contentHeight - hh;
  curPage = page;
  const raw = ex && full ? cap : layoutHeight(B, ex ? B.layouts.expanded : B.layouts.concealed, ctx.measured) + (ex ? 0 : peek) - headerLift(page);
  curPage = null;
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
export function peekPlacement(state, config, g, frontTop, page) {
  const L = config.layers.find(l => l.presentation.kind === 'sheet');
  if (!L || !g.wide) return null;
  const P = L.presentation.wide.peek, w = Math.min(P.maxWidth, g.contentWidth - 32);
  const fully = page && page.back.expanded && page.config.front.collapse === 'full';
  return { top: fully ? frontTop - P.height / 2 : g.contentHeight - 16 - P.height, left: g.railWidth + (g.contentWidth - w) / 2, w, h: P.height };
}
