// Backdrop Nav — INVARIANTS
// Rules every implementation of api.d.ts must keep. Rules find their own subjects in the config
// (by properties, never by name) and SKIP when the config has none.
//
// runInvariants(createModel, fixtures) → [{ name, ok, skipped?, error? }]
// fixtures = {
//   config:  AppConfig,
//   data:    DataSource,
//   devices: Device[]                        // any set; rules pick touch/pointer/compact/wide as needed
//   item(model, kind): ItemData | undefined  // a navigable item of kind 'backdrop' | 'appBar' in the active deck's front content
//   link(model, layerId): ItemData | undefined   // an item in a layer's base page that opens deck content
// }

const S = m => m.getState();
const top = (m, deck) => { const st = S(m).decks[deck].stack; return st[st.length - 1]; };
const depth = (m, deck) => S(m).decks[deck].stack.length;
const ldepth = (m, layer) => S(m).layers[layer].stack.length;
const assert = (c, msg) => { if (!c) throw new Error(msg); };
class Skip extends Error {}
const skip = msg => { throw new Skip(msg); };
const need = (v, msg) => v || skip(msg);
// a back layer's param-control rows, and the rows of every More inside them
const backRowsOf = B => [...(B.controls || []), ...(B.panel || [])];   // a back layer's rows: controls, then panel
const rowsDeep = (rows, k = 0) => k > 8 ? [] : (rows || []).flatMap(r => [r, ...r.controls.filter(x => x.more).flatMap(x => rowsDeep(x.more.paramControls, k + 1))]);

const BASE_SWITCH = ['deckSwitch', 'layerOpen', 'layerClose'];
const resets = (policy, ev) => !!policy && (policy.resetOn.includes(ev) || (policy.resetOn.includes('baseSwitch') && BASE_SWITCH.includes(ev)));
const compactMax = f => f.config.breakpoints.compactMax;
const dev = {
  touch: f => f.devices.find(d => d.touch),
  pointer: f => f.devices.find(d => !d.touch),
  touchCompact: f => f.devices.find(d => d.touch && d.width < compactMax(f)),
  any: f => f.devices[0]
};
const otherDeck = (f, not) => f.config.decks.find(d => d.id !== not);
const rp = (o, p) => p.split('.').reduce((x, k) => x == null ? x : x[k], o);
// slots: plain refs, or repeats (their ref); bars are refs (role bar / frontHeader / appBar / peek) whose slots hold the items
const slotRefs = list => (list || []).flatMap(x => !x ? [] : 'repeat' in x ? [x.ref] : [x]);
const barRefs = b => b ? [b] : [];
const contentOf = p => p.kind === 'appBar' ? p.content || null : p.front.content;
const appBarRefs = p => [p.header, ...slotRefs(p.body), ...(p.sheet ? [p.sheet.header] : [])].filter(Boolean);
// every bar in the config (+ one level of item pages from the data), with the page it belongs to (null for peeks); slot regions count as bars
const headersOf = (f, m) => {
  const out = [], add = (h, page) => { if (h) out.push({ h, page }); };
  const pageHeaders = p => { if (!p || p.kind === 'layerPage') return; if (p.kind === 'appBar') { add(p.header, p); if (p.body) add({ component: '-', slots: { body: p.body } }, p); if (p.sheet) add(p.sheet.header, p); } else { Object.values(p.back.regions).forEach(r => r.kind === 'bar' ? add(r.bar, p) : add({ component: '-', slots: { content: r.content || [] } }, p)); add(p.front.header, p); } };
  f.config.decks.forEach(D => pageHeaders(D.page));
  f.config.layers.forEach(L => { Object.values(L.pages.set).forEach(pageHeaders); const P = L.presentation; if (P.kind === 'sheet') { add(P.compact.peek.header, null); add(P.wide.peek.header, null); } });
  ((f.config.session && f.config.session.gates) || []).forEach(g => pageHeaders(g.page));
  Object.values(f.config.pages || {}).forEach(pageHeaders);   // page templates
  return out;
};
const pagesOf = (f, m) => {
  const out = [], add = p => { if (p && p.kind !== 'layerPage') out.push(p); };
  f.config.decks.forEach(D => add(D.page));
  f.config.layers.forEach(L => Object.values(L.pages.set).forEach(add));
  ((f.config.session && f.config.session.gates) || []).forEach(g => add(g.page));
  Object.values(f.config.pages || {}).forEach(add);   // page templates
  return out;
};
// 16.0: the page / surface roles the config uses
const surfaceRolesOf = (f, m) => {
  const ps = pagesOf(f, m), used = new Set();
  if (ps.some(p => p.kind === 'backdrop')) ['backdropPage', 'backLayer', 'frontLayer'].forEach(r => used.add(r));
  if (ps.some(p => p.kind === 'appBar')) used.add('appBarPage');
  if (ps.some(p => p.kind === 'appBar' && p.sheet)) used.add('pageSheet');
  f.config.layers.forEach(L => { const r = { sheet: 'sheetLayer', drawer: 'drawerLayer', fullscreen: 'fullscreenLayer' }[L.presentation.kind]; if (r) used.add(r); });
  return used;
};
// every ref a page places (bars, regions, front header), with the page
const pageRefs = p => p.kind === 'appBar' ? appBarRefs(p).flatMap(allRefs)
  : [...Object.values(p.back.regions).flatMap(R => R.kind === 'bar' ? barRefs(R.bar) : slotRefs(R.content)), ...barRefs(p.front.header)].flatMap(allRefs);
const roleSlotsOf = (f, m) => [
  ...['compact', 'wide'].map(k => ({ ref: f.config.navigation && f.config.navigation[k], role: 'navigation', where: 'navigation.' + k })),
  ...f.config.layers.filter(L => L.presentation.kind === 'sheet').flatMap(L => [{ ref: L.presentation.compact.peek.header, role: 'peek', where: L.id + ' compact peek' }, { ref: L.presentation.wide.peek.header, role: 'peek', where: L.id + ' wide peek' }]),
  ...pagesOf(f, m).flatMap(p => {
  const out = [], cc = contentOf(p), sheetCc = p.kind === 'appBar' && p.sheet ? p.sheet.content : null;
  pageRefs(p).forEach(r => { if (r.bind && !r.bind.player) out.push({ ref: r, role: 'input', where: p.id + ' control for ' + JSON.stringify(r.bind), page: p }); });
  if (p.kind === 'backdrop') {
    const e = slotRefs(((p.front.header || {}).slots || {}).start); out.push({ ref: e[0], role: 'disclosure', where: p.id + ' front header start' });
    out.push({ ref: p.front.header, role: 'frontHeader', where: p.id + ' front header' });
    Object.entries(p.back.regions).forEach(([id, R]) => { if (R.kind === 'bar') out.push({ ref: R.bar, role: 'bar', where: p.id + ' back ' + id }); });
  } else { out.push({ ref: p.header, role: 'appBar', where: p.id + ' app bar' }); if (p.sheet) out.push({ ref: p.sheet.header, role: 'bar', where: p.id + ' sheet header' }); }
  [cc, sheetCc].filter(Boolean).forEach(c => Object.entries(c.presentations || {}).forEach(([k, P]) => { out.push({ ref: P.item, role: 'item', where: p.id + ' presentation ' + k }); out.push({ ref: P.layout, role: 'layout', where: p.id + ' layout ' + k }); }));
  return out;
})];
// every placement the config makes, with the surface it sits on (null: the component is itself a surface)
const placementsOf = (f, m) => {
  const out = [], put = (ref, surface, where) => ref && allRefs(ref).forEach(r => out.push({ ref: r, surface, where }));
  pagesOf(f, m).forEach(p => {
    if (p.kind === 'appBar') { put(p.header, null, p.id + ' header'); slotRefs(p.body).forEach(r => put(r, 'appBar', p.id + ' body')); Object.values((p.content || {}).presentations || {}).forEach(P => { put(P.layout, 'appBar', p.id + ' layout'); put(P.item, 'appBar', p.id + ' items'); });
      if (p.sheet) { put(p.sheet.header, 'bottomSheet', p.id + ' sheet header'); Object.values(p.sheet.content.presentations || {}).forEach(P => { put(P.layout, 'bottomSheet', p.id + ' sheet layout'); put(P.item, 'bottomSheet', p.id + ' sheet items'); }); } return; }
    Object.entries(p.back.regions).forEach(([id, R]) => (R.kind === 'bar' ? barRefs(R.bar) : slotRefs(R.content)).forEach(r => put(r, 'backLayer', p.id + ' ' + id)));
    put(p.front.header, 'frontLayer', p.id + ' front header');
    Object.values(p.front.content.presentations || {}).forEach(P => { put(P.layout, 'frontLayer', p.id + ' layout'); put(P.item, 'frontLayer', p.id + ' items'); });
  });
  ['compact', 'wide'].forEach(k => put(f.config.navigation && f.config.navigation[k], null, 'navigation.' + k));
  return out;
};
const rolesUsed = v => !v || typeof v !== 'object' ? [] : 'role' in v ? [v.role] : 'cases' in v ? Object.values(v.cases).flatMap(rolesUsed) : 'if' in v ? [...rolesUsed(v.then), ...rolesUsed(v.else)] : [];
const allRefs = r => [r, ...Object.values(r.slots || {}).flatMap(slotRefs).flatMap(allRefs)];
const refsOfHeader = h => barRefs(h).flatMap(allRefs).filter(x => x.component !== '-');
// a deck with a param matching pred(spec, name)
const resolvedOptions = (f, D, k, P) => { if (!P.options || Array.isArray(P.options)) return P; const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id }); return { ...P, options: m.query.paramOptions(S(m), m.config, m.query.underPage(S(m)), k) }; };
const paramDeck = (f, pred) => { for (const D of f.config.decks) for (const [k, P0] of Object.entries(D.page.params || {})) { const P = resolvedOptions(f, D, k, P0); if (pred(P, k)) return { D, k, P }; } return null; };
const optVals = P => Array.isArray(P.options) ? P.options.map(o => o.value) : [];
const pval = (m, k) => { const u = m.query.underPage(S(m)), pol = u.config.statePolicy.params[k], v = u.params[k]; if (!pol || !pol.scope) return v; const key = rp(u, pol.scope); return v && key in v ? v[key] : pol.default; };
// a valid value of a param's type that differs from v
const otherValue = (P, v) => P.type === 'choice' ? optVals(P).find(x => x !== v) : P.type === 'choices' ? [optVals(P)[0]] : P.type === 'text' ? 'a b/c' : P.type === 'flag' ? !v
  : P.type === 'number' ? (P.range ? [P.min ?? 1, P.max ?? 2] : (v === (P.min ?? 1) ? (P.min ?? 1) + 1 : P.min ?? 1)) : P.range ? ['2026-01-01', '2026-02-01'] : '2026-10-03';
// pages with a collapsing bar (15.0 rules): every deck, items of either kind, up to two levels deep → [{ m, kind }]
const collapsingPages = (f, P, sp) => {
  const out = [];
  f.config.decks.forEach(D => ['backdrop', 'appBar'].forEach(kind => {
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id });
    for (let depth = 0; depth < 2; depth++) {
      const it = f.item(m, kind) || (depth === 0 && kind === 'appBar' ? f.item(m, 'backdrop') : null); if (!it) return;
      m.dispatch({ type: 'open', item: it, origin: { deck: D.id } });
      if (P.barView(m.query.currentPage(S(m)), LOOK(m)).distance > 0) { out.push({ m, kind: D.id + ' ' + kind }); return; }
    }
  }));
  return out;
};
const openItem = (m, f, kind, deck) => {
  const it = need(f.item(m, kind), 'no ' + kind + ' item in ' + deck);
  m.dispatch({ type: 'open', item: it, origin: { deck } });
};

