// Backdrop Nav — CONTRACT TREE (18.0)
// Pure: state + config + composition + design (+ shell measurements) → the drawn config objects of this moment, as nodes.
// A node is one contract instance (api/contracts.js): its config, its values, its children, and what composition hired
// to draw it — the free component, its props (clauses resolved), its slots (filled with child nodes) and its events
// (each an intent, or the config's own action). The platform walks the tree and draws node.component with node.props.
//
//   contractTree(model, specs, composition, opts) → Node (the app)
//   opts = { look (compose.js lookAt), measured: { <pageId>: { panel } }, peek: number, data: DataSource, page?, within?, origin?, key? }
//   with opts.page: { page: Node } — that page alone
//   Node = { key, contract, at, page, config, values, hire, component, variants, props, slots, events, children, shown? }
//   shown: false on an item whose when does not hold (lists keep it, so a platform can fade it in and out)
//   events: { <event>: payload → Intent | { action: Actions } | null }

import { placementFor, hireOf, freeComponent } from './compose.js';
import * as Layout from './layout.js';
import { moreControls, backRows } from './navigation.js';

const ITEM_CONTRACT = { button: 'button', logo: 'logo', text: 'text', switch: 'switch', find: 'find', detail: 'detail', seek: 'seek' };

export function contractTree(model, specs, composition, opts = {}) {
  const s = model.getState(), c = model.config, q = model.query, look = opts.look, data = opts.data || model.data;
  const env = Layout.env(s, c, q), g = Layout.geometry(s, c, q, look);
  const text = id => q.text(s, c, id);
  const val = (v, page, scope) => q.value(s, c, v, page, scope);
  const holds = (it, page) => !it.when || q.condition(s, c, it.when, page);
  const pageIdOf = page => page ? Layout.pageId(page) : null;
  const player = q.playerView() || null;

  // ── a node: placement → hire → free component; props and events from the hire's clauses (implied where names match)
  function node(contract, key, ctx, config, values, children, extra = {}) {
    const at = { contract, page: pageIdOf(ctx.page), within: ctx.within, env, ...extra.at };
    const hn = placementFor(composition, at), h = hn ? hireOf(composition, hn) : null;
    const n = { key, contract, at, page: ctx.page || null, config, values, children, hire: h ? h.name : hn === null ? null : undefined, component: h ? h.hires : null, variants: {}, props: {}, slots: {}, events: {} };
    if (h) dress(n, h, ctx, extra);
    return n;
  }
  function dress(n, h, ctx, extra) {
    const fc = freeComponent(specs.components, h.hires) || { props: {}, slots: [], events: [] };
    n.variants = Object.fromEntries((h.variants || []).map(v => [v.axis, v.option]));
    const tok = name => { const t = (h.tokens || []).find(x => x.name === name); return t ? specs.tokens[t.alias] : undefined; };
    for (const prop of Object.keys(fc.props)) {
      const cl = h.clauses.find(x => x.prop === prop);
      n.props[prop] = !cl ? n.values[prop]
        : 'cases' in cl ? tok(((cl.cases.find(k => k.equals === String(n.values[cl.value])) || {}).token))
        : 'value' in cl ? n.values[cl.value]
        : 'token' in cl ? tok(cl.token)
        : 'text' in cl ? text(cl.text) : undefined;
    }
    for (const ev of fc.events) {
      const cl = h.clauses.find(x => x.event === ev); if (!cl) continue;
      n.events[ev] = payload => intentFor(n, cl.send, ev, payload, ctx, extra, cl);
    }
    // slots: written fills (children, picked items, other hires on this same node), else the child of the same name
    const picked = new Set();
    const fills = h.clauses.filter(x => 'slot' in x);
    const pickFrom = (list, sel) => sel.rest ? null : list.filter(m => (!sel.kind || (m.config && m.config.kind) === sel.kind) && (!sel.name || (m.config && m.config.name) === sel.name));
    for (const cl of fills) for (const src of cl.fill) if ('child' in src && src.pick) { const L = [].concat(n.children[src.child] || []); src.pick.forEach(sel => (pickFrom(L, sel) || []).forEach(m => picked.add(m))); }
    for (const slot of fc.slots) {
      const cl = fills.find(x => x.slot === slot);
      if (!cl) { if (slot in n.children) n.slots[slot] = [].concat(n.children[slot] || []); continue; }
      n.slots[slot] = cl.fill.flatMap(src => {
        if ('hire' in src) { const o = hireOf(composition, src.hire); if (!o) return []; const m = { ...n, key: n.key + '#' + src.hire, hire: o.name, component: o.hires, variants: {}, props: {}, slots: {}, events: {} }; dress(m, o, ctx, extra); return [m]; }
        const L = [].concat(n.children[src.child] || []);
        if (!src.pick) return L;
        return src.pick.flatMap(sel => sel.rest ? L.filter(m => !picked.has(m)) : pickFrom(L, sel));
      });
    }
  }

  // ── intents: what a node's event sends ('action': the config's own action, or an item's open / itemAction)
  function intentFor(n, send, ev, payload, ctx, extra, cl = {}) {
    const page = ctx.page, pid = page ? page.config.id : undefined;
    switch (send) {
      case 'action': {
        if (n.contract === 'item') { const it = n.config.item; return it.opens ? { type: 'open', item: it, origin: ctx.origin } : extra.itemAction ? { action: q.resolved(extra.itemAction, page, { item: it }) } : null; }
        return n.config.action ? { action: q.resolved(n.config.action, page, extra.scope) } : null;
      }
      case 'setParams': {
        if (n.contract === 'switch') return n.values.next == null ? null : { type: 'setParams', values: { [n.config.param]: n.values.next }, page: pid };
        if (n.contract === 'find') return { type: 'setParams', values: { [n.config.param]: payload }, page: pid };
        const b = n.contract === 'paramControl' ? n.config.bind : null; if (!b) return null;
        return { type: 'setParams', values: { [b]: payload }, page: pid, ...(cl.apply ? { apply: true } : {}) };
      }
      case 'toggleParam': return n.contract === 'paramControl' ? { type: 'toggleParam', name: n.config.bind, option: String(payload), page: pid } : null;
      case 'applyParams': return n.contract === 'paramControl' ? { type: 'applyParams', names: [n.config.bind], page: pid } : null;
      case 'discardParams': return n.contract === 'paramControl' ? { type: 'discardParams', names: [n.config.bind], page: pid } : null;
      case 'openMore': return n.contract === 'paramControl' && n.config.more ? { type: 'openMore', name: n.config.bind, page: pid } : null;
      case 'closeMore': return n.contract === 'paramControlMore' ? { type: 'closeMore', page: pid } : null;
      case 'seek': return { type: 'seek', positionMs: +payload || 0 };
      case 'toggleExpanded': return n.contract === 'backLayer' && n.config.toggleOnTap === false ? null : { type: 'toggleExpanded' };
      case 'scroll': {   // a header's detail scrolls the surface below it: the back layer's panel while revealed, else the content; a back layer's own scroll is its panel's
        const panel = n.contract === 'backLayer' || n.contract === 'header' && page && page.config.kind === 'backdrop' && page.back.expanded && ((page.config.back.panel || []).length || (page.back.more || []).length);
        return { type: 'scroll', top: Math.max(0, +payload || 0), ...(panel ? { surface: 'panel' } : {}) };
      }
      case 'retry': return { type: 'retry' };
      case 'openFind': return { type: 'openFind' };
      case 'closeFind': return { type: 'closeFind' };
      case 'openLayer': return { type: 'openLayer', layer: extra.layer };
      case 'closeLayer': return { type: 'closeLayer', layer: extra.layer };
      case 'closeOverlay': return { type: 'closeOverlay', result: payload };
      case 'switchDeck': return { type: n.values.selected ? 'reselectDeck' : 'switchDeck', deck: n.values.deck };
      case 'reselectDeck': return { type: 'reselectDeck', deck: n.values.deck };
    }
    return null;
  }

  // ── items: header items, body items, actions, navigation items, overlay items
  const paramOf = (page, name) => page ? q.value(s, c, { bind: 'params.' + name }, page) : undefined;
  function itemNode(it, key, ctx) {
    const page = ctx.page, k = key + ':' + it.name, at = { kind: it.kind, name: it.name };
    switch (it.kind) {
      case 'button': return node('button', k, ctx, it, { label: String(val(it.label, page) ?? ''), checked: it.checked == null ? null : !!val(it.checked, page), state: it.state == null ? null : val(it.state, page) }, {}, { at });
      case 'logo': return node('logo', k, ctx, it, { label: String(val(it.label, page) ?? ''), playing: !!(player && player.status === 'playing') }, {}, { at });
      case 'text': return node('text', k, ctx, it, { text: String(val(it.text, page) ?? '') }, {}, { at });
      case 'switch': {
        const options = q.paramOptions(s, c, page, it.param) || [], v = paramOf(page, it.param), ix = options.findIndex(o => o.value === v);
        return node('switch', k, ctx, it, { label: String(val(it.label, page) ?? ''), value: v ?? null, next: options.length ? options[(ix + 1) % options.length].value : null, options }, {}, { at });
      }
      case 'find': {
        const F = (page.config.kind === 'appBar' ? page.find : page.front && page.front.find) || { opened: false, closed: false }, v = String(paramOf(page, it.param) ?? '');
        const scrolled = (page.config.kind === 'appBar' ? +page.scroll : +(page.front && page.front.scroll)) > 0;
        return node('find', k, ctx, it, { open: (scrolled && !F.closed) || F.opened || v !== '', value: v, placeholder: String(val(it.placeholder, page) ?? ''), closeLabel: text('find.close') }, {}, { at });
      }
      case 'detail': return detailNode(it.detail, k, ctx, it, at);
      case 'seek': {
        const cur = player && player.current;
        return node('seek', k, ctx, it, { label: String(val(it.label, page) ?? ''), positionMs: player ? +player.positionMs || 0 : 0, durationMs: cur ? cur.durationMs ?? null : null }, {}, { at });
      }
    }
    return null;
  }
  function detailNode(d, key, ctx, config = d, at = {}) {
    const page = ctx.page, v = x => x == null ? null : val(x, page) ?? null;
    return node('detail', key, ctx, config, { title: String(v(d.title) ?? ''), subtitle: v(d.subtitle), image: v(d.image), meta: v(d.meta) }, {}, { at });
  }
  // every item, each with shown (its when holds): a platform keeps hidden ones drawn so they can fade in and out
  const items = (list, key, ctx) => (list || []).map(it => { const n = itemNode(it, key, ctx); if (n) n.shown = holds(it, ctx.page); return n; }).filter(Boolean);
  const inside = (ctx, contract) => ({ ...ctx, within: [contract, ...ctx.within] });

  // a Source: a list, or a data source with params (values resolved on the page)
  const sourceItems = (src, page) => Array.isArray(src) ? src : src && src.dataSource ? (data.get(src.dataSource, Object.fromEntries(Object.entries(src.params || {}).map(([n, v]) => [n, val(v, page)]))).items || []) : [];

  // ── headers: the back layer's, an app-bar page's, the peek's
  function headerNode(H, key, ctx, progress, title) {
    const w = inside(ctx, 'header');
    const children = { items: items(H.items, key + '.items', w), ...(H.detail ? { detail: detailNode(H.detail, key + '.detail', w) } : {}) };
    return node('header', key, ctx, H, { title, progress }, children);
  }

  // ── param controls: one control for one page param; rows of them (only those whose when holds)
  const textOf = (l, fallback) => typeof l === 'object' && l ? text(l) : l == null ? fallback : String(l);
  function paramControlNode(cfg, key, ctx) {
    const page = ctx.page, name = cfg.bind, spec = (page.config.params || {})[name] || {};
    const value = val({ bind: 'pending.' + name }, page) ?? null, many = spec.type === 'choices';
    const raw = cfg.options ? sourceItems(cfg.options, page).map(o => ({ value: String(o.value), label: textOf(o.label, String(o.value)) })) : q.paramOptions(s, c, page, name) || [];
    const options = raw.map(o => ({ value: o.value, label: o.label, selected: many ? Array.isArray(value) && value.includes(o.value) : value === o.value }));
    const values = { value, options, pending: !!(page.pending && name in page.pending), label: spec.label != null ? String(val(spec.label, page) ?? '') : null, placeholder: spec.placeholder != null ? String(val(spec.placeholder, page) ?? '') : null, min: spec.min ?? null, max: spec.max ?? null, more: !!cfg.more };
    return node('paramControl', key, ctx, cfg, values, {}, { at: { param: { name, type: spec.type, axis: !!spec.axis, options: !!cfg.options } } });
  }
  // the open More (the newest in BackLayerState.more): its rows, or one row with a control for the same param (all its options)
  function moreNode(B, page, key, ctx) {
    const name = (page.back.more || []).slice(-1)[0], x = name && moreControls(backRows(B)).find(m => m.bind === name); if (!x) return null;
    const spec = (page.config.params || {})[name] || {}, rows = x.more.paramControls || [{ controls: [{ bind: name }] }];
    return node('paramControlMore', key, ctx, x.more, { title: spec.label != null ? String(val(spec.label, page) ?? '') : null }, { paramControls: paramControlRows(rows, key + '.paramControls', inside(ctx, 'paramControlMore')) });
  }
  // group: the back layer's group the rows sit in ('controls' · 'panel'; a More's rows have none) — placements match it as the row's name
  function paramControlRows(rows, key, ctx, group) {
    const page = ctx.page, rw = inside(ctx, 'paramControlRow');
    return (rows || []).map((r, j) => [r, j]).filter(([r]) => holds(r, page)).map(([r, j]) => {
      const controls = r.controls.map((x, i) => [x, i]).filter(([x]) => holds(x, page)).map(([x, i]) => paramControlNode(x, key + ':' + j + '.controls:' + i, rw));
      return node('paramControlRow', key + ':' + j, ctx, r, { label: controls.length ? controls[0].values.label : null }, { controls }, group ? { at: { name: group } } : {});
    });
  }

  // ── content: the page's data under its params, by presentation
  function contentNode(C, key, ctx, origin) {
    const page = ctx.page, w = inside(ctx, 'content');
    const d = data.get(C.dataSource, q.contentParams(page)), view = q.contentView(page, d, c, false), P = q.presentation(page);
    const shown = view.showItems ? q.visibleItems(page, d) : [];
    const itemNodeOf = (it, k, wctx) => {
      const values = { title: String(it.title ?? ''), subtitle: it.subtitle ?? null, image: it.image ?? null, shape: it.shape || 'square', current: !!it.current, navigable: !!it.opens };
      const kids = it.entries ? { entries: it.entries.map((e, j) => itemNodeOf(e, k + '.entries:' + (e.id ?? j), inside(wctx, 'item'))) } : {};
      return node('item', k, wctx, { ...P, item: it }, values, kids, { at: { presentation: P.key }, itemAction: P.itemAction });
    };
    const itemCtx = { ...w, origin };
    const children = { items: shown.map((it, j) => itemNodeOf(it, key + '.items:' + (it.id ?? j), itemCtx)) };
    const st = view.state === 'empty' || view.state === 'error' ? view.state : null;
    if (st) children.state = node('contentState', key + '.state', w, C, { state: st, retry: !!view.retry }, {}, { at: { state: st } });
    if (view.banner) children.banner = node('contentState', key + '.banner', w, C, { state: 'offlineStale', retry: !!view.retry }, {}, { at: { state: 'offlineStale' } });
    const groups = q.groups(s, c, page, shown);
    return node('content', key, ctx, C, { view, presentation: P.key, groups, placeholders: view.placeholders || 0 }, children, { at: { presentation: P.key } });
  }

  // ── pages
  function pageNode(page, key, ctx, origin) {
    const cfg = page.config, title = q.derived(s, c, 'pageTitle', page);
    if (cfg.kind === 'backdrop') {
      const w = { ...inside(ctx, 'backdropPage'), page }, bw = inside(w, 'backLayer'), fw = inside(w, 'frontLayer'), B = cfg.back, k = key + '.back';
      const bar = Layout.barView(page, look), measured = (opts.measured || {})[cfg.id] || {};
      const back = node('backLayer', k, w, B, { expanded: !!page.back.expanded, headerHidden: !!page.back.headerHidden, regions: Layout.regions(page, look, measured, g) }, {
        header: headerNode(B.header, k + '.header', bw, bar.progress, title),
        actions: items(B.actions, k + '.actions', bw),
        controls: paramControlRows(B.controls, k + '.controls', bw, 'controls'),
        panel: paramControlRows(B.panel, k + '.panel', bw, 'panel'),
        ...(() => { const m = moreNode(B, page, k + '.more', bw); return m ? { more: m } : {}; })(),
      });
      const fl = Layout.frontLayer(page, g, look, { measured }, opts.peek || 0), F = cfg.front, fk = key + '.front';
      const fh = node('frontHeader', fk + '.header', fw, F.header, { title: String(val(F.header.title, page) ?? ''), expanded: !!page.back.expanded, disclosureLabel: text(page.back.expanded ? 'backLayer.conceal' : 'backLayer.reveal') }, { items: items(F.header.items, fk + '.header.items', inside(fw, 'frontHeader')) });
      const front = node('frontLayer', fk, w, F, { position: page.back.expanded ? F.collapse : 'expanded', top: fl.top, contentOffset: Layout.contentOffset(page, look) }, { header: fh, content: contentNode(F.content, fk + '.content', fw, origin) });
      return node('backdropPage', key, ctx, cfg, {}, { back, front }, {});
    }
    const w = { ...inside(ctx, 'appBarPage'), page };
    const bar = Layout.barView(page, look, ctx.within);
    const children = {
      header: headerNode(cfg.header, key + '.header', w, bar.progress, title),
      ...(cfg.content ? { content: contentNode(cfg.content, key + '.content', w, origin) } : {}),
      body: items(cfg.body, key + '.body', w),
    };
    if (cfg.sheet) {
      const sw = inside(w, 'pageSheet'), S = cfg.sheet;
      children.sheet = node('pageSheet', key + '.sheet', w, S, { expanded: !!(page.sheet && page.sheet.expanded) }, { ...(S.paramControl ? { paramControl: paramControlNode(S.paramControl, key + '.sheet.paramControl', sw) } : {}), content: contentNode(S.content, key + '.sheet.content', sw, origin) });
    }
    return node('appBarPage', key, ctx, cfg, { contentOffset: Layout.contentOffset(page, look, ctx.within) }, children);
  }
  const top = stack => stack[stack.length - 1].page;

  // ── layers, navigation, overlays, launch
  function layerNode(L) {
    const kind = { sheet: 'sheetLayer', drawer: 'drawerLayer', fullscreen: 'fullscreenLayer' }[L.presentation.kind], LS = s.layers[L.id], open = !!LS.open, wide = g.wide;
    const ctx = { within: [kind], page: null }, key = 'layer:' + L.id, origin = { layer: L.id };
    const children = { page: pageNode(top(LS.stack), key + '.page', ctx, origin) };
    let values = { open };
    if (kind === 'sheetLayer') {
      const form = wide ? 'sideSheet' : 'bottomSheet', P = L.presentation[wide ? 'wide' : 'compact'].peek;
      const under = q.underPage(s), fl = under && under.config.kind === 'backdrop' ? Layout.frontLayer(under, g, look, {}, opts.peek || 0).top : 0;
      values = { open, form, side: wide ? q.sideMode(s, c, L.id) : null, peek: Layout.peekPlacement(s, c, g, fl, under && under.config.kind === 'backdrop' ? under : null, look) };
      children.peek = headerNode(P.header, key + '.peek', { within: [kind], page: top(LS.stack) }, 0, null);
    }
    if (kind === 'drawerLayer') values = { open, form: wide ? (L.presentation.wide || 'modal') : 'modal' };
    return node(kind, key, { within: [], page: null }, L, values, children, { at: { name: L.id }, layer: L.id });
  }
  function navigationNode() {
    const ctx = { within: ['navigation'], page: null }, rail = c.layers.find(L => L.presentation.kind === 'drawer' && L.presentation.wide === 'rail');
    const destinations = c.decks.map(d => node('destination', 'nav.destinations:' + d.id, ctx, d, { deck: d.id, label: text(d.name), selected: d.id === s.activeDeck }, {}, { at: { name: d.id } }));
    return node('navigation', 'nav', { within: [], page: null }, c.navigation, { selected: s.activeDeck, expanded: !!(rail && s.layers[rail.id].open && g.wide) }, { destinations, items: items(c.navigation.items, 'nav.items', { ...ctx, page: model.query.currentPage(s) }) });
  }
  function overlayNode(o, j) {
    const ctx = { within: ['overlay'], page: model.query.currentPage(s) }, T = o.texts || {}, t = k => T[k] == null ? null : String(val(T[k], ctx.page) ?? '');
    return node('overlay', 'overlay:' + (o.id || j), { within: [], page: null }, o, { title: t('title'), body: t('body'), confirm: t('confirm'), cancel: t('cancel'), text: t('text'), action: t('action') }, { items: items(o.items, 'overlay:' + (o.id || j) + '.items', ctx) }, { at: { overlay: o.kind, name: o.id } });
  }

  // one page only (opts.page: a page state, opts.within: where it sits, opts.origin: what its items open from)
  if (opts.page) return { page: pageNode(opts.page, opts.key || 'page:' + opts.page.config.id, { within: opts.within || [], page: null }, opts.origin || { deck: s.activeDeck }) };
  const deckPage = top(s.decks[s.activeDeck].stack);
  return {
    key: 'app', contract: null,
    navigation: navigationNode(),
    deck: pageNode(deckPage, 'deck:' + s.activeDeck, { within: [], page: null }, { deck: s.activeDeck }),
    layers: c.layers.map(layerNode),
    overlays: (s.overlays || []).map((o, j) => overlayNode(o.spec || o, j)),
    splash: s.launch === 'starting' && c.launch ? node('splash', 'splash', { within: [], page: null }, c.launch, { label: text('splash.loading') }, {}) : null,
  };
}

// every node of a tree, depth first (children, then slots' own hire nodes)
export function walk(n, f, seen = new Set()) {
  if (!n || typeof n !== 'object' || seen.has(n)) return; seen.add(n);
  if (n.contract) f(n);
  const kids = n.contract ? Object.values(n.children || {}) : [n.navigation, n.deck, ...(n.layers || []), ...(n.overlays || []), n.splash];
  kids.flat().forEach(k => walk(k, f, seen));
  if (n.contract) Object.values(n.slots || {}).flat().forEach(k => walk(k, f, seen));
}
