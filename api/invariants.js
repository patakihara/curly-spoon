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
const pval = (m, k) => { const u = m.query.underPage(S(m)), pol = u.config.policy.params[k], v = u.params[k]; if (!pol || !pol.scope) return v; const key = rp(u, pol.scope); return v && key in v ? v[key] : pol.default; };
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
      if (P.barView(m.query.currentPage(S(m)), sp).distance > 0) { out.push({ m, kind: D.id + ' ' + kind }); return; }
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
    const p = top(m, start).page, P = p.config.policy;
    assert(p.back.expanded === P.back.expanded.default, 'back.expanded ≠ default');
    Object.keys(p.config.params || {}).forEach(k => assert(P.params[k].scope || JSON.stringify(p.params[k]) === JSON.stringify(P.params[k].default), 'params.' + k + ' ≠ default'));
  }],

  // ── decks are independent
  ['switching decks leaves other stacks untouched (unless their policy resets them)', f => {
    const start = f.config.startDeck, D = f.config.decks.find(d => d.id === start);
    if (resets(D.policy && D.policy.stack, 'deckSwitch')) skip('start deck resets on deckSwitch');
    const o = need(otherDeck(f, start), 'only one deck');
    const m = f.mk(dev.any(f));
    openItem(m, f, 'backdrop', start);
    const before = depth(m, start);
    m.dispatch({ type: 'switchDeck', deck: o.id });
    m.dispatch({ type: 'switchDeck', deck: start });
    assert(depth(m, start) === before, 'stack changed');
  }],
  ['every deck whose stack policy resets on deckSwitch is at its base when entered', f => {
    const subjects = f.config.decks.filter(d => resets(d.policy && d.policy.stack, 'deckSwitch'));
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
      const m = f.mk(dv), P = D.page.policy, flipped = !P.back.expanded.default;
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
      const m = f.mk(dev.any(f)), P = D.page.policy;
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
    const subjects = f.config.layers.filter(L => resets(L.policy.open, 'deckSwitch'));
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
    const subjects = f.config.layers.filter(L => resets(L.policy.stack, 'layerOpen') && Object.keys(L.pages.set).length > 1);
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
    const B = f.config.breakpoints;
    f.devices.forEach(d => sheets.forEach(L => {
      const m = f.mk(d);
      const want = d.width < B.compactMax ? null
        : d.width - B.railWidth - L.presentation.wide.width >= B.minContent ? 'beside'
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
    if (baseUrl.includes('?')) { const b2 = S(m2).decks[S(m2).activeDeck].stack[0].page; Object.keys(b2.config.params || {}).forEach(k => assert(JSON.stringify(b2.params[k]) === JSON.stringify(b2.config.policy.params[k].default), 'a lower page\'s param ' + k + ' came through the URL')); }
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
    const types = ['launched', 'pushed', 'popped', 'deckSwitched', 'expandedChanged', 'headerVisibilityChanged', 'paramChanged', 'layerOpened', 'layerClosed', 'overlayOpened', 'overlayClosed', 'sessionChanged', 'urlChanged', 'retryRequested', 'focusRestore', 'exit', 'queued'];
    types.forEach(t => assert(sp.choreography.rules.some(r => r.on.event === t), 'no rule for ' + t));
  }],
  ['every component the config uses is implemented by every platform (variants via their parent)', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), plats = need(f.platforms && f.platforms.length && f.platforms, 'no platform manifests');
    const m = f.mk(dev.any(f)), used = new Set();
    headersOf(f, m).forEach(({ h }) => refsOfHeader(h).forEach(x => used.add(x.component)));
    roleSlotsOf(f, m).forEach(({ ref }) => ref && used.add(ref.component));
    Object.values(f.config.contentStates || {}).forEach(c => used.add(c));
    [f.sampleDialog, f.sampleSnackbar].filter(Boolean).forEach(o => used.add(o.component));
    surfaceRolesOf(f, m).forEach(r => Object.keys(reg).filter(id => (reg[id].implements || []).includes(r)).forEach(id => used.add(id)));   // 16.0
    const built = (P, id) => P.implements.includes(id) || (!!reg[id] && !!reg[id].variant && !!reg[id].extends && built(P, reg[id].extends));
    plats.forEach(P => used.forEach(id => assert(built(P, id), id + ' is used by the config but not implemented on ' + P.platform)));
  }],
  ['component inheritance: parents exist, chains end, children keep their parent\'s roles, props and visuals', f => {
    const reg = need(f.specs && f.specs.components, 'no specs');
    const kids = Object.entries(reg).filter(([, C]) => C.extends);
    need(kids.length, 'no component extends another');
    Object.entries(reg).forEach(([id, C]) => assert(!C.variant || C.extends, id + ' is a variant without a parent'));
    kids.forEach(([id, C]) => {
      const seen = new Set([id]); let p = C.extends;
      while (p) { assert(reg[p], id + ' extends unknown ' + p); assert(!seen.has(p), 'extends cycle at ' + p); seen.add(p); p = reg[p].extends; }
      const P = reg[C.extends];
      (P.implements || []).forEach(r => assert((C.implements || []).includes(r), id + ' lost role ' + r));
      Object.keys(P.props || {}).forEach(k => assert(C.props && k in C.props, id + ' lost prop ' + k));
      Object.keys(P.visuals || {}).forEach(v => assert(C.visuals && v in C.visuals, id + ' lost visual ' + v));
    });
  }],
  ['every component referenced by overlays is registered', f => {
    const sp = need(f.specs, 'no specs');
    [f.sampleDialog, f.sampleSnackbar].filter(Boolean).forEach(o => assert(sp.components[o.component], o.component + ' not registered'));
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
    const page = m.query.underPage(S(m)), g = P.geometry(S(m), m.config, m.query, sp);
    const fl = P.frontLayer(page, g, sp);
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
    assert(L.state === 'loading' && !L.showItems && L.component === null && L.placeholders > 0, 'loading');
    const Em = v({ status: 'ready', items: [] });
    assert(Em.state === 'empty' && !Em.showItems && Em.component !== (cfg.contentStates || {}).loading, 'empty shows placeholder');
    const Er = v({ status: 'error', items: [], error: { message: 'x', retryable: true } });
    assert(Er.state === 'error' && Er.retry && !Er.showItems, 'retryable error must offer retry');
    const Os = v({ status: 'ready', items, stale: true }, true);
    assert(Os.state === 'offlineStale' && Os.showItems && Os.banner, 'offline stale must show items + banner');
    const Oe = v({ status: 'error', items: [] }, true);
    assert(Oe.state === 'error' && !Oe.retry, 'offline without items must not offer retry');
    assert(v({ status: 'ready', items }).state === 'ready', 'ready');
  }],
  ['content state components are registered', f => {
    const sp = need(f.specs, 'no specs'), cs = need(f.config.contentStates, 'no contentStates');
    Object.values(cs).forEach(c => assert(sp.components[c], c + ' not registered'));
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
  ['header slots name registered components with declared props; interactive ones carry an action', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f));
    const TYPE = { string: 'string', token: 'string', number: 'number', boolean: 'boolean' };
    const leaves = v => v && typeof v === 'object' ? ('if' in v ? [...leaves(v.then), ...leaves(v.else)] : []) : [v];
    headersOf(f, m).forEach(({ h }) => refsOfHeader(h).forEach(x => {
      const C = reg[x.component]; assert(C, x.component + ' not registered');
      Object.entries(x.props || {}).forEach(([k, v]) => {
        const t = (C.props || {})[k]; assert(t && t !== 'slot', x.component + '.' + k + ' not declared');
        leaves(v).forEach(l => assert(l === null || typeof l === TYPE[t], x.component + '.' + k + ' should be ' + t));
      });
      Object.keys(x.slots || {}).forEach(k => assert((C.props || {})[k] === 'slot', x.component + ' has no slot ' + k));
      if ((C.implements || []).includes('interactive')) assert('action' in x || x.bind, x.component + ' is interactive but has no action key (or bind)');
    }));
  }],
  ['conditions and bindings address policy-declared page fields, known derived values and known env keys', f => {
    const m = f.mk(dev.any(f)), page0 = m.query.underPage(S(m));
    const conds = c => !c ? [] : 'not' in c ? conds(c.not) : 'all' in c ? c.all.flatMap(conds) : 'any' in c ? c.any.flatMap(conds) : [c];
    const atoms = v => v && typeof v === 'object' ? ('if' in v ? [...conds(v.if), ...atoms(v.then), ...atoms(v.else)] : [v]) : [];
    const inPolicy = (policy, path) => path.split('.').some((_, k, a) => { const n = rp(policy, a.slice(0, k + 1).join('.')); return n && typeof n === 'object' && 'resetOn' in n; });
    headersOf(f, m).forEach(({ h, page }) => refsOfHeader(h).forEach(x => {
      [...conds(x.when), ...Object.values(x.props || {}).flatMap(atoms)].forEach(a => {
        const path = a.path || a.bind;
        if (path && path[0] === '$') return;   // a repeat element
        if (path) { assert(page, x.component + ': state path ' + path + ' in a slot without a page'); assert(inPolicy(page.policy, path), x.component + ': ' + path + ' not in ' + page.id + "'s policy"); }
        else if ('env' in a) assert(a.env === 'layout' || a.env === 'touch', 'unknown env ' + a.env);
        else if ('layer' in a && 'open' in a) assert(f.config.layers.some(L => L.id === a.layer), 'unknown layer ' + a.layer);
        else if ('player' in a) assert(['status', 'queue', 'shuffle', 'repeat'].includes(a.player), 'unknown player field ' + a.player);
        else if ('derived' in a) assert(m.query.derived(S(m), m.config, a.derived, page0) !== undefined, 'unknown derived value ' + a.derived);
        else if ('text' in a) return;   // TextRef value
        else assert(false, 'unknown condition/value ' + JSON.stringify(a));
      });
    }));
  }],
  ['resolveRef evaluates when / if against page state and environment', f => {
    const D = need(f.config.decks.find(d => d.page.kind === 'backdrop'), 'no backdrop deck');
    const EX = { path: 'back.expanded', equals: true };
    const ref = { component: 'probe', props: { a: { if: EX, then: 'open', else: 'closed' }, b: { if: { env: 'layout', equals: 'compact' }, then: 1, else: 2 } }, when: { not: EX } };
    f.devices.forEach(dv => {
      const m = f.mk(dv); m.dispatch({ type: 'switchDeck', deck: D.id });
      [false, true].forEach(ex => {
        m.dispatch({ type: 'setExpanded', expanded: ex });
        const r = m.query.resolveRef(S(m), m.config, ref, m.query.underPage(S(m)));
        assert(r.props.a === (ex ? 'open' : 'closed') && r.visible === !ex, 'if/when vs back.expanded=' + ex);
        assert(r.props.b === (m.query.layoutClass(S(m), m.config) === 'compact' ? 1 : 2), 'env condition @' + dv.width);
      });
    });
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

  ['slot paths: distinct places differ, the same place keeps its path, resolveRef returns it as key', f => {
    const m = f.mk(dev.any(f)), q = m.query, a = q.slotPath('deck:X', 'P', 'header.left', 0);
    assert(a !== q.slotPath('deck:X', 'P', 'header.right', 0), 'left[0] and right[0] share a path');
    assert(a === q.slotPath('deck:X', 'P', 'header.left', 0), 'path not stable');
    assert(a !== q.slotPath('deck:X', 'P/child', 'header.left', 0), 'two pages share a path');
    assert(a !== q.slotPath('layer:X', 'P', 'header.left', 0), 'two surfaces share a path');
    assert(q.slotPath('deck:X', 'P', 'item', undefined, 'a/b') !== q.slotPath('deck:X', 'P', 'item', undefined, 'a'), 'two items share a path');
    assert(q.slotPath('deck:X', 'P/x', 'h') !== q.slotPath('deck:X', 'P', 'x/h'), 'ids are not escaped');
    assert(q.resolveRef(S(m), m.config, { component: 'probe' }, q.underPage(S(m)), a).key === a, 'resolveRef does not return the path');
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
  ['components that show data declare a placeholder form', f => {
    const reg = need(f.specs && f.specs.components, 'no specs');
    const subj = Object.entries(reg).filter(([, C]) => (C.implements || []).includes('item') || ((C.implements || []).includes('input') && (C.accepts || []).some(t => t === 'choice' || t === 'choices')));
    need(subj.length, 'no data components');
    subj.forEach(([id, C]) => assert(C.placeholder && C.placeholder.visuals, id + ' has no placeholder'));
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
      const e1 = m.dispatch({ type: 'setParams', values: { [X.k]: v1 } }).find(e => e.type === 'urlChanged');
      if (f.config.routes && (f.config.routes.params || 'none') !== 'none' && X.P.url) assert(e1 && e1.replace === false, 'leaving the default does not push');
      const v2 = X.P.type === 'text' ? v1 + 'z' : v1;
      if (v2 !== v1) { const e2 = m.dispatch({ type: 'setParams', values: { [X.k]: v2 } }).find(e => e.type === 'urlChanged'); assert(!e2 || e2.replace, 'a later change pushed again'); }
      if (d.touch) assert(m.query.backAction(S(m), m.config) === 'resetParam', 'touch back does not reset the param');
      m.dispatch({ type: 'back' });
      assert(JSON.stringify(m.query.underPage(S(m)).params[X.k]) === JSON.stringify(def) && S(m).activeDeck === X.D.id, 'param not reset first @' + d.width + (d.touch ? 't' : 'p'));
    });
  }],
  ['hideOnScroll back header: hides scrolling down, shows scrolling up / at the top / on expand; front headers never hide', f => {
    const D = need(f.config.decks.find(d => d.page.back.regions.header && d.page.back.regions.header.hideOnScroll), 'no hideOnScroll back header');
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
    const D = need(f.config.decks.find(d => d.page.back.regions.header && d.page.back.regions.header.hideOnScroll), 'no hideOnScroll back header');
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id });
    if (m.query.underPage(S(m)).back.expanded) m.dispatch({ type: 'setExpanded', expanded: false });
    const g = P.geometry(S(m), m.config, m.query, sp), H = D.page.back.regions.header.height;
    const snap = () => { const u = m.query.underPage(S(m)); return { r: P.regions(u).map(x => x.top), t: P.frontLayer(u, g, sp).top }; };
    const a = snap(); m.dispatch({ type: 'scroll', top: 200 }); const b = snap();
    a.r.forEach((t, i) => assert(b.r[i] === t - H, 'region ' + i + ' not lifted'));
    assert(b.t === Math.max(0, a.t - H), 'front layer not lifted');
  }],
  ['content-sized regions use their measured height; the front layer never covers its own header', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const D = need(f.config.decks.find(d => Object.values(d.page.back.regions).some(r => r.height === 'content')), 'no content-sized region');
    const id = Object.keys(D.page.back.regions).find(k => D.page.back.regions[k].height === 'content');
    const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id }); m.dispatch({ type: 'setExpanded', expanded: true });
    const u = m.query.underPage(S(m)), g = P.geometry(S(m), m.config, m.query, sp);
    if (!D.page.back.layouts.expanded.includes(id) || D.page.front.collapse === 'full') skip('content region not stacked above a partial front layer');
    const t0 = P.frontLayer(u, g, sp, { measured: {} }).top, t1 = P.frontLayer(u, g, sp, { measured: { [id]: 37 } }).top;
    assert(t1 - t0 === 37, 'measured height not used (' + t0 + ' → ' + t1 + ')');
    const hh = +P.resolveVisuals(sp, 'frontLayer', 'partlyCollapsed').headerHeight || 0;
    assert(P.frontLayer(u, g, sp, { measured: { [id]: 99999 } }).top === g.contentHeight - hh, 'front layer not capped');
  }],
  ['the disclosure role mirrors back.expanded and toggles it', f => {
    const m = f.mk(dev.any(f)), slot = () => ({ role: 'disclosure', page: m.query.underPage(S(m)) });
    const ex = m.query.underPage(S(m)).back.expanded;
    assert(m.query.roleProps(S(m), m.config, slot()).expanded === ex, 'expanded prop');
    m.dispatch(m.query.roleIntent(S(m), m.config, slot(), 'toggle'));
    assert(m.query.roleProps(S(m), m.config, slot()).expanded === !ex, 'toggle');
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
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f));
    const ps = placementsOf(f, m).filter(p => p.surface);
    need(ps.length, 'no placements');
    ps.forEach(({ ref, surface, where }) => {
      const S = reg[surface]; assert(S, where + ': surface ' + surface + ' not registered');
      const C = reg[ref.component] || {};
      Object.values(C.visuals || {}).forEach(byState => Object.values(byState).flatMap(rolesUsed).forEach(r =>
        assert(S.provides && r in S.provides, ref.component + ' uses role ' + r + ' but ' + surface + ' does not provide it (' + where + ')')));
    });
  }],
  ['placement variants are declared by the component and pick a declared option', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f));
    Object.entries(reg).forEach(([id, C]) => Object.entries(C.variants || {}).forEach(([ax, d]) => assert(d.options.includes(d.default), id + '.' + ax + ' default not an option')));
    const vs = placementsOf(f, m).filter(p => p.ref.variant);
    need(vs.length, 'no placement uses a variant');
    vs.forEach(({ ref, where }) => Object.entries(ref.variant).forEach(([ax, v]) => {
      const d = ((reg[ref.component] || {}).variants || {})[ax];
      assert(d, ref.component + ' has no variant axis ' + ax + ' (' + where + ')');
      assert(d.options.includes(v), ref.component + '.' + ax + ' has no option ' + v + ' (' + where + ')');
    }));
  }],
  ['layout shows the configured navigation component for the layout class; selecting a deck switches or reselects', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs'), nav = need(f.config.navigation, 'no navigation config');
    f.devices.forEach(d => {
      const m = f.mk(d), cls = m.query.layoutClass(S(m), m.config);
      assert(P.geometry(S(m), m.config, m.query, sp).navigation === nav[cls].component, 'wrong navigation @' + d.width);
    });
    const m = f.mk(dev.any(f)), o = need(otherDeck(f, S(m).activeDeck), 'only one deck').id, slot = { role: 'navigation', page: m.query.underPage(S(m)) };
    assert(m.query.roleProps(S(m), m.config, slot).destinations.length === f.config.decks.length, 'destinations');
    assert(m.query.roleIntent(S(m), m.config, slot, 'select', o).type === 'switchDeck', 'select other deck');
    assert(m.query.roleIntent(S(m), m.config, slot, 'select', S(m).activeDeck).type === 'reselectDeck', 'select active deck');
    assert(m.query.roleIntent(S(m), m.config, slot, 'select', '__nope') === null, 'select unknown deck');
  }],
  ['front layer: top-right corner is square exactly while a sheet layer sits beside it', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs');
    const S0 = need(f.config.layers.find(L => L.presentation.kind === 'sheet'), 'no sheet layer');
    f.devices.forEach(d => [false, true].forEach(open => {
      const m = f.mk(d); if (open) m.dispatch({ type: 'openLayer', layer: S0.id });
      const e = P.env(S(m), m.config, m.query), g = P.geometry(S(m), m.config, m.query, sp);
      const fl = P.frontLayer(m.query.underPage(S(m)), g, sp, { env: e });
      const beside = open && m.query.layoutClass(S(m), m.config) === 'wide' && m.query.sideMode(S(m), m.config, S0.id) === 'beside';
      assert((fl.visual.cornerTR === 0) === beside, 'cornerTR ' + fl.visual.cornerTR + ' @' + d.width + (d.touch ? 't' : 'p') + ' open=' + open);
    }));
  }],

  // ── roles
  ['every role slot is filled by a registered component that implements the role', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f));
    roleSlotsOf(f, m).forEach(({ ref, role, where }) => {
      assert(ref && ref.component, where + ': no component for role ' + role);
      const C = reg[ref.component]; assert(C, ref.component + ' not registered (' + where + ')');
      assert((C.implements || []).includes(role), ref.component + ' does not implement ' + role + ' (' + where + ')');
    });
  }],
  ['role components declare every supplied prop; the config never sets a supplied prop', f => {
    const roles = need(f.roles, 'no roles'), reg = need(f.specs && f.specs.components, 'no specs');
    Object.entries(reg).forEach(([id, C]) => (C.implements || []).forEach(r => {
      assert(roles[r], id + ' implements unknown role ' + r);
      Object.entries(roles[r].supplies).forEach(([k, t]) => assert((C.props || {})[k] === t, id + ' must declare ' + k + ': ' + t));
    }));
    const m = f.mk(dev.any(f));
    roleSlotsOf(f, m).forEach(({ ref, role, where }) => ref && Object.keys(ref.props || {}).forEach(k => assert(!(k in roles[role].supplies), where + ': config sets supplied prop ' + k)));
  }],
  ['role props mirror page state, and role events produce the matching intent', f => {
    const at = D => { const m = f.mk(dev.any(f)); m.dispatch({ type: 'switchDeck', deck: D.id }); return m; };
    const slot = (m, role, extra) => ({ role, page: m.query.underPage(S(m)), ...extra });
    let tested = 0;
    f.config.decks.forEach(D => Object.values(D.page.back.regions).forEach(R => R.kind === 'slots' && slotRefs(R.content).filter(r => r.bind).forEach(r => {
      const m = at(D), name = typeof r.bind === 'string' ? r.bind : r.bind.change, P = D.page.params[name], sl = () => slot(m, 'input', { bind: r.bind });
      const rp = m.query.roleProps(S(m), m.config, sl());
      assert(JSON.stringify(rp.value) === JSON.stringify(pval(m, name)), D.id + ': input value ≠ params.' + name);
      if (P.options) assert((!Array.isArray(P.options) || rp.options.length === optVals(P).length) && rp.options.every(o => typeof o.label === 'string'), D.id + ': options');
      const v = otherValue({ ...P, options: P.options ? rp.options : P.options }, rp.value);
      m.dispatch(m.query.roleIntent(S(m), m.config, sl(), 'change', v));
      assert(JSON.stringify(m.query.roleProps(S(m), m.config, sl()).value) === JSON.stringify(v), D.id + ': change → ' + JSON.stringify(v));
      tested++;
    })));
    const m = f.mk(dev.any(f)), start = f.config.startDeck, it = f.item(m, 'backdrop');
    if (it) {
      const d = depth(m, start), i = m.query.roleIntent(S(m), m.config, slot(m, 'item', { item: it }), 'open');
      assert(i && i.type === 'open', 'item open intent'); m.dispatch(i);
      assert(depth(m, start) === d + 1, 'item open did not push');
      tested++;
    }
    need(tested, 'no role slots to test');
  }],

  // ── params (§1)
  ['params: every bind names a page param, its control implements input and accepts the type; every param has a policy, options when it picks, and a valid default', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f)), T = ['choice', 'choices', 'text', 'flag', 'number', 'date'];
    const valid = (P, v) => v === null || (P.type === 'choice' ? typeof v === 'string' && (!Array.isArray(P.options) || optVals(P).includes(v))
      : P.type === 'choices' ? Array.isArray(v) && v.every(x => !Array.isArray(P.options) || optVals(P).includes(x))
      : P.type === 'text' ? typeof v === 'string' : P.type === 'flag' ? typeof v === 'boolean'
      : P.type === 'number' ? (P.range ? Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) : Number.isFinite(v)) : (P.range ? Array.isArray(v) && v.length === 2 : /^\d{4}-\d{2}-\d{2}$/.test(v)));
    let n = 0;
    pagesOf(f, m).forEach(p => {
      const D = p.params || {}, pol = (p.policy && p.policy.params) || {};
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
      pageRefs(p).filter(r => r.bind && !r.bind.player).forEach(r => {
        const names = typeof r.bind === 'string' ? [r.bind] : [r.bind.change, r.bind.submit];
        names.forEach(k => assert(D[k], p.id + ': ' + r.component + ' binds undeclared param ' + k));
        const C = reg[r.component] || {};
        assert((C.implements || []).includes('input'), r.component + ' is bound but does not implement input');
        names.forEach(k => D[k] && assert((C.accepts || []).includes(D[k].type), r.component + ' does not accept ' + D[k].type + ' (' + p.id + '.' + k + ')'));
      });
    });
    need(n, 'no params');
  }],
  ['the deck back layer is strict: a header bar, the front header starting with the disclosure, a basicAction region with exactly one bound control, concealed starts with the header', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f));
    pagesOf(f, m).filter(p => p.kind === 'backdrop').forEach(p => {
      const B = p.back, H = B.regions.header, A = B.regions.basicAction;
      assert(H && H.kind === 'bar', p.id + ': no header bar');
      const st0 = slotRefs(((p.front.header || {}).slots || {}).start)[0];
      assert(st0 && ((reg[st0.component] || {}).implements || []).includes('disclosure'), p.id + ': front header does not start with a disclosure');
      assert(A && A.kind === 'slots' && slotRefs(A.content).filter(r => r.bind).length === 1, p.id + ': basicAction must hold exactly one bound control');
      assert(B.layouts.concealed[0] === 'header', p.id + ': concealed does not start with the header');
      Object.values(B.layouts).forEach(L => L.forEach(id => assert(B.regions[id], p.id + ': layout lists unknown region ' + id)));
    });
  }],
  ['the URL codec round-trips every param type; invalid values are ignored', f => {
    need(f.config.routes, 'no routes');
    const cfg = JSON.parse(JSON.stringify(f.config)), D = cfg.decks.find(d => d.id === cfg.startDeck), O = [{ value: 'a', label: 'A' }, { value: 'b c', label: 'B' }];
    const add = { pc: [{ type: 'choice', options: O, url: true }, 'a'], pm: [{ type: 'choices', options: O, url: true }, []], pt: [{ type: 'text', url: true }, ''], pf: [{ type: 'flag', url: true }, false],
      pn: [{ type: 'number', min: 0, max: 10, url: true }, 0], pr: [{ type: 'number', range: true, url: true }, null], pd: [{ type: 'date', url: true }, null], pdr: [{ type: 'date', range: true, url: true }, null] };
    D.page.params = { ...(D.page.params || {}) }; D.page.policy.params = { ...(D.page.policy.params || {}) };
    Object.entries(add).forEach(([k, [P, def]]) => { D.page.params[k] = P; D.page.policy.params[k] = { default: def, resetOn: [], scope: null }; });
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
    P.policy.params = { ...(P.policy.params || {}), qa: { default: '', resetOn: ['paramChange'], scope: null }, qb: { default: '', resetOn: [{ paramChange: 'qa' }], scope: null } };
    P.policy.back.expanded = { ...P.policy.back.expanded, default: false, on: [{ event: { paramChange: 'qa' }, set: true }] };
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
      const cc = contentOf(p); if (!cc) { assert(p.body, p.id + ': an app-bar page has content or a body'); return; }
      const P = cc.presentations || {};
      if (!cc.view) { assert(P.default, p.id + ': no default presentation'); return; }
      const V = (p.params || {})[cc.view];
      assert(V && V.type === 'choice', p.id + ': view ' + cc.view + ' is not a choice param');
      optVals(V).forEach(v => assert(P[v] && P[v].layout && P[v].item, p.id + ': no presentation for ' + v));
    });
    const D = need(f.config.decks.find(d => d.page.front.content.view && d.page.params[d.page.front.content.view].data === false) || f.config.decks.find(d => d.page.front.content.view), 'no deck with a view param'), v = D.page.front.content.view;
    m.dispatch({ type: 'switchDeck', deck: D.id });
    const u0 = m.query.underPage(S(m)), V0 = D.page.params[v], viewData = V0.data !== false, cp0 = JSON.stringify(m.query.contentParams(u0)), next = m.query.paramOptions(S(m), m.config, u0, v).map(o => o.value).find(x => x !== m.query.presentation(u0).key);
    m.dispatch({ type: 'setParams', values: { [v]: next } });
    const u1 = m.query.underPage(S(m));
    assert(m.query.presentation(u1).key === next, 'presentation did not follow ' + v);
    if (!viewData) assert(JSON.stringify(m.query.contentParams(u1)) === cp0, 'changing a data: false view changed the data params (reload)');
  }],

  ['presentation items bind only item fields ($item.*) or page fields; items that open nothing use the ref\'s action', f => {
    const m = f.mk(dev.any(f)); let n = 0;
    const binds = v => !v || typeof v !== 'object' ? [] : Array.isArray(v) ? v.flatMap(binds) : 'bind' in v ? [v.bind] : Object.values(v).flatMap(binds);
    pagesOf(f, m).forEach(p => { const cc = contentOf(p); if (!cc) return; Object.entries(cc.presentations || {}).forEach(([k, P]) => {
      n++; binds({ props: P.item.props, action: P.item.action, when: P.item.when }).forEach(b => assert(b[0] !== '$' || b === '$item' || b.startsWith('$item.'), p.id + ' ' + k + ': item binds ' + b));
    }); });
    need(n, 'no presentations');
    const D = f.config.decks[0], s = f.mk(dev.any(f)); s.dispatch({ type: 'switchDeck', deck: D.id });
    const u = s.query.underPage(S(s)), it = { id: 'x', opens: null, title: 'T' };
    assert(s.query.roleIntent(S(s), s.config, { role: 'item', page: u, item: it }, 'open') === null, 'an item that opens nothing produced an intent');
    const rr = s.query.resolveRef(S(s), s.config, { component: 'listRow', props: { title: { bind: '$item.title' } } }, u, undefined, { item: it });
    assert(rr.props.title === 'T', '$item binds do not resolve');
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
    const D = need(f.config.decks.find(d => (d.page.policy.back.expanded.on || []).some(o => o.event && o.event.paramReselect)), 'no paramReselect reaction');
    const k = D.page.policy.back.expanded.on.find(o => o.event && o.event.paramReselect).event.paramReselect;
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
    const ids = Object.keys(reg).filter(k => (reg[k].implements || []).includes('interactive'));
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
  ['role slot contracts: every role-typed ref declares the role\'s slots; refs in a slot implement its roles; max counts refs shown at once; first / last name the opening / closing role', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), roles = need(f.roles, 'no roles'), m = f.mk(dev.any(f));
    let n = 0;
    roleSlotsOf(f, m).forEach(({ ref, role, where }) => {
      const Ro = roles[role]; if (!ref || !Ro || !Ro.slots) return; n++;
      const C = reg[ref.component] || {};
      Object.entries(Ro.slots).forEach(([slot, K]) => {
        assert((C.props || {})[slot] === 'slot', ref.component + ' (' + where + ') does not declare slot ' + slot);
        const list = slotRefs((ref.slots || {})[slot]);
        if (K.roles) list.forEach(r => assert(K.roles.some(x => ((reg[r.component] || {}).implements || []).includes(x)), where + '.' + slot + ': ' + r.component + ' is not ' + K.roles.join(' / ')));
        if (K.max != null) { const shown = list.filter(r => !r.when); assert(shown.length <= K.max, where + '.' + slot + ': more than ' + K.max + ' unconditional refs'); }
        if (K.first) { const f0 = list[0]; assert(f0 && ((reg[f0.component] || {}).implements || []).includes(K.first), where + '.' + slot + ' must start with ' + K.first); }
        if (K.last) { const l = list[list.length - 1]; assert(l && ((reg[l.component] || {}).implements || []).includes(K.last), where + '.' + slot + ' must end in ' + K.last); }
      });
      Object.keys(ref.slots || {}).forEach(k => assert(k in Ro.slots || (C.props || {})[k] === 'slot', where + ': slot ' + k + ' is neither part of role ' + role + ' nor declared by ' + ref.component));
    });
    assert(n > 0, 'no role-typed refs with slots');
  }],
  ['toggle reactions flip a boolean field; reselecting the active tab twice expands then conceals', f => {
    const cfg = JSON.parse(JSON.stringify(f.config)), D = cfg.decks.find(d => d.id === cfg.startDeck), P = D.page;
    P.params = { ...(P.params || {}), tg: { type: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } };
    P.policy.params = { ...(P.policy.params || {}), tg: { default: 'a', resetOn: [], scope: null } };
    P.policy.back.expanded = { ...P.policy.back.expanded, on: [{ event: { paramReselect: 'tg' }, set: 'toggle' }] };
    const m = f.createModel(cfg, dev.any(f), f.data), ex = () => m.query.underPage(S(m)).back.expanded, e0 = ex();
    m.dispatch({ type: 'setParams', values: { tg: 'a' } }); assert(ex() === !e0, 'first reselect did not toggle');
    m.dispatch({ type: 'setParams', values: { tg: 'a' } }); assert(ex() === e0, 'second reselect did not toggle back');
  }],
  ['scrollTop fires when the content returns to 0: fields resetting on it reset; derived scrolled follows the crossing', f => {
    const cfg = JSON.parse(JSON.stringify(f.config)), D = cfg.decks.find(d => d.id === cfg.startDeck), P = D.page;
    P.params = { ...(P.params || {}), st: { type: 'flag', data: false } }; P.policy.params = { ...(P.policy.params || {}), st: { default: false, resetOn: ['scrollTop'], scope: null } };
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
    const r = m.query.resolveRef(S(m), m.config, { component: 'probe', props: { t: { bind: '$player.current.title' } } }, u());
    assert(r.props.t === tracks[0].title, '$player.current.title');
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
      const pg = () => m.query.currentPage(S(m)), bv = () => P.barView(pg(), sp), d = bv().distance, full = bv().height;
      assert(bv().progress === 0, kind + ': not expanded at 0');
      m.dispatch({ type: 'scroll', top: d / 2 }); assert(Math.abs(bv().progress - 0.5) < 1e-6, kind + ': half distance → progress ' + bv().progress);
      m.dispatch({ type: 'scroll', top: d }); assert(bv().progress === 1 && Math.abs(full - bv().height - d) < 1e-6, kind + ': not collapsed by exactly distance at scroll = distance');
    });
  }],
  ['collapse-first scroll (15.0): contentOffset stays 0 until the bar has collapsed, then follows scroll − distance', f => {
    const P = need(f.layout, 'no layout'), sp = need(f.specs, 'no specs'); need(P.contentOffset, 'no contentOffset');
    const pages = collapsingPages(f, P, sp); need(pages.length, 'no page with a collapsing bar');
    pages.forEach(({ m, kind }) => {
      const pg = () => m.query.currentPage(S(m)), d = P.barView(pg(), sp).distance;
      [0, d / 3, d].forEach(t => { m.dispatch({ type: 'scroll', top: t }); assert(P.contentOffset(pg(), sp) === 0, kind + ': content moved at ' + t); });
      m.dispatch({ type: 'scroll', top: d + 30 }); assert(Math.abs(P.contentOffset(pg(), sp) - 30) < 1e-6, kind + ': content offset ' + P.contentOffset(pg(), sp));
    });
    const m = f.mk(dev.any(f)), u = () => m.query.underPage(S(m));
    if (!P.barView(u(), sp).distance) { m.dispatch({ type: 'scroll', top: 40 }); assert(P.contentOffset(u(), sp) === 40, 'a page without a collapsing bar: offset = scroll'); }
  }],
  ['items inside a repeat open their element (carousel entries)', f => {
    const m = f.mk(dev.any(f)), u = m.query.underPage(S(m)), cc = u.config.front.content;
    const P = Object.values(cc.presentations).find(P => Object.values(P.item.slots || {}).some(l => l.some(x => x.repeat)));
    need(P, 'no repeated items in a presentation');
    const outer = f.data.get(cc.dataSource, m.query.contentParams(u)).items.find(i => (i.entries || []).some(e => e.opens));
    const slotsOf = m.query.expandSlots(S(m), m.config, Object.values(P.item.slots)[0], u, { item: outer });
    const x = slotsOf.find(e => Object.values(e.scope).some(v => v && v.opens && v.opens.template)); need(x, 'no navigable entry');
    const el = Object.values(x.scope).find(v => v && v.opens && v.opens.template);
    const i = m.query.roleIntent(S(m), m.config, { role: 'item', page: u, item: el }, 'open');
    assert(i && i.type === 'open' && i.item.id === el.id, 'entry did not open itself');
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

  // ── 16.0: page / surface contracts
  ['every page / surface role the config uses is implemented by exactly one design component', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), m = f.mk(dev.any(f)), used = surfaceRolesOf(f, m);
    need(used.size, 'no pages or layers');
    used.forEach(r => { const ids = Object.keys(reg).filter(id => (reg[id].implements || []).includes(r)); assert(ids.length === 1, r + ': implemented by ' + (ids.join(', ') || 'no component') + ' (want exactly one)'); });
  }],
  ['page / surface parts: every part a role names is in the config (unless optional); a part that is a ref implements its role', f => {
    const reg = need(f.specs && f.specs.components, 'no specs'), roles = need(f.roles, 'no roles'), m = f.mk(dev.any(f));
    const subjects = [];
    pagesOf(f, m).forEach(p => {
      if (p.kind === 'backdrop') subjects.push(['backdropPage', p, p.id], ['backLayer', p.back, p.id + ' back'], ['frontLayer', p.front, p.id + ' front']);
      else { subjects.push(['appBarPage', p, p.id]); if (p.sheet) subjects.push(['pageSheet', p.sheet, p.id + ' sheet']); }
    });
    f.config.layers.forEach(L => { const r = { sheet: 'sheetLayer', drawer: 'drawerLayer', fullscreen: 'fullscreenLayer' }[L.presentation.kind]; if (r) subjects.push([r, L, L.id]); });
    need(subjects.length, 'no pages or layers');
    subjects.forEach(([r, obj, where]) => Object.entries((roles[r] || {}).parts || {}).forEach(([name, P]) => {
      const v = rp(obj, P.field);
      if (v === undefined) { assert(P.optional, where + ': ' + r + ' part ' + name + ' (' + P.field + ') missing'); return; }
      if (P.role && v && v.component) assert(((reg[v.component] || {}).implements || []).includes(P.role), where + ': ' + r + ' part ' + name + ' is ' + v.component + ', which does not implement ' + P.role);
    }));
  }],
  ['every role event maps to an intent (activate runs the ref\'s action instead)', f => {
    const roles = need(f.roles, 'no roles'), m = f.mk(dev.any(f)), u = m.query.underPage(S(m)), D = f.config.decks.find(d => d.id === S(m).activeDeck);
    const bound = slotRefs(((D.page.back.regions.basicAction || {}).content)).find(r => r.bind);
    const layerOf = r => (f.config.layers.find(L => ({ sheetLayer: 'sheet', drawerLayer: 'drawer', fullscreenLayer: 'fullscreen' })[r] === L.presentation.kind) || {}).id;
    const other = (otherDeck(f, S(m).activeDeck) || {}).id, it = f.item(m, 'backdrop');
    let n = 0;
    Object.entries(roles).forEach(([r, R]) => Object.keys(R.emits).forEach(ev => {
      if (ev === 'activate') return;
      if (r === 'item' && !it) return; if (r === 'input' && !bound) return; if (r === 'navigation' && !other) return;
      if (/Layer$/.test(r) && r !== 'backLayer' && r !== 'frontLayer' && !layerOf(r)) return;
      const slot = { role: r, page: u, layer: layerOf(r), bind: r === 'input' ? bound.bind : undefined, item: r === 'item' ? it : undefined };
      const payload = ev === 'select' ? other : ev === 'scroll' ? 10 : ev === 'change' || ev === 'submit' ? 'x' : undefined;
      assert(m.query.roleIntent(S(m), m.config, slot, ev, payload), r + '.' + ev + ' has no intent'); n++;
    }));
    need(n, 'no role events');
  }],
  ['page / surface role props mirror state', f => {
    const m = f.mk(dev.any(f)), q = m.query, u = () => q.underPage(S(m)), p = (role, extra) => q.roleProps(S(m), m.config, { role, page: u(), ...extra });
    const ex = u().back.expanded;
    assert(p('backLayer').expanded === ex && p('frontLayer').position === q.frontPosition(S(m)), 'backLayer / frontLayer before toggle');
    m.dispatch({ type: 'toggleExpanded' });
    assert(p('backLayer').expanded === !ex && p('frontLayer').position === q.frontPosition(S(m)), 'backLayer / frontLayer after toggle');
    const L = f.config.layers.find(l => l.presentation.kind === 'sheet');
    if (L) { assert(p('sheetLayer', { layer: L.id }).open === false, 'sheet open before'); m.dispatch({ type: 'openLayer', layer: L.id }); assert(p('sheetLayer', { layer: L.id }).open === true, 'sheet open after'); }
  }],
  // ── 17.0: motion as steps
  ['motion steps: every piece a step names is declared (role slot / part, component part, source / target, a step of the rule); every anchor names a step of the rule; every use names a sequence and gives its params', f => {
    const sp = need(f.specs, 'no specs'), roles = need(f.roles, 'no roles'), reg = sp.components;
    const roleOk = (r, x) => { const R = roles[r]; return !!R && (!x || (R.slots && x in R.slots) || (R.parts && x in R.parts)); };
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
  ['roleProps supplies exactly the props each role declares (roles: one source)', f => {
    const roles = need(f.roles, 'no roles'), m = f.mk(dev.any(f)), u = m.query.underPage(S(m)), D = f.config.decks.find(d => d.id === S(m).activeDeck);
    const bound = slotRefs(((D.page.back.regions.basicAction || {}).content)).find(r => r.bind), it = f.item(m, 'backdrop');
    const layerOf = r => (f.config.layers.find(L => ({ sheetLayer: 'sheet', drawerLayer: 'drawer', fullscreenLayer: 'fullscreen' })[r] === L.presentation.kind) || {}).id;
    const fromLayout = ['bar', 'appBar', 'layout'];   // progress (Layout.barView), groups (Queries.groups)
    let n = 0;
    Object.entries(roles).forEach(([r, R]) => {
      if (fromLayout.includes(r)) return;
      if (/Layer$/.test(r) && r !== 'backLayer' && r !== 'frontLayer' && !layerOf(r)) return;
      const got = Object.keys(m.query.roleProps(S(m), m.config, { role: r, page: u, layer: layerOf(r), bind: r === 'input' && bound ? bound.bind : undefined, item: r === 'item' ? it : undefined })).sort();
      assert(JSON.stringify(got) === JSON.stringify(Object.keys(R.supplies).sort()), r + ': roleProps gives ' + got.join(',') + ', role supplies ' + Object.keys(R.supplies).join(','));
      n++;
    });
    need(n, 'no roles');
  }]
];

export function runInvariants(createModel, fixtures) {
  const f = { ...fixtures, createModel, mk: d => createModel(fixtures.config, d, fixtures.data) };   // fixtures may add: createPlayer, layout, interaction, roles, specs, platforms (PlatformManifest[]), tracks, sampleDialog, sampleSnackbar
  return INVARIANTS.map(([name, fn]) => {
    try { fn(f); return { name, ok: true }; }
    catch (e) { return e instanceof Skip ? { name, ok: true, skipped: true, error: 'skipped: ' + e.message } : { name, ok: false, error: e.message }; }
  });
}