export const INVARIANTS = [
  // ── structure
  ['stacks are never empty', f => {
    const m = f.mk(dev.any(f));
    for (let i = 0; i < 6; i++) m.dispatch({ type: 'back' });
    Object.values(S(m).decks).forEach(d => assert(d.stack.length >= 1, 'empty deck stack'));
    Object.values(S(m).layers).forEach(l => assert(l.stack.length >= 1, 'empty layer stack'));
  }],
  ['a new page state equals its policy defaults', f => {
    const m = f.mk(dev.any(f)), start = f.config.startDeck;
    openItem(m, f, 'backdrop', start);
    const p = top(m, start).page, P = p.config.statePolicy;
    assert(p.back.expanded === P.back.expanded.default, 'back.expanded ≠ default');
    Object.keys(p.config.params || {}).forEach(k => assert(P.params[k].scope || JSON.stringify(p.params[k]) === JSON.stringify(P.params[k].default), 'params.' + k + ' ≠ default'));
  }],

  // ── decks are independent
  ['switching decks leaves other stacks untouched (unless their policy resets them)', f => {
    const start = f.config.startDeck, D = f.config.decks.find(d => d.id === start);
    if (resets(D.statePolicy && D.statePolicy.stack, 'deckSwitch')) skip('start deck resets on deckSwitch');
    const o = need(otherDeck(f, start), 'only one deck');
    const m = f.mk(dev.any(f));
    openItem(m, f, 'backdrop', start);
    const before = depth(m, start);
    m.dispatch({ type: 'switchDeck', deck: o.id });
    m.dispatch({ type: 'switchDeck', deck: start });
    assert(depth(m, start) === before, 'stack changed');
  }],
  ['every deck whose stack policy resets on deckSwitch is at its base when entered', f => {
    const subjects = f.config.decks.filter(d => resets(d.statePolicy && d.statePolicy.stack, 'deckSwitch'));
    need(subjects.length, 'no deck resets on deckSwitch');
    subjects.forEach(d => {
      const o = need(otherDeck(f, d.id), 'only one deck');
      const m = f.mk(dev.any(f));
      m.dispatch({ type: 'switchDeck', deck: d.id });
      openItem(m, f, 'backdrop', d.id);
      m.dispatch({ type: 'switchDeck', deck: o.id });
      m.dispatch({ type: 'switchDeck', deck: d.id });
      assert(depth(m, d.id) === 1, d.id + ' kept its stack');
    });
  }],
  ['reselecting the active deck pops to base', f => {
    const m = f.mk(dev.any(f)), start = f.config.startDeck;
    openItem(m, f, 'backdrop', start);
    const ev = m.dispatch({ type: 'reselectDeck', deck: start });
    assert(depth(m, start) === 1, 'not popped to base');
    assert(ev.some(e => e.type === 'popped' && e.target.deck === start), 'reselect emits no popped event (no motion)');
  }],
  ['changing a param emits paramChanged with its motion name (axis params carry the direction); no-op changes emit nothing', f => {
    const X = need(paramDeck(f, P => P.type === 'choice' && P.axis && optVals(P).length > 1), 'no axis param');
    const m = f.mk(dev.any(f)), o = optVals(X.P), set = v => m.dispatch({ type: 'setParams', values: { [X.k]: v } }).find(e => e.type === 'paramChanged');
    m.dispatch({ type: 'switchDeck', deck: X.D.id });
    set(o[0]);
    const e1 = set(o[1]); assert(e1 && e1.name === X.k && e1.motion === (X.P.motion || 'default') && e1.direction === 1, 'forward ' + JSON.stringify(e1));
    const e2 = set(o[0]); assert(e2 && e2.direction === -1, 'backward');
    assert(!set(o[0]), 'same value emitted paramChanged');
    const T = paramDeck(f, P => P.type === 'text');
    if (T) { const t = f.mk(dev.any(f)); t.dispatch({ type: 'switchDeck', deck: T.D.id }); const e = t.dispatch({ type: 'setParams', values: { [T.k]: 'zz' } }).find(e => e.type === 'paramChanged'); assert(e && e.direction === 0 && e.motion === (T.P.motion || 'default'), 'non-axis param carries a direction'); }
  }],

  ['param motions are design names: every param\'s motion has a paramChanged rule; a direction-taking motion follows the direction', f => {
    const sp = need(f.specs, 'no specs'), P = need(f.layout, 'no layout'), m = f.mk(dev.any(f));
    const names = new Set(sp.choreography.rules.filter(x => x.on.event === 'paramChanged').map(x => x.on.motion || '*'));
    let n = 0;
    pagesOf(f, m).forEach(p => Object.entries(p.params || {}).forEach(([k, S]) => { n++; const mo = S.motion || 'default'; assert(names.has(mo) || names.has('*'), p.id + '.' + k + ': motion ' + mo + ' has no paramChanged rule'); if (S.motion) assert(names.has(S.motion), p.id + '.' + k + ': motion ' + S.motion + ' is not declared by the choreography'); }));
    need(n, 'no params');
    const X = paramDeck(f, S => S.axis && S.motion);
    if (X) {
      const fwd = P.transitionFor({ type: 'paramChanged', name: X.k, motion: X.P.motion, direction: 1 }, sp, { reducedMotion: false }, {});
      const back = P.transitionFor({ type: 'paramChanged', name: X.k, motion: X.P.motion, direction: -1 }, sp, { reducedMotion: false }, {});
      if ('direction' in fwd) assert(fwd.direction === 1 && back.direction === -1, X.k + ': motion ignores direction');
    }
  }],

  ['popping back to a page resets exactly the fields whose policy resets on return', f => {
    const subjects = f.config.decks.filter(d => d.page.kind === 'backdrop');
    need(subjects.length, 'no backdrop deck');
    f.devices.forEach(dv => subjects.forEach(D => {
      const m = f.mk(dv), P = D.page.statePolicy, flipped = !P.back.expanded.default;
      m.dispatch({ type: 'switchDeck', deck: D.id });
      m.dispatch({ type: 'setExpanded', expanded: flipped });
      openItem(m, f, 'backdrop', D.id);
      m.dispatch({ type: 'up', target: { deck: D.id } });
      const got = top(m, D.id).page.back.expanded;
      assert(got === (resets(P.back.expanded, 'return') ? P.back.expanded.default : flipped), D.id + ' expanded after return: ' + got + ' @' + dv.width);
    }));
  }],
  ['reselecting at base resets exactly the fields whose policy resets on reselect', f => {
    const subjects = f.config.decks.filter(d => d.page.kind === 'backdrop');
    need(subjects.length, 'no backdrop deck');
    subjects.forEach(D => {
      const m = f.mk(dev.any(f)), P = D.page.statePolicy;
      m.dispatch({ type: 'switchDeck', deck: D.id });
      m.dispatch({ type: 'setExpanded', expanded: !P.back.expanded.default });
      m.dispatch({ type: 'scroll', top: 77 });
      const ev = m.dispatch({ type: 'reselectDeck', deck: D.id });
      const pg = top(m, D.id).page, sc = pg.front.scroll, scroll = typeof sc === 'number' ? sc : Object.values(sc)[0];
      assert(depth(m, D.id) === 1, D.id + ' left base');
      assert((pg.back.expanded === P.back.expanded.default) === resets(P.back.expanded, 'reselect'), D.id + ' expanded vs policy');
      assert(((scroll || 0) === 0) === resets(P.front.scroll, 'reselect'), D.id + ' scroll vs policy');
      if (resets(P.back.expanded, 'reselect')) assert(ev.some(e => e.type === 'expandedChanged'), D.id + ' no expandedChanged');
    });
  }],
  ['a layer whose open policy resets on deckSwitch closes when switching decks', f => {
    const subjects = f.config.layers.filter(L => resets(L.statePolicy.open, 'deckSwitch'));
    need(subjects.length, 'no layer closes on deckSwitch');
    subjects.forEach(L => {
      const m = f.mk(dev.any(f)), o = need(otherDeck(f, S(m).activeDeck), 'only one deck');
      m.dispatch({ type: 'openLayer', layer: L.id });
      const ev = m.dispatch({ type: 'switchDeck', deck: o.id });
      assert(!S(m).layers[L.id].open && ev.some(e => e.type === 'layerClosed' && e.layer === L.id), L.id + ' stayed open');
    });
  }],
  ['popping a layer page reports that page\'s kind', f => {
    const L = need(f.config.layers.find(l => Object.keys(l.pages.set).length > 1), 'no multi-page layer');
    const pid = Object.keys(L.pages.set).find(p => p !== L.pages.base), m = f.mk(dev.any(f));
    m.dispatch({ type: 'openLayer', layer: L.id });
    m.dispatch({ type: 'openLayerPage', layer: L.id, page: pid });
    const ev = m.dispatch({ type: 'up', target: { layer: L.id } });
    const e = ev.find(x => x.type === 'popped');
    assert(e && e.kind === L.pages.set[pid].kind, 'popped kind ' + (e && e.kind) + ' ≠ ' + L.pages.set[pid].kind);
  }],
  ['pointer: reselect drops the history records of the pages it removed', f => {
    const m = f.mk(need(dev.pointer(f), 'no pointer device')), start = f.config.startDeck;
    openItem(m, f, 'backdrop', start);
    openItem(m, f, 'backdrop', start);
    m.dispatch({ type: 'reselectDeck', deck: start });
    assert(!S(m).history.some(r => r.kind === 'push' && r.deck === start), 'stale push records');
  }],

  // ── routing
  ['every layer with a deck linkTarget pushes onto that deck without reset and activates it', f => {
    const subjects = f.config.layers.filter(L => L.linkTarget && L.linkTarget.deck);
    need(subjects.length, 'no layer with a deck linkTarget');
    subjects.forEach(L => {
      const target = L.linkTarget.deck, o = need(otherDeck(f, target), 'only one deck');
      const m = f.mk(dev.any(f));
      m.dispatch({ type: 'switchDeck', deck: target });
      openItem(m, f, 'backdrop', target);
      const before = depth(m, target);
      m.dispatch({ type: 'switchDeck', deck: o.id });
      m.dispatch({ type: 'openLayer', layer: L.id });
      m.dispatch({ type: 'open', item: need(f.link(m, L.id), L.id + ' has no deck link'), origin: { layer: L.id } });
      assert(depth(m, target) === before + 1, 'not pushed onto ' + target);
      assert(S(m).activeDeck === target, target + ' not activated');
    });
  }],
  ['back after a layer link reveals the previous page of the target deck', f => {
    const subjects = f.config.layers.filter(L => L.linkTarget && L.linkTarget.deck);
    need(subjects.length, 'no layer with a deck linkTarget');
    f.devices.forEach(d => subjects.forEach(L => {
      const target = L.linkTarget.deck, m = f.mk(d);
      m.dispatch({ type: 'switchDeck', deck: target });
      openItem(m, f, 'backdrop', target);
      const prevId = top(m, target).page.config.id;
      m.dispatch({ type: 'openLayer', layer: L.id });
      m.dispatch({ type: 'open', item: need(f.link(m, L.id), L.id + ' has no deck link'), origin: { layer: L.id } });
      m.dispatch({ type: 'focus', target });
      m.dispatch({ type: 'back' });
      assert(top(m, target).page.config.id === prevId, 'did not return to previous page (' + d.width + (d.touch ? ' touch' : ' pointer') + ')');
    }));
  }],

  // ── layers
  ['every layer whose stack resets on layerOpen starts at its base page', f => {
    const subjects = f.config.layers.filter(L => resets(L.statePolicy.stack, 'layerOpen') && Object.keys(L.pages.set).length > 1);
    need(subjects.length, 'no multi-page layer resets on layerOpen');
    subjects.forEach(L => {
      const m = f.mk(dev.any(f)), other = Object.keys(L.pages.set).find(p => p !== L.pages.base);
      m.dispatch({ type: 'openLayer', layer: L.id });
      m.dispatch({ type: 'openLayerPage', layer: L.id, page: other });
      m.dispatch({ type: 'closeLayer', layer: L.id });
      m.dispatch({ type: 'openLayer', layer: L.id });
      assert(ldepth(m, L.id) === 1, L.id + ' did not reset');
    });
  }],

  // ── back (touch: Android = browser)
  ['touch back order: layer → collapse → pop → start deck → exit', f => {
    const d = need(dev.touch(f), 'no touch device'), start = f.config.startDeck;
    const o = need(otherDeck(f, start), 'only one deck'), L = f.config.layers[0];
    const m = f.mk(d);
    m.dispatch({ type: 'switchDeck', deck: o.id });
    openItem(m, f, 'backdrop', o.id);
    m.dispatch({ type: 'setExpanded', expanded: true });
    if (L) m.dispatch({ type: 'openLayer', layer: L.id });
    const order = ['popLayer', 'closeLayer', 'collapse', 'resetParam', 'pop', 'startDeck', 'exit'], seq = [];
    for (let i = 0; i < 12; i++) {
      seq.push(m.query.backAction(S(m), m.config));
      if (m.dispatch({ type: 'back' }).some(e => e.type === 'exit')) break;
    }
    let k = 0;
    seq.forEach(a => { const j = order.indexOf(a); assert(j >= 0, 'unexpected action ' + a); assert(j >= k, 'order violated: ' + seq.join(' → ')); k = j; });
    assert(seq[seq.length - 1] === 'exit', 'never exits: ' + seq.join(' → '));
  }],
  ['touch history entries are derived from state (no bookkeeping)', f => {
    const m = f.mk(need(dev.touch(f), 'no touch device')), start = f.config.startDeck;
    const n0 = m.query.historyEntries(S(m), m.config).length;
    openItem(m, f, 'backdrop', start);
    assert(m.query.historyEntries(S(m), m.config).length === n0 + 1, 'push not reflected');
    m.dispatch({ type: 'back' });
    assert(m.query.historyEntries(S(m), m.config).length === n0, 'pop not reflected');
    assert(S(m).history.length === 0, 'touch model kept recorded history');
  }],

  // ── back (pointer: browser history)
  ['pointer back undoes the last recorded navigation', f => {
    const m = f.mk(need(dev.pointer(f), 'no pointer device')), start = f.config.startDeck;
    const o = need(otherDeck(f, start), 'only one deck');
    m.dispatch({ type: 'switchDeck', deck: o.id });
    m.dispatch({ type: 'back' });
    assert(S(m).activeDeck === start, 'deck switch not undone');
  }],
  ['pointer: a layer enters history iff its history mode is record', f => {
    const ptr = f.devices.filter(d => !d.touch);
    need(ptr.length && f.config.layers.length, 'no pointer device or no layers');
    ptr.forEach(d => f.config.layers.forEach(L => {
      const m = f.mk(d), mode = m.query.historyMode(S(m), m.config, L), n0 = S(m).history.length;
      m.dispatch({ type: 'openLayer', layer: L.id });
      const recorded = S(m).history.length > n0;
      assert(recorded === (mode === 'record'), L.id + ' (' + mode + ') recorded=' + recorded);
    }));
  }],

  // ── layout
  ['layout class is compact iff width < compactMax', f => {
    f.devices.forEach(d => {
      const m = f.mk(d), want = d.width < compactMax(f) ? 'compact' : 'wide';
      assert(m.query.layoutClass(S(m), m.config) === want, d.width + ' → ' + m.query.layoutClass(S(m), m.config));
    });
  }],
  ['sheet side mode: compact → none; room → beside; else touch → modal, pointer → auto', f => {
    const sheets = f.config.layers.filter(L => L.presentation.kind === 'sheet');
    need(sheets.length, 'no sheet layers');
    const B = f.config.breakpoints, Z = f.sizes || { railWidth: 0, sideSheetWidth: 0 };   // 18.0: widths from design through composition
    f.devices.forEach(d => sheets.forEach(L => {
      const m = f.mk(d);
      const want = d.width < B.compactMax ? null
        : d.width - Z.railWidth - Z.sideSheetWidth >= B.minContent ? 'beside'
        : d.touch ? 'modal' : 'auto';
      const got = m.query.sideMode(S(m), m.config, L.id);
      assert(got === want, L.id + ' @' + d.width + (d.touch ? 't' : 'p') + ': ' + got + ' ≠ ' + want);
    }));
  }],

  // ── overlay (§9)
  ['back closes the topmost blocking overlay before anything else', f => {
    const dlg = need(f.sampleDialog, 'no sample dialog');
    f.devices.forEach(d => {
      const m = f.mk(d), start = f.config.startDeck;
      openItem(m, f, 'backdrop', start);
      const before = depth(m, start);
      m.dispatch({ type: 'openOverlay', overlay: dlg });
      assert(m.query.backAction(S(m), m.config) === 'closeOverlay', 'back does not target overlay');
      m.dispatch({ type: 'back' });
      assert(S(m).overlays.length === 0 && depth(m, start) === before, 'overlay not closed first');
    });
  }],
  ['non-blocking overlays never capture back', f => {
    const sn = need(f.sampleSnackbar, 'no sample snackbar');
    const m = f.mk(dev.any(f));
    m.dispatch({ type: 'openOverlay', overlay: sn });
    assert(m.query.backAction(S(m), m.config) !== 'closeOverlay', 'snackbar captured back');
  }],

  // ── session (§10)
  ['signing out resets every stack and shows the first matching gate', f => {
    need(f.config.session && f.config.session.gates.length, 'no session gates');
    const m = f.mk(dev.any(f)), start = f.config.startDeck;
    openItem(m, f, 'backdrop', start);
    m.dispatch({ type: 'session', event: { type: 'signedOut' } });
    Object.values(S(m).decks).forEach(d => assert(d.stack.length === 1, 'stack survived sign-out'));
    const want = f.config.session.gates.find(g => g.when === 'signedOut');
    assert(m.query.gate(S(m), m.config) === (want ? want.id : null), 'wrong gate');
    m.dispatch({ type: 'session', event: { type: 'signedIn' } });
    assert(m.query.gate(S(m), m.config) === null || m.query.gate(S(m), m.config) !== (want && want.id), 'gate stuck after sign-in');
  }],

  // ── route (§11)
  ['navigateUrl(url(state)) reproduces the destination: deck stack + top-page params, a recorded layer, a gate', f => {
    const R = need(f.config.routes, 'no routes'), start = f.config.startDeck;
    const ids = s => s.decks[s.activeDeck].stack.map(e => e.page.config.id).join('|');
    const tp = s => { const st = s.decks[s.activeDeck].stack, p = st[st.length - 1].page; return JSON.stringify(Object.fromEntries(Object.entries(p.config.params || {}).filter(([, P]) => P.url).map(([k, P]) => [k, P.type === 'text' ? String(p.params[k]).toLowerCase() : p.params[k]]))); };
    // deck: lower pages' params stay out of the URL
    const m = f.mk(dev.any(f));
    const setAll = () => { const u = m.query.underPage(S(m)), vals = {}; Object.entries(u.config.params || {}).forEach(([k, P]) => { if (P.url) vals[k] = otherValue(P.options ? { ...P, options: m.query.paramOptions(S(m), m.config, u, k) } : P, m.query.contentParams(u)[k] ?? u.params[k]); }); if (Object.keys(vals).length) m.dispatch({ type: 'setParams', values: vals }); };
    if ((R.params || 'none') !== 'none') setAll();
    const baseUrl = m.query.url(S(m), m.config);
    openItem(m, f, 'backdrop', start); openItem(m, f, 'backdrop', start);
    if ((R.params || 'none') !== 'none') setAll();
    const url = m.query.url(S(m), m.config);
    assert(url === url.toLowerCase() || url.includes('%'), 'URL not lowercase: ' + url);
    const m2 = f.mk(dev.any(f)); m2.dispatch({ type: 'navigateUrl', url });
    assert(ids(S(m2)) === ids(S(m)), 'stack differs after round trip: ' + url);
    assert(tp(S(m2)) === tp(S(m)), 'top-page params differ after round trip: ' + url);
    assert(m2.query.url(S(m2), m2.config) === url, 'url not stable: ' + url);
    if (baseUrl.includes('?')) { const b2 = S(m2).decks[S(m2).activeDeck].stack[0].page; Object.keys(b2.config.params || {}).forEach(k => assert(JSON.stringify(b2.params[k]) === JSON.stringify(b2.config.statePolicy.params[k].default), 'a lower page\'s param ' + k + ' came through the URL')); }
    const m3 = f.mk(dev.any(f)); m3.dispatch({ type: 'navigateUrl', url: url.toUpperCase() });
    assert(m3.query.url(S(m3), m3.config) === url, 'matching is case-sensitive: ' + url.toUpperCase());
    // layer: its own destination; closing it returns to the deck URL
    const L = f.config.layers.find(L => m.query.historyMode(S(m), m.config, L) === 'record' && R.layer && R.layer[L.id]);
    if (L) {
      m.dispatch({ type: 'openLayer', layer: L.id });
      const other = Object.keys(L.pages.set).find(p => p !== L.pages.base); if (other) m.dispatch({ type: 'openLayerPage', layer: L.id, page: other });
      const lu = m.query.url(S(m), m.config);
      assert(lu.startsWith(R.base + R.layer[L.id]), 'layer is not the destination: ' + lu);
      const m4 = f.mk(dev.any(f)); m4.dispatch({ type: 'navigateUrl', url: lu });
      assert(S(m4).layers[L.id].open && S(m4).layers[L.id].stack.map(e => e.page.config.id).join('|') === S(m).layers[L.id].stack.map(e => e.page.config.id).join('|'), 'layer differs after round trip: ' + lu);
      assert(m4.query.url(S(m4), m4.config) === lu, 'layer url not stable');
      m.dispatch({ type: 'closeLayer', layer: L.id });
      assert(m.query.url(S(m), m.config) === url, 'closing the layer does not return to the deck URL');
      m4.dispatch({ type: 'navigateUrl', url }); assert(!S(m4).layers[L.id].open, 'a deck URL left the layer open');
    }
    // gate: its own destination while it applies
    const G = ((f.config.session && f.config.session.gates) || []).find(g => g.when === 'signedOut' && R.gate && R.gate[g.id]);
    if (G) {
      const g = f.mk(dev.any(f)); g.dispatch({ type: 'session', event: { type: 'signedOut' } });
      assert(g.query.url(S(g), g.config) === R.base + R.gate[G.id], 'gate is not the destination');
      const h = f.mk(dev.any(f)); h.dispatch({ type: 'navigateUrl', url: R.base + R.gate[G.id] });
      assert(S(h).activeDeck === start && h.query.url(S(h), h.config) === R.base + R.deck[start], 'a gate URL that does not apply did not go to the start deck');
    }
  }],

  ['URL segments are slugs: route names are lowercase slugs; sibling items have distinct slugs', f => {
    const R = need(f.config.routes, 'no routes'), ok = x => /^[a-z0-9-]+$/.test(x);
    [...Object.values(R.deck), ...Object.values(R.layer || {}), ...Object.values(R.gate || {})].forEach(x => assert(ok(x), 'route name ' + x + ' is not a slug'));
    const sl = x => String(x).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, '-').replace(/^-+|-+$/g, '');
    f.config.layers.forEach(L => { const k = Object.keys(L.pages.set).map(sl); assert(new Set(k).size === k.length, L.id + ': page keys collide as slugs'); });
    const m = f.mk(dev.any(f));
    f.config.decks.forEach(D => { const st = f.mk(dev.any(f)); st.dispatch({ type: 'switchDeck', deck: D.id }); const u = st.query.underPage(S(st)), items = (f.data.get(D.page.front.content.dataSource, st.query.contentParams(u)).items) || []; const k = items.map(i => sl(i.id)); assert(new Set(k).size === k.length, D.id + ': sibling items collide as slugs'); });
  }],
  ['transient UI never appears in the URL', f => {
    need(f.config.routes, 'no routes');
    const m = f.mk(dev.any(f)), u0 = m.query.url(S(m), m.config);
    m.dispatch({ type: 'setExpanded', expanded: !m.query.underPage(S(m)).back.expanded });
    if (f.sampleDialog) m.dispatch({ type: 'openOverlay', overlay: f.sampleDialog });
    f.config.layers.filter(L => m.query.historyMode(S(m), m.config, L) !== 'record').forEach(L => m.dispatch({ type: 'openLayer', layer: L.id }));
    assert(m.query.url(S(m), m.config) === u0, 'url changed for transient UI');
  }],

  // ── persist (§12)
  ['restore(snapshot(state)) reproduces every persisted field', f => {
    need(f.config.persist, 'no persist policy');
    const m = f.mk(dev.any(f)), start = f.config.startDeck;
    openItem(m, f, 'backdrop', start);
    { const u = m.query.underPage(S(m)), v = u.config.front.content.view; if (v) m.dispatch({ type: 'setParams', values: { [v]: optVals(u.config.params[v]).find(x => x !== u.params[v]) } }); }
    m.dispatch({ type: 'scroll', top: 123 });
    const snap = m.query.snapshot(S(m), m.config);
    const m2 = f.mk(dev.any(f));
    m2.dispatch({ type: 'restore', snapshot: JSON.parse(JSON.stringify(snap)) });
    const snap2 = m2.query.snapshot(S(m2), m2.config);
    assert(JSON.stringify(snap2) === JSON.stringify(snap), 'snapshot differs after restore');
  }],

  // ── shortcuts
  ['every shortcut maps to an intent the model accepts', f => {
    const sc = need(f.config.shortcuts && f.config.shortcuts.length && f.config.shortcuts, 'no shortcuts');
    const m = f.mk(need(dev.pointer(f), 'no pointer device'));
    sc.forEach(x => { const i = m.query.intentForShortcut(S(m), m.config, x.keys); assert(i, x.keys + ' unmapped'); m.dispatch(i); });
  }],

  // ── player (§13)
  ['player: every playQueue / enqueue that takes effect yields exactly one queued event with its position', f => {
    const X = need(f.interaction && f.interaction.playerAction, 'no playerAction'), mk = need(f.createPlayer, 'no player'), T = f.tracks(3);
    const p = mk(), pos = r => r.events.length === 1 && r.events[0].type === 'queued' ? r.events[0].position : 'x' + r.events.length;
    assert(pos(X(p, { type: 'playQueue', tracks: T }, 'a')) === 'now', 'playQueue not now');
    assert(pos(X(p, { type: 'enqueue', tracks: T.slice(0, 1), next: true })) === 'next', 'enqueue next not next');
    assert(pos(X(p, { type: 'enqueue', tracks: T.slice(0, 2) })) === 'last', 'enqueue not last');
    assert(X(p, { type: 'enqueue', tracks: [] }).events.length === 0, 'empty enqueue emitted');
    assert(X(p, { type: 'pause' }).events.length === 0, 'transport emitted queued');
    assert(X(p, { type: 'playQueue', tracks: T }, 'b').events[0].from === 'b', 'from not passed');
  }],
  ['player: next at the end stops unless repeat all wraps; repeat one replays', f => {
    const mk = need(f.createPlayer, 'no player'), T = f.tracks(3);
    const p = mk();
    p.dispatch({ type: 'playQueue', tracks: T, start: 2 });
    p.dispatch({ type: 'next' });
    assert(p.getState().status === 'ended', 'did not end at last track');
    p.dispatch({ type: 'setRepeat', repeat: 'all' });
    const cmds = p.dispatch({ type: 'next' });
    assert(p.current().id === T[0].id && cmds.some(c => c.type === 'load'), 'repeat all did not wrap');
    p.dispatch({ type: 'setRepeat', repeat: 'one' });
    const c2 = p.dispatch({ type: 'reported', fact: { kind: 'ended' } });
    assert(p.current().id === T[0].id && c2.some(c => c.type === 'load'), 'repeat one did not replay');
  }],
  ['player: shuffle is a permutation that starts at the current track', f => {
    const mk = need(f.createPlayer, 'no player'), T = f.tracks(6), p = mk();
    p.dispatch({ type: 'playQueue', tracks: T, start: 3 });
    p.dispatch({ type: 'setShuffle', shuffle: true });
    const o = p.getState().order;
    assert(o[0] === 3 && o.slice().sort((a, b) => a - b).join() === '0,1,2,3,4,5', 'bad shuffle order ' + o);
  }],
  ['player: previous restarts the track after 3s, otherwise goes back', f => {
    const mk = need(f.createPlayer, 'no player'), T = f.tracks(3), p = mk();
    p.dispatch({ type: 'playQueue', tracks: T, start: 1 });
    p.dispatch({ type: 'reported', fact: { kind: 'position', ms: 5000 } });
    p.dispatch({ type: 'previous' });
    assert(p.current().id === T[1].id && p.getState().positionMs === 0, 'did not restart');
    p.dispatch({ type: 'previous' });
    assert(p.current().id === T[0].id, 'did not go back');
  }],

  // ── design + layout (§14–15)
  ['every model event type has a choreography rule', f => {
    const sp = need(f.specs, 'no specs');
    const types = ['launched', 'pushed', 'popped', 'deckSwitched', 'expandedChanged', 'headerVisibilityChanged', 'moreChanged', 'paramChanged', 'layerOpened', 'layerClosed', 'overlayOpened', 'overlayClosed', 'sessionChanged', 'urlChanged', 'retryRequested', 'focusRestore', 'exit', 'queued'];
    types.forEach(t => assert(sp.choreography.rules.some(r => r.on.event === t), 'no rule for ' + t));
  }],
  ['every free component composition hires is implemented by every platform (variants via their parent)', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), plats = need(f.platforms && f.platforms.length && f.platforms, 'no platform manifests');
    const K = need(f.composition, 'no composition'), used = new Set(K.hires.map(h => h.hires));
    const built = (P, id) => P.implements.includes(id) || (!!reg[id] && !!reg[id].variant && !!reg[id].extends && built(P, reg[id].extends));
    plats.forEach(P => used.forEach(id => assert(built(P, id), id + ' is hired by composition but not implemented on ' + P.platform)));
  }],
  ['component inheritance: parents exist, chains end, children keep their parent\'s props and visuals', f => {
    const reg = need(f.specs && f.specs.components, 'no specs');
    const kids = Object.entries(reg).filter(([, C]) => C.extends);
    need(kids.length, 'no component extends another');
    Object.entries(reg).forEach(([id, C]) => assert(!C.variant || C.extends, id + ' is a variant without a parent'));
    kids.forEach(([id, C]) => {
      const seen = new Set([id]); let p = C.extends;
      while (p) { assert(reg[p], id + ' extends unknown ' + p); assert(!seen.has(p), 'extends cycle at ' + p); seen.add(p); p = reg[p].extends; }
      const P = reg[C.extends];
      Object.keys(P.props || {}).forEach(k => assert(C.props && k in C.props, id + ' lost prop ' + k));
      Object.keys(P.visuals || {}).forEach(v => assert(C.visuals && v in C.visuals, id + ' lost visual ' + v));
    });
  }],
  ['reduced motion replaces every transition with the reduced template', f => {
    const sp = need(f.specs, 'no specs'), P = need(f.layout, 'no layout');
    const want = (sp.choreography.reduced.find(x => x.do === 'kind') || {}).kind;
    ['pushed', 'deckSwitched', 'layerOpened'].forEach(t => {
      const d = P.transitionFor({ type: t, kind: 'backdrop' }, sp, { reducedMotion: true }, {});
      assert(d.kind === want && (d.scaleIn === undefined || d.scaleIn === 1), t + ' not reduced: ' + d.kind);
    });
  }],
  ['front layer visuals come from the component spec state', f => {
    const sp = need(f.specs, 'no specs'), P = need(f.layout, 'no layout');
    const m = f.mk(dev.any(f)), start = f.config.startDeck;
    const page = m.query.underPage(S(m)), g = P.geometry(S(m), m.config, m.query, LOOK(m));
    const fl = P.frontLayer(page, g, LOOK(m));
    const want = P.resolveVisuals(sp, 'frontLayer', fl.state);
    Object.keys(want).forEach(k => assert(JSON.stringify(fl.visual[k]) === JSON.stringify(want[k]), 'visual ' + k + ' not from spec'));
  }],

  // ── versioning
  ['configs with a different contract major are rejected; same major is accepted', f => {
    const v = need(f.config.contractVersion, 'config has no contractVersion'), [maj, min] = v.split('.').map(Number);
    let threw = false;
    try { f.createModel({ ...f.config, contractVersion: (maj + 1) + '.0.0' }, dev.any(f), f.data); } catch (e) { threw = true; }
    assert(threw, 'accepted a different major');
    f.createModel({ ...f.config, contractVersion: maj + '.' + (min + 5) + '.0' }, dev.any(f), f.data);
  }],
  ['snapshots from a different contract major are ignored on restore', f => {
    need(f.config.persist, 'no persist policy');
    const m = f.mk(dev.any(f)), start = f.config.startDeck;
    openItem(m, f, 'backdrop', start);
    const snap = m.query.snapshot(S(m), m.config), maj = Number(String(snap.contractVersion || '1').split('.')[0]);
    const m2 = f.mk(dev.any(f));
    m2.dispatch({ type: 'restore', snapshot: { ...snap, contractVersion: (maj + 1) + '.0.0' } });
    assert(depth(m2, start) === 1, 'restored an incompatible snapshot');
  }],
  ['specs share the contract major', f => {
    const sp = need(f.specs, 'no specs');
    const a = String(need(sp.contractVersion, 'specs have no contractVersion')).split('.')[0], b = String(f.config.contractVersion).split('.')[0];
    assert(a === b, 'specs major ' + a + ' ≠ config major ' + b);
  }],

  // ── content states (§17)
  ['content states: loading/empty/error/offline map to the right view', f => {
    const m = f.mk(dev.any(f)), page = m.query.underPage(S(m)), cfg = m.config, items = [{ id: 'x', title: 'x', opens: null }];
    const v = (d, off = false) => m.query.contentView(page, d, cfg, off);
    const L = v({ status: 'loading', items: [] });
    assert(L.state === 'loading' && !L.showItems && L.placeholders > 0, 'loading');
    const Em = v({ status: 'ready', items: [] });
    assert(Em.state === 'empty' && !Em.showItems && !Em.placeholders, 'empty shows placeholders');
    const Er = v({ status: 'error', items: [], error: { message: 'x', retryable: true } });
    assert(Er.state === 'error' && Er.retry && !Er.showItems, 'retryable error must offer retry');
    const Os = v({ status: 'ready', items, stale: true }, true);
    assert(Os.state === 'offlineStale' && Os.showItems && Os.banner, 'offline stale must show items + banner');
    const Oe = v({ status: 'error', items: [] }, true);
    assert(Oe.state === 'error' && !Oe.retry, 'offline without items must not offer retry');
    assert(v({ status: 'ready', items }).state === 'ready', 'ready');
  }],
  ['retry emits retryRequested for the current content', f => {
    const m = f.mk(dev.any(f));
    const ev = m.dispatch({ type: 'retry' });
    assert(ev.some(e => e.type === 'retryRequested' && e.dataSource), 'no retryRequested');
  }],

  // ── focus (§18)
  ['a blocking overlay traps focus, and closing it restores focus to its opener', f => {
    const dlg = need(f.sampleDialog, 'no sample dialog');
    const m = f.mk(dev.any(f));
    m.dispatch({ type: 'openOverlay', overlay: dlg, returnFocus: 'btn-delete' });
    const order = m.query.focusOrder(S(m), m.config);
    assert(order.length === 1 && order[0].kind === 'overlay', 'overlay does not trap focus');
    const ev = m.dispatch({ type: 'back' });
    const r = ev.find(e => e.type === 'focusRestore');
    assert(r && r.element === 'btn-delete', 'focus not restored to opener element');
  }],
  ['covering layers trap focus; beside layers join the order', f => {
    need(f.config.layers.length, 'no layers');
    f.devices.forEach(d => f.config.layers.forEach(L => {
      const m = f.mk(d);
      m.dispatch({ type: 'openLayer', layer: L.id });
      const order = m.query.focusOrder(S(m), m.config), side = m.query.sideMode(S(m), m.config, L.id);
      const railForm = L.presentation.kind === 'drawer' && L.presentation.wide === 'rail' && m.query.layoutClass(S(m), m.config) === 'wide';
      if (railForm) return;   // its own rule
      const covering = L.presentation.kind === 'fullscreen' || m.query.layoutClass(S(m), m.config) === 'compact' || side !== 'beside';
      if (covering) assert(order.length === 1 && order[0].layer === L.id, L.id + ' should trap focus @' + d.width);
      else assert(order.length > 1 && order.some(s => s.layer === L.id) && order.some(s => s.kind === 'frontLayer'), L.id + ' should join order @' + d.width);
    }));
  }],
  ['closing a layer restores focus to whatever opened it', f => {
    const L = need(f.config.layers[0], 'no layers'), m = f.mk(dev.any(f));
    m.dispatch({ type: 'openLayer', layer: L.id, returnFocus: 'opener' });
    const ev = m.dispatch({ type: 'closeLayer', layer: L.id });
    const r = ev.find(e => e.type === 'focusRestore');
    assert(r && r.element === 'opener' && r.surface.kind !== 'layer', 'focus not restored');
  }],

  // ── component references (§1 Header)
  ['conditions and bindings address policy-declared page fields (or the pending value of a declared param), known derived values and known env keys', f => {
    const m = f.mk(dev.any(f)), page0 = m.query.underPage(S(m));
    const conds = c => !c ? [] : 'not' in c ? conds(c.not) : 'all' in c ? c.all.flatMap(conds) : 'any' in c ? c.any.flatMap(conds) : [c];
    const atoms = v => v && typeof v === 'object' ? ('if' in v ? [...conds(v.if), ...atoms(v.then), ...atoms(v.else)] : 'text' in v ? Object.values(v.args || {}).flatMap(atoms) : [v]) : [];
    const inPolicy = (policy, path) => path.split('.').some((_, k, a) => { const n = rp(policy, a.slice(0, k + 1).join('.')); return n && typeof n === 'object' && 'resetOn' in n; });
    // 18.0: every item of every page (header items, back actions, body), its when and its values
    const itemsOf = p => p.kind === 'backdrop' ? [...p.back.header.items, ...(p.back.actions || []), ...p.front.header.items] : [...p.header.items, ...(p.body || [])];
    // param controls: rows and controls (their when, their own options' source params) and the params' words
    const controlsOf = p => [...(p.kind === 'backdrop' ? rowsDeep(backRowsOf(p.back)).flatMap(r => [{ name: 'row', when: r.when }, ...r.controls]) : p.sheet && p.sheet.paramControl ? [p.sheet.paramControl] : [])
      .map(x => ({ name: x.name || x.bind, when: x.when, source: x.options && !Array.isArray(x.options) ? Object.values(x.options.params || {}) : [] })),
      ...Object.entries(p.params || {}).map(([k, P]) => ({ name: k, label: P.label, placeholder: P.placeholder }))];
    let n = 0;
    pagesOf(f, m).forEach(page => [...itemsOf(page), ...controlsOf(page)].forEach(x => {
      [...conds(x.when), ...['label', 'text', 'checked', 'state', 'placeholder'].flatMap(k => atoms(x[k])), ...(x.source || []).flatMap(atoms)].forEach(a => {
        n++;
        const path = a.path || a.bind;
        if (path && path[0] === '$') return;   // $opener / $player / $content
        if (path && path.startsWith('pending.')) return assert((page.params || {})[path.slice(8)], x.name + ': ' + path + ' names no param of ' + page.id);   // a param's pending value
        if (path) assert(inPolicy(page.statePolicy, path), x.name + ': ' + path + ' not in ' + page.id + "'s policy");
        else if ('env' in a) assert(a.env === 'layout' || a.env === 'touch', 'unknown env ' + a.env);
        else if ('layer' in a && 'open' in a) assert(f.config.layers.some(L => L.id === a.layer), 'unknown layer ' + a.layer);
        else if ('player' in a) assert(['status', 'queue', 'shuffle', 'repeat'].includes(a.player), 'unknown player field ' + a.player);
        else if ('derived' in a) assert(m.query.derived(S(m), m.config, a.derived, page0) !== undefined, 'unknown derived value ' + a.derived);
        else assert(false, 'unknown condition/value ' + JSON.stringify(a));
      });
    }));
    need(n, 'no conditions or bindings');
  }],
  ['toggleExpanded flips its field; up without a target pops the focused stack', f => {
    const m = f.mk(dev.any(f)), start = f.config.startDeck;
    const ex0 = m.query.underPage(S(m)).back.expanded;
    assert(m.dispatch({ type: 'toggleExpanded' }).some(e => e.type === 'expandedChanged') && m.query.underPage(S(m)).back.expanded === !ex0, 'toggleExpanded');
    m.dispatch({ type: 'toggleExpanded' });
    openItem(m, f, 'backdrop', start);
    const d = depth(m, start);
    m.dispatch({ type: 'up' });
    assert(depth(m, start) === d - 1, 'up did not pop the deck');
    const L = f.config.layers.find(l => Object.keys(l.pages.set).length > 1);
    if (L) {
      m.dispatch({ type: 'openLayer', layer: L.id });
      m.dispatch({ type: 'openLayerPage', layer: L.id, page: Object.keys(L.pages.set).find(p => p !== L.pages.base) });
      m.dispatch({ type: 'up' });
      assert(ldepth(m, L.id) === 1, 'up did not pop the focused layer');
    }
  }],


  // ── 7.0: launch, texts, placeholders
  ['launch: starts on the splash when configured, launched goes to ready exactly once', f => {
    const m = f.mk(dev.any(f));
    if (!f.config.launch) { assert(S(m).launch === 'ready', 'no launch config but not ready'); skip('no launch config'); }
    assert(S(m).launch === 'starting', 'did not start on the splash');
    assert(m.dispatch({ type: 'launched' }).filter(e => e.type === 'launched').length === 1 && S(m).launch === 'ready', 'launched');
    assert(!m.dispatch({ type: 'launched' }).some(e => e.type === 'launched'), 'launched twice');
  }],
  ['every text id used exists in the default locale; every locale has every id; every message parses', f => {
    const T = need(f.config.texts, 'no texts'), Lc = need(f.config.locales, 'no locales'), def = T[Lc.default] || {};
    const m = f.mk(dev.any(f)), used = new Set(), walk = (o, isProps) => { if (Array.isArray(o)) return o.forEach(x => walk(x)); if (!o || typeof o !== 'object') return; if (isProps) return Object.values(o).forEach(x => walk(x)); if (typeof o.text === 'string' && Object.keys(o).every(k => k === 'text' || k === 'args')) used.add(o.text); Object.entries(o).forEach(([k, x]) => walk(x, k === 'props')); };
    walk({ ...f.config, texts: null }); pagesOf(f, m).forEach(walk);
    used.forEach(id => assert(id in def, 'text ' + id + ' missing in ' + Lc.default));
    Lc.supported.forEach(({ id: l, dir }) => {
      assert(dir === 'ltr' || dir === 'rtl', l + ' has no direction');
      Object.keys(def).forEach(k => assert(T[l] && k in T[l], k + ' missing in ' + l));
      Object.entries(T[l] || {}).forEach(([k, msg]) => { try { need(f.formatMessage, 'no formatter')(msg, { count: 2, query: 'q', tag: 't', tab: 'A', page: 'P' }, l); } catch (e) { if (e instanceof Skip) throw e; assert(false, l + '.' + k + ': ' + e.message); } });
    });
  }],
  ['texts follow the locale (plurals, fallback, direction)', f => {
    const Lc = need(f.config.locales, 'no locales'), m = f.mk(dev.any(f)), q = m.query;
    const en = q.text(S(m), m.config, { text: 'filters.summary', args: { count: 1 } }), en2 = q.text(S(m), m.config, { text: 'filters.summary', args: { count: 2 } });
    assert(en !== en2, 'no plural forms');
    const other = Lc.supported.find(l => l.id !== Lc.default);
    if (other) { m.dispatch({ type: 'setPrefs', prefs: { locale: other.id } }); assert(q.dir(S(m), m.config) === other.dir, 'dir'); }
    assert(q.text(S(m), m.config, '__no_such_text') === '__no_such_text', 'missing id does not fall back to the id');
    const rtl = Lc.supported.find(l => l.dir === 'rtl');
    if (rtl) { m.dispatch({ type: 'setPrefs', prefs: { locale: rtl.id } }); assert(q.condition(S(m), m.config, { env: 'dir', equals: 'rtl' }, null), 'env dir condition'); }
  }],
  ['components that show data declare a placeholder form (hired for item or switch contracts, or placed for a choice / choices param)', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), K = need(f.composition, 'no composition');
    const choice = new Set(K.placements.filter(p => p.contract === 'input' && p.param && (p.param.type === 'choice' || p.param.type === 'choices')).map(p => p.hire));
    const subj = [...new Set(K.hires.filter(h => h.contract === 'item' || h.contract === 'switch' || choice.has(h.name)).map(h => h.hires))];
    need(subj.length, 'no data components');
    subj.forEach(id => assert(reg[id] && reg[id].placeholder && reg[id].placeholder.visuals, id + ' has no placeholder'));
  }],

  // ── 4.0: input in the URL, search history, header hiding, disclosure, panels
  ['param changes replace the URL; only a pushFirst param leaving its default pushes', f => {
    need(f.config.routes && (f.config.routes.params || 'none') !== 'none', 'params not in URL');
    const X = need(paramDeck(f, P => P.url && P.history !== 'pushFirst'), 'no replacing url param');
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: X.D.id });
    const e = need(m.dispatch({ type: 'setParams', values: { [X.k]: otherValue(X.P, m.query.underPage(S(m)).params[X.k]) } }).find(e => e.type === 'urlChanged'), 'no urlChanged');
    assert(e.replace, X.k + ' pushed');
  }],
  ['back returns a pushFirst param to its default before popping (touch: derived step; pointer: recorded); leaving the default pushes once', f => {
    const X = need(paramDeck(f, P => P.history === 'pushFirst'), 'no pushFirst param');
    f.devices.forEach(d => {
      const m = f.mk(d); m.dispatch({ type: 'switchDeck', deck: X.D.id });
      const def = m.query.underPage(S(m)).params[X.k], v1 = otherValue(X.P, def);
      const now = X.P.apply === 'onApply' ? { apply: true } : {};   // an 'onApply' param: set and apply (a submitted search)
      const e1 = m.dispatch({ type: 'setParams', values: { [X.k]: v1 }, ...now }).find(e => e.type === 'urlChanged');
      if (f.config.routes && (f.config.routes.params || 'none') !== 'none' && X.P.url) assert(e1 && e1.replace === false, 'leaving the default does not push');
      const v2 = X.P.type === 'text' ? v1 + 'z' : v1;
      if (v2 !== v1) { const e2 = m.dispatch({ type: 'setParams', values: { [X.k]: v2 }, ...now }).find(e => e.type === 'urlChanged'); assert(!e2 || e2.replace, 'a later change pushed again'); }
      if (d.touch) assert(m.query.backAction(S(m), m.config) === 'resetParam', 'touch back does not reset the param');
      m.dispatch({ type: 'back' });
      assert(JSON.stringify(m.query.underPage(S(m)).params[X.k]) === JSON.stringify(def) && S(m).activeDeck === X.D.id, 'param not reset first @' + d.width + (d.touch ? 't' : 'p'));
    });
  }],
  ['a page param has at most one control with a More', f => {
    let n = 0;
    pagesOf(f, f.mk(dev.any(f))).filter(p => p.kind === 'backdrop').forEach(p => {
      const seen = new Set();
      rowsDeep(backRowsOf(p.back)).flatMap(r => r.controls).filter(x => x.more).forEach(x => { n++; assert(!seen.has(x.bind), p.id + ': two controls of ' + x.bind + ' have a More'); seen.add(x.bind); });
    });
    need(n, 'no More');
  }],
  ['More: opening reveals the back layer and makes it the whole back layer; back and up close it first; concealing closes every More', f => {
    const D = need(f.config.decks.find(d => rowsDeep(backRowsOf(d.page.back)).some(r => r.controls.some(x => x.more))), 'no More');
    const name = rowsDeep(backRowsOf(D.page.back)).flatMap(r => r.controls).find(x => x.more).bind;
    f.devices.forEach(d => {
      const m = f.mk(d), u = () => m.query.underPage(S(m)), open = () => u().back.more || [];
      m.dispatch({ type: 'switchDeck', deck: D.id });
      if (u().back.expanded) m.dispatch({ type: 'setExpanded', expanded: false });
      const e = m.dispatch({ type: 'openMore', name });
      assert(u().back.expanded && open().join() === name, 'not open and revealed');
      assert(e.some(x => x.type === 'moreChanged' && x.opened && x.name === name) && e.some(x => x.type === 'expandedChanged' && x.expanded), 'events missing');
      assert(m.query.backAction(S(m), m.config) === 'closeMore', 'back does not close the More first @' + d.width);
      const L = need(f.layout, 'no layout'), R = L.regions(u(), LOOK(m), { panel: 120 });   // the More is the whole back layer: the panel alone, at the top
      assert(R.every(r => r.region === 'panel' ? r.top === 0 && r.opacity === 1 && r.interactive : r.opacity === 0 && !r.interactive), 'other regions still shown: ' + JSON.stringify(R));
      const st = S(m).decks[D.id].stack.length;
      m.dispatch({ type: 'back' });
      assert(!open().length && u().back.expanded && S(m).decks[D.id].stack.length === st, 'back did more than close the More');
      m.dispatch({ type: 'openMore', name }); m.dispatch({ type: 'up' });
      assert(!open().length && S(m).decks[D.id].stack.length === st, 'up did more than close the More');
      m.dispatch({ type: 'openMore', name }); m.dispatch({ type: 'setExpanded', expanded: false });
      assert(!open().length, 'concealing left the More open');
      m.dispatch({ type: 'openMore', name: name + '?' });
      assert(!open().length, 'opened a More no control has');
    });
  }],
  ['a revealed panel scrolls collapse-first: the header collapses before the panel moves; concealing resets the panel scroll', f => {
    const P = need(f.layout, 'no layout');
    const X = need(collapsingPages(f, P).find(x => { const pg = x.m.query.currentPage(S(x.m)); return pg.config.kind === 'backdrop' && (pg.config.back.panel || []).length; }), 'no collapsing back header with a panel');
    const m = X.m, pg = () => m.query.underPage(S(m)), bv = () => P.barView(pg(), LOOK(m));
    if (!pg().back.expanded) m.dispatch({ type: 'setExpanded', expanded: true });
    const d = bv().distance, front = pg().front.scroll;
    m.dispatch({ type: 'scroll', top: d / 2, surface: 'panel' });
    assert(Math.abs(bv().progress - 0.5) < 1e-9 && P.panelOffset(pg(), LOOK(m)) === 0, 'half the distance does not half-collapse the header first (' + bv().progress + ')');
    m.dispatch({ type: 'scroll', top: d + 30, surface: 'panel' });
    assert(bv().progress === 1 && P.panelOffset(pg(), LOOK(m)) === 30, 'past the distance the panel does not move by the rest');
    assert(JSON.stringify(pg().front.scroll) === JSON.stringify(front), 'panel scroll changed the content scroll');
    m.dispatch({ type: 'setExpanded', expanded: false });
    assert(!pg().back.scroll && P.panelOffset(pg(), LOOK(m)) === 0, 'concealing kept the panel scroll');
    m.dispatch({ type: 'scroll', top: 50, surface: 'panel' });
    assert(!pg().back.scroll, 'a concealed panel scrolled');
  }],
  ['hideOnScroll back header: hides scrolling down, shows scrolling up / at the top / on expand; front headers never hide', f => {
    const D = need(f.config.decks.find(d => d.page.back.hideHeaderOnScroll), 'no hideOnScroll back header');
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id });
    if (m.query.underPage(S(m)).back.expanded) m.dispatch({ type: 'setExpanded', expanded: false });
    const hid = () => !!m.query.underPage(S(m)).back.headerHidden;
    assert(m.dispatch({ type: 'scroll', top: 200 }).some(e => e.type === 'headerVisibilityChanged' && e.hidden) && hid(), 'not hidden on scroll down');
    m.dispatch({ type: 'scroll', top: 150 }); assert(!hid(), 'not shown on scroll up');
    m.dispatch({ type: 'scroll', top: 300 }); m.dispatch({ type: 'scroll', top: 0 }); assert(!hid(), 'not shown at top');
    m.dispatch({ type: 'scroll', top: 300 }); assert(hid(), 'not hidden again');
    assert(m.dispatch({ type: 'setExpanded', expanded: true }).some(e => e.type === 'headerVisibilityChanged' && !e.hidden) && !hid(), 'expand does not show the header');
    f.config.decks.forEach(d => { const x = f.mk(dev.any(f)); x.dispatch({ type: 'switchDeck', deck: d.id }); assert(!('headerHidden' in x.query.underPage(S(x)).front), d.id + ' front header has hide state'); });
  }],
  ['a hidden back header lifts the regions and the front layer by its height', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const D = need(f.config.decks.find(d => d.page.back.hideHeaderOnScroll), 'no hideOnScroll back header');
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id });
    if (m.query.underPage(S(m)).back.expanded) m.dispatch({ type: 'setExpanded', expanded: false });
    const g = P.geometry(S(m), m.config, m.query, LOOK(m)), H = P.barView(m.query.underPage(S(m)), LOOK(m)).height;
    const snap = () => { const u = m.query.underPage(S(m)); return { r: P.regions(u, LOOK(m)).map(x => x.top), t: P.frontLayer(u, g, LOOK(m)).top }; };
    const a = snap(); m.dispatch({ type: 'scroll', top: 200 }); const b = snap();
    a.r.forEach((t, i) => assert(b.r[i] === t - H, 'region ' + i + ' not lifted'));
    assert(b.t === Math.max(0, a.t - H), 'front layer not lifted');
  }],
  ['content-sized regions use their measured height; the front layer never covers its own header; a panel taller than the room scrolls', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const D = need(f.config.decks.find(d => (d.page.back.panel || []).length), 'no content-sized region'), id = 'panel';   // 18.0: the panel (BackLayerConfig.panel) is the measured region
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id }); m.dispatch({ type: 'setExpanded', expanded: true });
    const u = m.query.underPage(S(m)), g = P.geometry(S(m), m.config, m.query, LOOK(m));
    if (D.page.front.collapse === 'full') skip('content region not stacked above a partial front layer');
    const t0 = P.frontLayer(u, g, LOOK(m), { measured: {} }).top, t1 = P.frontLayer(u, g, LOOK(m), { measured: { [id]: 37 } }).top;
    assert(t1 - t0 === 37, 'measured height not used (' + t0 + ' → ' + t1 + ')');
    const hh = +P.resolveVisuals(sp, 'frontLayer', 'partlyCollapsed').headerHeight || 0;
    assert(P.frontLayer(u, g, LOOK(m), { measured: { [id]: 99999 } }).top === g.contentHeight - hh, 'front layer not capped');
    // a panel taller than the room above the front layer's header is held to it and scrolls; a short one does neither
    const pan = M => P.regions(u, LOOK(m), { [id]: M }, g).find(r => r.region === 'panel'), big = pan(99999), small = pan(37);
    assert(big.scrolls && big.top + big.height === g.contentHeight - hh, 'tall panel not held to the room (' + JSON.stringify(big) + ')');
    assert(!small.scrolls && small.height === 37, 'short panel scrolls or shrinks (' + JSON.stringify(small) + ')');
  }],
  ['includes conditions follow list state (panel content reacts to a choices param)', f => {
    const X = need(paramDeck(f, P => P.type === 'choices' && optVals(P).length), 'no choices param'), t = optVals(X.P)[0];
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: X.D.id });
    const k = { path: 'params.' + X.k, includes: t }, at = () => m.query.condition(S(m), m.config, k, m.query.underPage(S(m)));
    assert(!at(), 'includes before'); m.dispatch({ type: 'toggleParam', name: X.k, option: t }); assert(at(), 'includes after');
    m.dispatch({ type: 'toggleParam', name: X.k, option: t }); assert(!at(), 'toggle off');
  }],
  ['expandSurface descriptors carry the surface growth and the fade-through parts', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const d = P.transitionFor({ type: 'pushed', kind: 'appBar' }, sp, { reducedMotion: false }, {});
    need(d.kind === 'expandSurface', 'app bar push is not expandSurface');
    assert(d.surface === 'frontLayer' && (d.to === 'content' || d.to === 'screen') && d.ms > 0 && d.fadeMs > 0 && d.split > 0 && d.split < 1 && d.scaleIn > 0 && d.scaleIn <= 1, 'bad descriptor ' + JSON.stringify(d));
  }],
  ['sessionChanged rules can tell sign-in from sign-out (signedIn)', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const pick = on => sp.choreography.rules.find(r => r.on.event === 'sessionChanged' && (r.on.signedIn === undefined || r.on.signedIn === on));
    [true, false].forEach(on => {
      const want = pick(on); need(want, 'no sessionChanged rule for signedIn ' + on);
      const got = P.transitionFor({ type: 'sessionChanged', session: { signedIn: on, onboarded: true, permissions: {} } }, sp, { reducedMotion: false }, {});
      const wk = (want.steps.find(x => x.do === 'kind') || {}).kind; assert(got.kind === wk, 'signedIn ' + on + ' → ' + got.kind + ' (want ' + wk + ')');
    });
  }],
  ['every motion used is declared, with declared params only; every platform implements it', f => {
    const sp = need(f.specs, 'no specs'), M = need(sp.motions, 'no motions');
    const used = [];
    const kinds = (list, where) => (list || []).filter(x => x.do === 'kind').forEach(t => used.push({ t, where, key: 'kind' }));   // 17.0: temporary kinds only
    sp.choreography.rules.forEach(r => { kinds(r.steps, 'rule ' + JSON.stringify(r.on)); kinds(r.reduced, 'rule ' + JSON.stringify(r.on) + ' reduced'); });
    kinds(sp.choreography.reduced, 'reduced');
    Object.entries(sp.components).forEach(([id, C]) => Object.entries(C.motion || {}).forEach(([k, t]) => kinds(t, id + '.motion.' + k)));
    const ids = new Set();
    used.forEach(({ t, where, key }) => {
      const kind = t[key]; if (kind === 'instant') return;
      const D = M[kind]; assert(D, where + ': motion ' + kind + ' not declared'); ids.add(kind);
      Object.keys(t).filter(p => !['do', 'kind', 'motion', 'trigger'].includes(p)).forEach(p => assert(p in D.params, where + ': ' + kind + ' has no param ' + p));
      assert(D.reduced === 'instant' || M[D.reduced], kind + ' reduces to undeclared ' + D.reduced);
    });
    (f.platforms || []).forEach(pl => ids.forEach(k => assert((pl.motions || []).includes(k), k + ' not implemented on ' + pl.platform)));
  }],
  ['component motion resolves from the design and reduces under reduced motion', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const subjects = Object.entries(sp.components).filter(([, C]) => C.motion && Object.keys(C.motion).length);
    need(subjects.length, 'no component motion');
    subjects.forEach(([id, C]) => Object.entries(C.motion).forEach(([k, t]) => {
      const K = (t || []).find(x => x.do === 'kind'); if (!K) return;
      const d = P.motionFor(sp, id, k, { reducedMotion: false });
      assert(d.kind === K.kind && typeof d.ms === 'number' && d.ms > 0, id + '.' + k + ' → ' + JSON.stringify(d));
      const r = P.motionFor(sp, id, k, { reducedMotion: true }), want = sp.motions[K.kind].reduced;
      assert(r.kind === want, id + '.' + k + ' reduced → ' + r.kind + ' (want ' + want + ')');
    }));
  }],

  // ── placement: surfaces, variants, navigation (§15 / §14)
  ['every surface a component is placed on provides every colour role the component uses', f => {
    skip('18.0: surfaces per contract node are not derived yet (the shell reads them from node keys)');
  }],
  ['layout shows the navigation composition hires for the layout class; its destinations switch or reselect', f => {
    const P = need(f.layout, 'no layout'), Kt = need(f.contracts, 'no contract tree'), K = need(f.composition, 'no composition');
    f.devices.forEach(d => {
      const m = f.mk(d), cls = m.query.layoutClass(S(m), m.config);
      assert(P.geometry(S(m), m.config, m.query, LOOK(m)).navigation === f.compose.placementFor(K, { contract: 'navigation', page: null, within: [], env: { layout: cls } }), 'wrong navigation @' + d.width);
    });
    const m = f.mk(dev.any(f)), o = need(otherDeck(f, S(m).activeDeck), 'only one deck').id;
    const N = Kt.contractTree(m, f.specs, K, { look: LOOK(m), data: f.data }).navigation, ds = N.children.destinations;
    assert(ds.length === f.config.decks.length, 'destinations');
    const ev = id => { const n = ds.find(x => x.values.deck === id); return n.events.press ? n.events.press() : null; };
    assert(ev(o).type === 'switchDeck', 'select other deck');
    assert(ev(S(m).activeDeck).type === 'reselectDeck', 'select active deck');
  }],
  ['front layer: top-right corner is square exactly while a sheet layer sits beside it', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const S0 = need(f.config.layers.find(L => L.presentation.kind === 'sheet'), 'no sheet layer');
    f.devices.forEach(d => [false, true].forEach(open => {
      const m = f.mk(d); if (open) m.dispatch({ type: 'openLayer', layer: S0.id });
      const e = P.env(S(m), m.config, m.query), g = P.geometry(S(m), m.config, m.query, LOOK(m));
      const fl = P.frontLayer(m.query.underPage(S(m)), g, LOOK(m), { env: e });
      const beside = open && m.query.layoutClass(S(m), m.config) === 'wide' && m.query.sideMode(S(m), m.config, S0.id) === 'beside';
      assert((fl.visual.cornerTR === 0) === beside, 'cornerTR ' + fl.visual.cornerTR + ' @' + d.width + (d.touch ? 't' : 'p') + ' open=' + open);
    }));
  }],

  // ── roles

  // ── params (§1)
  ['params: every bind names a page param; every param has a policy, options when it picks, and a valid default', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f)), T = ['choice', 'choices', 'text', 'flag', 'number', 'date'];
    const valid = (P, v) => v === null || (P.type === 'choice' ? typeof v === 'string' && (!Array.isArray(P.options) || optVals(P).includes(v))
      : P.type === 'choices' ? Array.isArray(v) && v.every(x => !Array.isArray(P.options) || optVals(P).includes(x))
      : P.type === 'text' ? typeof v === 'string' : P.type === 'flag' ? typeof v === 'boolean'
      : P.type === 'number' ? (P.range ? Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) : Number.isFinite(v)) : (P.range ? Array.isArray(v) && v.length === 2 : /^\d{4}-\d{2}-\d{2}$/.test(v)));
    let n = 0;
    pagesOf(f, m).forEach(p => {
      const D = p.params || {}, pol = (p.statePolicy && p.statePolicy.params) || {};
      Object.entries(D).forEach(([k, P]) => {
        n++;
        assert(T.includes(P.type), p.id + '.' + k + ': unknown type ' + P.type);
        assert(pol[k], p.id + '.' + k + ': no policy');
        if (P.type === 'choice' || P.type === 'choices') assert(P.options, p.id + '.' + k + ': no options');
        assert(!P.axis || P.type === 'choice', p.id + '.' + k + ': axis on a ' + P.type);
        assert(!P.range || P.type === 'number' || P.type === 'date', p.id + '.' + k + ': range on a ' + P.type);
        assert(valid(P, pol[k].default), p.id + '.' + k + ': invalid default ' + JSON.stringify(pol[k].default));
      });
      Object.keys(pol).forEach(k => assert(D[k], p.id + ': policy for undeclared param ' + k));
      // 18.0: binds are param controls (the back layer's rows, a sheet's), find and switch items
      const binds = p.kind === 'backdrop' ? rowsDeep(backRowsOf(p.back)).flatMap(r => r.controls.map(x => x.bind)) : [p.sheet && p.sheet.paramControl && p.sheet.paramControl.bind];
      const items = p.kind === 'backdrop' ? [...p.back.header.items, ...p.front.header.items] : p.header.items;
      [...binds.filter(Boolean), ...items.filter(x => x.param).map(x => x.param)].forEach(k => assert(D[k], p.id + ': binds undeclared param ' + k));
    });
    need(n, 'no params');
  }],
  ['the URL codec round-trips every param type; invalid values are ignored', f => {
    need(f.config.routes, 'no routes');
    const cfg = JSON.parse(JSON.stringify(f.config)), D = cfg.decks.find(d => d.id === cfg.startDeck), O = [{ value: 'a', label: 'A' }, { value: 'b c', label: 'B' }];
    const add = { pc: [{ type: 'choice', options: O, url: true }, 'a'], pm: [{ type: 'choices', options: O, url: true }, []], pt: [{ type: 'text', url: true }, ''], pf: [{ type: 'flag', url: true }, false],
      pn: [{ type: 'number', min: 0, max: 10, url: true }, 0], pr: [{ type: 'number', range: true, url: true }, null], pd: [{ type: 'date', url: true }, null], pdr: [{ type: 'date', range: true, url: true }, null] };
    D.page.params = { ...(D.page.params || {}) }; D.page.statePolicy.params = { ...(D.page.statePolicy.params || {}) };
    Object.entries(add).forEach(([k, [P, def]]) => { D.page.params[k] = P; D.page.statePolicy.params[k] = { default: def, resetOn: [], scope: null }; });
    cfg.routes.params = 'top';
    const mk = () => f.createModel(cfg, dev.any(f), f.data), vals = { pc: 'b c', pm: ['b c', 'a'], pt: 'x/y z;w&q', pf: true, pn: 7, pr: [2, 5], pd: '2026-10-03', pdr: ['2026-01-01', '2026-02-01'] };
    const m = mk(); m.dispatch({ type: 'setParams', values: vals });
    const url = m.query.url(S(m), m.config), m2 = mk(); m2.dispatch({ type: 'navigateUrl', url });
    const got = m2.query.underPage(S(m2)).params;
    Object.keys(vals).forEach(k => assert(JSON.stringify(k === 'pm' ? [...got[k]].sort() : got[k]) === JSON.stringify(k === 'pm' ? [...vals[k]].sort() : vals[k]), k + ' did not round-trip: ' + url));
    assert(m2.query.url(S(m2), m2.config) === url, 'url not stable');
    const m3 = mk(); m3.dispatch({ type: 'navigateUrl', url: cfg.routes.base + cfg.routes.deck[D.id] + '?pc=zz&pm=a,zz&pf=maybe&pn=99&pr=5..2&pd=2026-1-1&pdr=x..y&nope=1' });
    const g3 = m3.query.underPage(S(m3)).params;
    Object.keys(add).filter(k => k !== 'pt').forEach(k => assert(JSON.stringify(g3[k]) === JSON.stringify(add[k][1]), k + ' took an invalid value: ' + JSON.stringify(g3[k])));
    const m4 = mk(); m4.dispatch({ type: 'navigateUrl', url: cfg.routes.base + cfg.routes.deck[D.id] + '?PC=B-C&pm=A,b-c&pt=Hello+World' });
    const g4 = m4.query.underPage(S(m4)).params;
    assert(g4.pc === 'b c' && JSON.stringify([...g4.pm].sort()) === JSON.stringify(['a', 'b c']) && g4.pt === 'hello world', 'case-insensitive values: ' + JSON.stringify(g4));
    assert(url.includes('pc=b-c') && url.includes('pt=x%2Fy+z%3Bw%26q'), 'slugs / text encoding: ' + url);
  }],
  ['policy reactions: on { paramChange } sets a field; resetOn { paramChange: name } resets another param; a param never reacts to its own change', f => {
    const cfg = JSON.parse(JSON.stringify(f.config)), D = cfg.decks.find(d => d.id === cfg.startDeck), P = D.page;
    P.params = { ...(P.params || {}), qa: { type: 'text' }, qb: { type: 'text' } };
    P.statePolicy.params = { ...(P.statePolicy.params || {}), qa: { default: '', resetOn: ['paramChange'], scope: null }, qb: { default: '', resetOn: [{ paramChange: 'qa' }], scope: null } };
    P.statePolicy.back.expanded = { ...P.statePolicy.back.expanded, default: false, on: [{ event: { paramChange: 'qa' }, set: true }] };
    const m = f.createModel(cfg, dev.any(f), f.data), u = () => m.query.underPage(S(m));
    m.dispatch({ type: 'setParams', values: { qb: 'kept' } });
    const ev = m.dispatch({ type: 'setParams', values: { qa: 'x' } });
    assert(u().params.qa === 'x', 'a param reset on its own change');
    assert(u().params.qb === '', 'resetOn { paramChange } did not reset the other param');
    assert(u().back.expanded === true && ev.some(e => e.type === 'expandedChanged' && e.expanded), 'on { paramChange } did not set expanded (with its event)');
  }],

  // ── content presentation (§1)
  ['presentations cover every option of the view param (or default); the current one follows the param; changing the view keeps the data params', f => {
    const m = f.mk(dev.any(f));
    pagesOf(f, m).forEach(p => {
      const cc = contentOf(p); if (!cc) { assert(!(p.content && p.body), p.id + ': an app-bar page has content or a body, not both'); return; }   // 18.0: neither is allowed (the episode page is its header)
      const P = Object.fromEntries((cc.presentations || []).map(x => [x.key, x]));   // 18.0: a named list
      if (!cc.view) { assert(P.default, p.id + ': no default presentation'); return; }
      const V = (p.params || {})[cc.view];
      assert(V && V.type === 'choice', p.id + ': view ' + cc.view + ' is not a choice param');
      optVals(V).forEach(v => assert(P[v], p.id + ': no presentation for ' + v));
    });
    const D = need(f.config.decks.find(d => d.page.front.content.view && d.page.params[d.page.front.content.view].data === false) || f.config.decks.find(d => d.page.front.content.view), 'no deck with a view param'), v = D.page.front.content.view;
    m.dispatch({ type: 'switchDeck', deck: D.id });
    const u0 = m.query.underPage(S(m)), V0 = D.page.params[v], viewData = V0.data !== false, cp0 = JSON.stringify(m.query.contentParams(u0)), next = m.query.paramOptions(S(m), m.config, u0, v).map(o => o.value).find(x => x !== m.query.presentation(u0).key);
    m.dispatch({ type: 'setParams', values: { [v]: next } });
    const u1 = m.query.underPage(S(m));
    assert(m.query.presentation(u1).key === next, 'presentation did not follow ' + v);
    if (!viewData) assert(JSON.stringify(m.query.contentParams(u1)) === cp0, 'changing a data: false view changed the data params (reload)');
  }],


  ['items name page templates: every page link names a template, the opened page sees its opener, its id is parent id + / + item id', f => {
    const P = need(f.config.pages, 'no page templates'), m = f.mk(dev.any(f)), start = f.config.startDeck;
    const it = need(f.item(m, 'backdrop') || f.item(m, 'appBar'), 'no item that opens a template');
    assert(P[it.opens.template], 'unknown template ' + it.opens.template);
    assert(!('back' in it.opens) && !('front' in it.opens) && !('header' in it.opens), 'an item carries a page config');
    const parent = m.query.underPage(S(m)).config.id;
    m.dispatch({ type: 'open', item: it, origin: { deck: start } });
    const p = top(m, start).page;
    assert(p.config.id === parent + '/' + it.id, 'page id ' + p.config.id);
    assert(p.opener && p.opener.id === it.id, 'the page does not see its opener');
    const cc = p.config.kind === 'backdrop' ? p.config.front.content : p.config.content;
    Object.entries(cc.params || {}).forEach(([k, v]) => { if (v && v.bind === '$opener.id') assert(m.query.contentParams(p)[k] === it.id, 'content param ' + k + ' does not bind the opener'); });
  }],
  ['picking the current value again fires paramReselect reactions (e.g. the active tab expands the back layer)', f => {
    const D = need(f.config.decks.find(d => (d.page.statePolicy.back.expanded.on || []).some(o => o.event && o.event.paramReselect)), 'no paramReselect reaction');
    const k = D.page.statePolicy.back.expanded.on.find(o => o.event && o.event.paramReselect).event.paramReselect;
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id });
    if (m.query.underPage(S(m)).back.expanded) m.dispatch({ type: 'setExpanded', expanded: false });
    const cur = m.query.contentParams(m.query.underPage(S(m)))[k] ?? m.query.underPage(S(m)).params[k];
    const ev = m.dispatch({ type: 'setParams', values: { [k]: cur } });
    assert(m.query.underPage(S(m)).back.expanded && ev.some(e => e.type === 'expandedChanged'), 'reselect did not expand');
    assert(!ev.some(e => e.type === 'paramChanged'), 'reselect emitted paramChanged');
  }],

  // ── interactive components (§20)
  ['interactive components declare all six interaction states', f => {
    const reg = need(f.specs && f.specs.components, 'no specs');
    const ext = (id, b) => { for (let c = id; c; c = (reg[c] || {}).extends) if (c === b) return true; return false; }, ids = Object.keys(reg).filter(k => ext(k, 'interactive'));
    need(ids.length, 'no interactive components');
    const all = ['enabled', 'disabled', 'hover', 'pressed', 'focus', 'keyboardFocus'];
    ids.forEach(id => all.forEach(st => assert((reg[id].states || []).includes(st), id + ' missing state ' + st)));
  }],
  ['a null action is disabled whatever the input', f => {
    const X = need(f.interaction, 'no interaction module'), m = f.mk(dev.pointer(f) || dev.any(f));
    const v = X.resolveInteraction(null, { hovered: true, pressed: true, focused: true, focusVisible: true }, { model: m });
    assert(v.state === 'disabled' && !v.enabled, 'null action not disabled');
    assert(!v.flags.hover && !v.flags.pressed && !v.flags.focus && !v.flags.keyboardFocus, 'disabled still carries flags');
  }],
  ['nav: idempotent actions stay enabled; unknown or dangling actions are disabled', f => {
    const X = need(f.interaction, 'no interaction module'), m = f.mk(dev.any(f)), s0 = S(m), cur = s0.activeDeck, env = { model: m };
    const ok = [{ type: 'switchDeck', deck: cur }, { type: 'reselectDeck', deck: cur }];
    if (f.config.layers[0]) ok.push({ type: 'closeLayer', layer: f.config.layers[0].id });
    ok.forEach(x => assert(X.resolveInteraction({ nav: x }, {}, env).enabled, x.type + ' (idempotent) disabled'));
    [{ type: 'noSuchIntent' }, { type: 'switchDeck', deck: '__nope' }, { type: 'openLayer', layer: '__nope' }, { type: 'openLayerPage' }, { type: 'openLayer' }]
      .forEach(x => assert(X.resolveInteraction({ nav: x }, {}, env).state === 'disabled', JSON.stringify(x) + ' not disabled'));
    assert(X.resolveInteraction({ bogus: 1 }, {}, env).state === 'disabled', 'unknown action domain enabled');
    assert(S(m) === s0, 'resolving interaction mutated state');
  }],
  ['player: transport is disabled with nothing queued and enabled once a queue exists', f => {
    const X = need(f.interaction, 'no interaction module'), p = need(f.createPlayer, 'no player')(), m = f.mk(dev.any(f)), env = { model: m, player: p };
    const en = i => X.resolveInteraction({ player: i }, {}, env).enabled, T = ['next', 'previous', 'toggle', 'play', 'pause'];
    T.forEach(t => assert(!en({ type: t }), t + ' enabled with an empty queue'));
    assert(en({ type: 'playQueue', tracks: f.tracks(2) }) && !en({ type: 'playQueue', tracks: [] }), 'playQueue availability');
    p.dispatch({ type: 'playQueue', tracks: f.tracks(2) });
    T.forEach(t => assert(en({ type: t }), t + ' disabled with a queue'));
    assert(!X.resolveInteraction({ player: { type: 'next' } }, {}, { model: m }).enabled, 'player action enabled without a player');
  }],
  ['status selected: the active deck\'s nav item, setParams to the current values, an included option — and nothing else', f => {
    const X = need(f.interaction, 'no interaction module'), m = f.mk(dev.any(f)), env = { model: m };
    const st = a => X.statusOf({ nav: a }, env);
    f.config.decks.forEach(d => ['switchDeck', 'reselectDeck'].forEach(t => assert(st({ type: t, deck: d.id }).includes('selected') === (d.id === S(m).activeDeck), t + ' ' + d.id)));
    const C = paramDeck(f, P => P.type === 'choice' && optVals(P).length > 1);
    if (C) { m.dispatch({ type: 'switchDeck', deck: C.D.id }); const cur = pval(m, C.k);
      optVals(C.P).forEach(v => assert(st({ type: 'setParams', values: { [C.k]: v } }).includes('selected') === (v === cur), 'choice ' + v)); }
    const M = paramDeck(f, P => P.type === 'choices' && optVals(P).length);
    if (M) {
      m.dispatch({ type: 'switchDeck', deck: M.D.id }); const opt = optVals(M.P)[0];
      assert(!st({ type: 'toggleParam', name: M.k, option: opt }).includes('selected'), 'excluded option selected');
      m.dispatch({ type: 'toggleParam', name: M.k, option: opt });
      assert(st({ type: 'toggleParam', name: M.k, option: opt }).includes('selected'), 'included option not selected');
    }
  }],
  ['status busy blocks activation without disabling; checked / indeterminate / dragged come from facts and input', f => {
    const X = need(f.interaction, 'no interaction module'), p = need(f.createPlayer, 'no player')(), m = f.mk(dev.any(f)), env = { model: m, player: p };
    p.dispatch({ type: 'playQueue', tracks: f.tracks(2) });   // → loading until the shell reports ready
    const v = X.resolveInteraction({ player: { type: 'toggle' } }, {}, env);
    assert(v.status.includes('busy') && v.enabled && !v.activatable && v.state !== 'disabled', 'busy toggle');
    p.dispatch({ type: 'reported', fact: { kind: 'ready' } });
    assert(X.resolveInteraction({ player: { type: 'toggle' } }, {}, env).activatable, 'ready toggle not activatable');
    const a = { nav: { type: 'switchDeck', deck: need(otherDeck(f, S(m).activeDeck), 'only one deck').id } };
    assert(X.resolveInteraction(a, {}, env, { checked: true }).status.includes('checked'), 'checked');
    assert(X.resolveInteraction(a, {}, env, { checked: 'mixed' }).status.includes('indeterminate'), 'indeterminate');
    assert(X.resolveInteraction(a, { dragging: true }, env).status.includes('dragged'), 'dragged');
    assert(!X.resolveInteraction(null, { dragging: true }, env).status.includes('dragged'), 'disabled control dragged');
  }],
  ['components key visuals only on interaction states and the statuses they declare', f => {
    const reg = need(f.specs && f.specs.components, 'no specs');
    const states = new Set(['default', 'enabled', 'disabled', 'hover', 'pressed', 'focus', 'keyboardFocus']), ST = new Set(['selected', 'checked', 'indeterminate', 'busy', 'error', 'dragged']);
    Object.entries(reg).forEach(([id, C]) => {
      (C.statuses || []).forEach(s => assert(ST.has(s), id + ' declares unknown status ' + s));
      Object.entries(C.visuals || {}).forEach(([v, row]) => Object.keys(row).forEach(k => {
        if (states.has(k) || (C.states || []).includes(k)) return;
        assert((C.statuses || []).includes(k), id + '.' + v + ' keys on undeclared status ' + k);
      }));
    });
  }],
  ['shell actions are enabled iff the shell implements them', f => {
    const X = need(f.interaction, 'no interaction module'), m = f.mk(dev.any(f));
    assert(X.resolveInteraction({ shell: 'share' }, {}, { model: m, shellActions: ['share'] }).enabled, 'implemented shell action disabled');
    assert(!X.resolveInteraction({ shell: 'share' }, {}, { model: m, shellActions: [] }).enabled, 'unimplemented shell action enabled');
  }],
  ['interaction state precedence: pressed > keyboardFocus > focus > hover; no hover on touch', f => {
    const X = need(f.interaction, 'no interaction module');
    const a = { nav: { type: 'switchDeck', deck: need(otherDeck(f, f.config.startDeck), 'only one deck').id } };
    const m = f.mk(need(dev.pointer(f), 'no pointer device')), q = inp => X.resolveInteraction(a, inp, { model: m }).state;
    assert(q({ hovered: true, pressed: true, focused: true, focusVisible: true }) === 'pressed', 'pressed not top');
    assert(q({ hovered: true, focused: true, focusVisible: true }) === 'keyboardFocus', 'keyboardFocus order');
    assert(q({ hovered: true, focused: true }) === 'focus', 'focus order');
    assert(q({ hovered: true }) === 'hover', 'hover');
    const t = dev.touch(f);
    if (t) assert(X.resolveInteraction(a, { hovered: true }, { model: f.mk(t) }).state === 'enabled', 'hover on touch');
  }],
  // ── 13.0: roles as component interfaces
  ['toggle reactions flip a boolean field; reselecting the active tab twice expands then conceals', f => {
    const cfg = JSON.parse(JSON.stringify(f.config)), D = cfg.decks.find(d => d.id === cfg.startDeck), P = D.page;
    P.params = { ...(P.params || {}), tg: { type: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } };
    P.statePolicy.params = { ...(P.statePolicy.params || {}), tg: { default: 'a', resetOn: [], scope: null } };
    P.statePolicy.back.expanded = { ...P.statePolicy.back.expanded, on: [{ event: { paramReselect: 'tg' }, set: 'toggle' }] };
    const m = f.createModel(cfg, dev.any(f), f.data), ex = () => m.query.underPage(S(m)).back.expanded, e0 = ex();
    m.dispatch({ type: 'setParams', values: { tg: 'a' } }); assert(ex() === !e0, 'first reselect did not toggle');
    m.dispatch({ type: 'setParams', values: { tg: 'a' } }); assert(ex() === e0, 'second reselect did not toggle back');
  }],
  ['scrollTop fires when the content returns to 0: fields resetting on it reset; derived scrolled follows the crossing', f => {
    const cfg = JSON.parse(JSON.stringify(f.config)), D = cfg.decks.find(d => d.id === cfg.startDeck), P = D.page;
    P.params = { ...(P.params || {}), st: { type: 'flag', data: false } }; P.statePolicy.params = { ...(P.statePolicy.params || {}), st: { default: false, resetOn: ['scrollTop'], scope: null } };
    const m = f.createModel(cfg, dev.any(f), f.data), u = () => m.query.underPage(S(m)), sc = () => m.query.derived(S(m), m.config, 'scrolled', u());
    if (u().back.expanded) m.dispatch({ type: 'setExpanded', expanded: false });
    m.dispatch({ type: 'setParams', values: { st: true } }); assert(sc() === false, 'scrolled at 0');
    m.dispatch({ type: 'scroll', top: 120 }); assert(sc() === true && u().params.st === true, 'scrolled after scrolling / flag kept');
    m.dispatch({ type: 'scroll', top: 0 }); assert(sc() === false && u().params.st === false, 'flag not reset on scrollTop');
  }],
  ['groups partition the visible items in order; the first matching group spec wins; keys follow the group key kind', f => {
    const m = f.mk(dev.any(f)); let n = 0;
    for (const D of f.config.decks) {
      const cc = D.page.front.content, G = Object.values(cc.presentations).flatMap(P => P.groups || []); if (!G.length) continue;
      m.dispatch({ type: 'switchDeck', deck: D.id });
      const sorts = [...new Set(G.map(g => g.when && g.when.path === 'params.sort' ? g.when.equals : null).filter(Boolean))];
      for (const sv of sorts) {
        m.dispatch({ type: 'setParams', values: { sort: sv } });
        const u = m.query.underPage(S(m)), items = m.query.visibleItems(u, f.data.get(cc.dataSource, m.query.contentParams(u))), gs = m.query.groups(S(m), m.config, u, items);
        assert(JSON.stringify(gs.flatMap(g => g.items.map(i => i.id))) === JSON.stringify(items.map(i => i.id)), D.id + ': groups do not partition the items in order (sort ' + sv + ')');
        assert(new Set(gs.map(g => g.key)).size === gs.length, D.id + ': a group key repeats (items not sorted by the group key, sort ' + sv + ')');
        n++;
      }
    }
    need(n, 'no grouped presentation');
  }],
  ['player in config: $player paths and PlayerIs conditions read the player; queue relation is empty / absent / contains', f => {
    const Pl = need(f.createPlayer, 'no player'), tracks = need(f.tracks && f.tracks(3), 'no tracks');
    const pl = Pl(), m = f.createModel(f.config, dev.any(f), f.data, pl), u = () => m.query.underPage(S(m));
    const rel = () => ['empty', 'absent', 'contains'].find(v => m.query.condition(S(m), m.config, { player: 'queue', of: '$x', equals: v }, u(), { x: tracks }));
    assert(rel() === 'empty', 'empty queue');
    pl.dispatch({ type: 'playQueue', tracks: tracks.slice(0, 1) }); assert(rel() === 'absent', 'partial queue is absent');
    pl.dispatch({ type: 'enqueue', tracks: tracks.slice(1) }); assert(rel() === 'contains', 'whole list in queue');
    assert(m.query.value(S(m), m.config, { bind: '$player.current.title' }, u()) === tracks[0].title, '$player.current.title');
    assert(m.query.condition(S(m), m.config, { player: 'status', equals: pl.getState().status }, u()), 'player status condition');
  }],
  ['action lists are available iff every member is; statuses come from the first', f => {
    const X = need(f.interaction, 'no interaction'), m = f.mk(dev.any(f)), L = f.config.layers[0];
    const ok = { nav: { type: 'openLayer', layer: L.id } }, bad = { nav: { type: 'openLayer', layer: '__none__' } };
    assert(X.actionAvailable([ok, ok], { model: m }) && !X.actionAvailable([ok, bad], { model: m }) && !X.actionAvailable([], { model: m }), 'list availability');
    const sw = { nav: { type: 'switchDeck', deck: S(m).activeDeck } };
    assert(X.statusOf([sw, ok], { model: m }).includes('selected'), 'status of the first action');
  }],
  ['an app-bar page\'s inner sheet: toggleExpanded opens it; back collapses it before leaving', f => {
    const L = need(f.config.layers.find(l => Object.values(l.pages.set).some(p => p.sheet)), 'no page with a sheet'), key = Object.keys(L.pages.set).find(k => L.pages.set[k].sheet);
    const m = f.mk(need(dev.touch(f), 'no touch device'));
    m.dispatch({ type: 'openLayer', layer: L.id }); if (key !== L.pages.base) m.dispatch({ type: 'openLayerPage', layer: L.id, page: key });
    const sh = () => m.query.currentPage(S(m)).sheet;
    assert(sh() && !sh().expanded, 'sheet starts collapsed');
    assert(m.dispatch({ type: 'toggleExpanded' }).some(e => e.type === 'expandedChanged' && e.sheet), 'no sheet expandedChanged');
    assert(sh().expanded && m.query.backAction(S(m), m.config) === 'collapseSheet', 'back should collapse the sheet');
    m.dispatch({ type: 'back' }); assert(!sh().expanded && S(m).layers[L.id].open, 'back collapsed the layer instead of the sheet');
  }],
  ['a drawer layer covers (compact, or wide modal): it traps focus, and back closes it', f => {
    const L = need(f.config.layers.find(l => l.presentation.kind === 'drawer'), 'no drawer layer');
    f.devices.forEach(d => {
      const m = f.mk(d); if (L.presentation.wide === 'rail' && m.query.layoutClass(S(m), m.config) === 'wide') return;
      m.dispatch({ type: 'openLayer', layer: L.id });
      const fo = m.query.focusOrder(S(m), m.config); assert(fo.length === 1 && fo[0].layer === L.id, 'drawer does not trap focus @' + d.width);
      if (d.touch) { m.dispatch({ type: 'back' }); assert(!S(m).layers[L.id].open, 'back did not close the drawer @' + d.width); }
    });
  }],
  ['collapse-first scroll (15.0): barView.distance = expanded − collapsed height; progress reaches 1 at scroll = distance whatever the content', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs'), pages = collapsingPages(f, P, sp);
    need(pages.length, 'no page with a collapsing bar');
    pages.forEach(({ m, kind }) => {
      const pg = () => m.query.currentPage(S(m)), bv = () => P.barView(pg(), LOOK(m)), d = bv().distance, full = bv().height;
      assert(bv().progress === 0, kind + ': not expanded at 0');
      m.dispatch({ type: 'scroll', top: d / 2 }); assert(Math.abs(bv().progress - 0.5) < 1e-6, kind + ': half distance → progress ' + bv().progress);
      m.dispatch({ type: 'scroll', top: d }); assert(bv().progress === 1 && Math.abs(full - bv().height - d) < 1e-6, kind + ': not collapsed by exactly distance at scroll = distance');
    });
  }],
  ['collapse-first scroll (15.0): contentOffset stays 0 until the bar has collapsed, then follows scroll − distance', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs'); need(P.contentOffset, 'no contentOffset');
    const pages = collapsingPages(f, P, sp); need(pages.length, 'no page with a collapsing bar');
    pages.forEach(({ m, kind }) => {
      const pg = () => m.query.currentPage(S(m)), d = P.barView(pg(), LOOK(m)).distance;
      [0, d / 3, d].forEach(t => { m.dispatch({ type: 'scroll', top: t }); assert(P.contentOffset(pg(), LOOK(m)) === 0, kind + ': content moved at ' + t); });
      m.dispatch({ type: 'scroll', top: d + 30 }); assert(Math.abs(P.contentOffset(pg(), LOOK(m)) - 30) < 1e-6, kind + ': content offset ' + P.contentOffset(pg(), LOOK(m)));
    });
    const m = f.mk(dev.any(f)), u = () => m.query.underPage(S(m));
    if (!P.barView(u(), LOOK(m)).distance) { m.dispatch({ type: 'scroll', top: 40 }); assert(P.contentOffset(u(), LOOK(m)) === 40, 'a page without a collapsing bar: offset = scroll'); }
  }],
  ['a drawer in rail form (wide) joins the focus order instead of trapping it, and back closes it', f => {
    const L = need(f.config.layers.find(l => l.presentation.kind === 'drawer' && l.presentation.wide === 'rail'), 'no rail-form drawer');
    const wide = need(f.devices.filter(d => d.width >= f.config.breakpoints.compactMax), 'no wide device');
    wide.forEach(d => {
      const m = f.mk(d); m.dispatch({ type: 'openLayer', layer: L.id });
      const fo = m.query.focusOrder(S(m), m.config);
      assert(fo.length > 1 && fo.some(x => x.kind === 'layer' && x.layer === L.id) && fo.some(x => x.kind === 'nav'), 'rail drawer trapped focus @' + d.width);
      m.dispatch({ type: 'back' }); assert(!S(m).layers[L.id].open, 'back did not close the rail drawer @' + d.width);
    });
  }],
  ['LayerOpen conditions follow the layer state', f => {
    const L = f.config.layers[0], m = f.mk(dev.any(f)), c = v => m.query.condition(S(m), m.config, { layer: L.id, open: v }, m.query.underPage(S(m)));
    assert(c(false) && !c(true), 'closed layer');
    m.dispatch({ type: 'openLayer', layer: L.id }); assert(c(true) && !c(false), 'open layer');
  }],

  // ── 17.0: motion as steps
  ['motion steps: every piece a step names is declared (contract child / value, component part, source / target, a step of the rule); every anchor names a step of the rule; every use names a sequence and gives its params', f => {
    const sp = need(f.specs, 'no specs'), roles = need(f.contractDefs, 'no contracts'), reg = sp.components;   // 18.0: pieces name contracts (their children / values) or components (their parts)
    const roleOk = (r, x) => { const R = roles[r]; return !!R && (!x || x in (R.children || {}) || x in (R.values || {})); };
    const pieceOk = (p, ids) => { const b = String(p).replace(/@(before|after)$/, '').replace(/\[(\]|first\]|last\]|\d+\])$/, ''), [h, x] = b.split('.'); if (h === 'source' || h === 'target' || h === 'origin') return true; if (ids.has(h) && !x) return true;
      if (roles[h]) return roleOk(h, x); const C = reg[h]; return !!C && (!x || (C.parts || []).includes(x)); };
    const checkList = (steps, where) => {
      const ids = new Set((steps || []).map(s => s.id).filter(Boolean)), pieces = [], anchors = [];
      const walk = v => { if (Array.isArray(v)) return v.forEach(walk); if (!v || typeof v !== 'object') return;
        if ('step' in v && 'point' in v) anchors.push(v.step);
        for (const k of ['rect', 'edge', 'centreOn', 'into', 'join', 'under', 'fromRect', 'toRect', 'shown']) if (typeof v[k] === 'string') pieces.push(v[k]);
        if (Array.isArray(v.distance)) pieces.push(...v.distance);
        Object.values(v).forEach(walk); };
      (steps || []).forEach(s => {
        if (s.do === 'kind') return;
        if (s.do === 'use') { const Q = (sp.choreography.sequences || {})[s.sequence]; assert(Q, where + ': unknown sequence ' + s.sequence); Object.keys(Q.params || {}).forEach(k => assert(s.with && k in s.with, where + ': ' + s.sequence + ' needs ' + k)); return; }
        if (typeof s.piece === 'string') pieces.push(s.piece);
        if (typeof s.to === 'string') pieces.push(s.to);
        [...(s.out || []), ...(s.in || []), ...(s.cutBy || [])].forEach(p => pieces.push(p));
        walk(s);
      });
      pieces.forEach(p => assert(pieceOk(p, ids), where + ': piece ' + p + ' is not declared'));
      anchors.forEach(a => assert(ids.has(a), where + ': anchor names unknown step ' + a));
    };
    sp.choreography.rules.forEach(r => { checkList(r.steps, 'rule ' + JSON.stringify(r.on)); checkList(r.reduced, 'rule ' + JSON.stringify(r.on) + ' reduced'); });
    checkList(sp.choreography.reduced, 'reduced');
    Object.entries(sp.choreography.sequences || {}).forEach(([k, Q]) => checkList(Q.steps, 'sequence ' + k));
    Object.entries(reg).forEach(([id, C]) => Object.entries(C.motion || {}).forEach(([k, t]) => checkList(t, id + '.motion.' + k)));
  }],
  ['a choreography pattern matches only events whose fields all agree (queued position picks its rule)', f => {
    const sp = need(f.specs, 'no specs'), P = need(f.layout, 'no layout');
    const qs = sp.choreography.rules.filter(r => r.on.event === 'queued' && r.on.position); need(qs.length, 'no queued rules by position');
    qs.forEach(r => { const got = P.stepsFor({ type: 'queued', position: r.on.position, count: 1, from: null }, sp, { reducedMotion: false }); assert(JSON.stringify(got) === JSON.stringify(P.stepsFor({ type: 'queued', position: r.on.position, count: 1, from: null }, sp, {})) && got.length, 'queued ' + r.on.position + ' resolves no steps');
      const first = sp.choreography.rules.find(x => Object.keys(x.on).every(k => k === 'event' ? x.on.event === 'queued' : x.on[k] === ({ position: r.on.position })[k])); assert(first === r, 'queued ' + r.on.position + ' resolves another rule'); });
  }],
];

// 18.0: Layout reads sizes through composition — fixtures.compose (core/compose.js) + fixtures.composition give each model's look
let LOOK = () => { throw new Skip('no composition'); };
export function runInvariants(createModel0, fixtures) {
  const C = fixtures.compose, K = fixtures.composition, Ly = fixtures.layout;
  if (C && K && Ly) LOOK = m => C.lookAt(fixtures.specs, K, Ly.env(m.getState(), m.config, m.query));
  const sizes = C && K && Ly ? Ly.sizes(C.lookAt(fixtures.specs, K, { layout: 'wide' })) : undefined;
  const createModel = (c, d, data, pl) => createModel0(c, d, data, pl, sizes);
  const f = { ...fixtures, createModel, sizes, mk: d => createModel(fixtures.config, d, fixtures.data) };   // fixtures may add: createPlayer, layout, interaction, roles, specs, platforms (PlatformManifest[]), tracks, sampleDialog, sampleSnackbar
  return INVARIANTS.map(([name, fn]) => {
    try { fn(f); return { name, ok: true }; }
    catch (e) { return e instanceof Skip ? { name, ok: true, skipped: true, error: 'skipped: ' + e.message } : { name, ok: false, error: e.message }; }
  });
}
