// Backdrop Nav — COMPOSITION RULES (18.0)
// Check composition (app/composition.json) against the contracts (api/contracts.js), the config (app/app.json) and
// design's free components, tokens and texts.
//
// runCompositionRules(f) → [{ name, ok, skipped?, error? }]
// f = { contracts, unions, config, composition, components: { <id>: raw design json }, tokens: design tokens.json, designTexts: { <locale>: design/texts/<locale>.json } }

import { placementFor, hireOf as findHire, freeComponent } from '../core/compose.js';
import { resolvedContracts } from './contracts.js';

const assert = (c, msg) => { if (!c) throw new Error(msg); };
class Skip extends Error {}
const skip = msg => { throw new Skip(msg); };

const tokenExists = (tokens, name) => { let n = tokens; for (const k of name.split('.')) { if (!n || typeof n !== 'object' || !(k in n)) return false; n = n[k]; } return !!n && typeof n === 'object' && '$value' in n; };
const hireOf = (f, name) => findHire(f.composition, name);

// ── the drawn objects of the config: one 'place' per contract instance, with what placement may match on
export function placesOf(config) {
  const out = [];
  // a param control's place: matched by its param (name, type, axis) and whether it brings its own options (core/contracts.js at.param)
  const paramOf = (page, x) => { const sp = (page.params || {})[x.bind] || {}; return { name: x.bind, type: sp.type, axis: !!sp.axis, options: !!x.options }; };
  // within: the ancestor contracts, nearest first · items whose when does not hold are still drawn (hidden), so they count
  const item = (page, within, it) => out.push({ contract: it.kind, page: page.id, within, kind: it.kind, name: it.name });
  const header = (page, within, h) => { const w = ['header', ...within]; out.push({ contract: 'header', page: page.id, within }); h.items.forEach(i => item(page, w, i)); if (h.detail) out.push({ contract: 'detail', page: page.id, within: w }); };
  const content = (page, within, c) => {
    const w = ['content', ...within];
    c.presentations.forEach(pr => {
      out.push({ contract: 'content', page: page.id, within, presentation: pr.key }, { contract: 'item', page: page.id, within: w, presentation: pr.key });
      out.push({ contract: 'item', page: page.id, within: ['item', ...w], presentation: pr.key });   // a shelf's entries (data decides whether any exist)
    });
    ['empty', 'error', 'offlineStale'].forEach(state => out.push({ contract: 'contentState', page: page.id, within: w, state }));
  };
  const control = (page, within, x) => out.push({ contract: 'paramControl', page: page.id, within, param: paramOf(page, x) });
  // param-control rows and their controls, and each control's More (its rows, or the default one row for the same param)
  // group: the back layer's group ('controls' · 'panel'), the row's name for placements; a More's rows have none
  const rows = (page, within, list, depth = 0, group) => (list || []).forEach(r => {
    out.push({ contract: 'paramControlRow', page: page.id, within, ...(group ? { name: group } : {}) });
    r.controls.forEach(x => {
      control(page, ['paramControlRow', ...within], x);
      if (x.more && depth < 8) { const m = ['paramControlMore', ...within.slice(within.indexOf('backLayer'))]; out.push({ contract: 'paramControlMore', page: page.id, within: m.slice(1) }); rows(page, m, x.more.paramControls || [{ controls: [{ bind: x.bind }] }], depth + 1); }
    });
  });
  const pageOf = (p, within = []) => {
    const kind = p.kind === 'backdrop' ? 'backdropPage' : p.sheet ? 'playerPage' : 'appBarPage';   // core/layout.js pageContract
    out.push({ contract: kind, page: p.id, within });
    const w = [kind, ...within];
    if (p.kind === 'backdrop') {
      const b = ['backLayer', ...w], fr = ['frontLayer', ...w];
      out.push({ contract: 'backLayer', page: p.id, within: w }, { contract: 'frontLayer', page: p.id, within: w }, { contract: 'frontHeader', page: p.id, within: fr });
      header(p, b, p.back.header);
      (p.back.actions || []).forEach(i => item(p, b, i));
      rows(p, b, p.back.controls, 0, 'controls'); rows(p, b, p.back.panel, 0, 'panel');
      p.front.header.items.forEach(i => item(p, ['frontHeader', ...fr], i));
      content(p, fr, p.front.content);
    } else {
      header(p, w, p.header);
      (p.body || []).forEach(i => item(p, w, i));
      if (p.content) content(p, w, p.content);
      if (p.sheet) { const s = ['pageSheet', ...w]; out.push({ contract: 'pageSheet', page: p.id, within: w }); if (p.sheet.paramControl) control(p, s, p.sheet.paramControl); content(p, s, p.sheet.content); }
    }
  };
  config.decks.forEach(d => { pageOf(d.page); out.push({ contract: 'destination', page: null, within: ['navigation'], name: d.id }); });
  Object.values(config.pages || {}).forEach(p => pageOf(p));
  config.layers.forEach(L => {
    const kind = { sheet: 'sheetLayer', drawer: 'drawerLayer', fullscreen: 'fullscreenLayer' }[L.presentation.kind];
    out.push({ contract: kind, page: null, name: L.id });
    if (L.presentation.kind === 'sheet') ['compact', 'wide'].forEach(f => header({ id: null }, [kind], L.presentation[f].peek.header));
    Object.values(L.pages.set).forEach(p => pageOf(p, [kind]));
  });
  ((config.session || {}).gates || []).forEach(g => pageOf(g.page));
  out.push({ contract: 'navigation', page: null });
  config.navigation.items.forEach(i => item({ id: null }, ['navigation'], i));
  ['dialog', 'snackbar'].forEach(overlay => out.push({ contract: 'overlay', page: null, overlay }));   // the shell's own (fixtures)
  const overlays = []; (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.type === 'openOverlay' && o.overlay) overlays.push(o.overlay); Object.values(o).forEach(walk); } })(config);
  overlays.forEach(ov => { out.push({ contract: 'overlay', page: null, overlay: ov.kind, name: ov.id }); (ov.items || []).forEach(i => item({ id: null }, ['overlay'], i)); });
  if (config.launch) out.push({ contract: 'splash', page: null });
  return out;
}

// a placement Q catches every place P catches (P listed later is then never reached)
const covers = (q, p) => q.contract === p.contract
  && (!q.within || (!!p.within && [].concat(q.within).every((w, i) => [].concat(p.within)[i] === w)))
  && ['overlay', 'presentation', 'state'].every(k => q[k] == null || q[k] === p[k])
  && (!q.match || (!!p.match && Object.entries(q.match).every(([k, v]) => p.match[k] === v)))
  && (!q.param || (!!p.param && Object.entries(q.param).every(([k, v]) => p.param[k] === v)))
  && (!q.env || (!!p.env && q.env.env === p.env.env && q.env.equals === p.env.equals));
const sameHire = (a, b) => a.hires === b.hires && a.contract === b.contract && JSON.stringify(a.clauses) === JSON.stringify(b.clauses)
  && JSON.stringify(a.picks || {}) === JSON.stringify(b.picks || {}) && JSON.stringify(a.visuals || {}) === JSON.stringify(b.visuals || {});

export const COMPOSITION_RULES = [
  ['every hire wraps a registered free component and meets a declared contract', f => {
    f.composition.hires.forEach(h => {
      assert(f.components[h.hires], h.name + ': free component ' + h.hires + ' is not registered in design');
      assert(f.contracts[h.contract], h.name + ': contract ' + h.contract + ' is not declared');
    });
  }],
  ['hire names are unique', f => {
    const seen = new Set(); f.composition.hires.forEach(h => { assert(!seen.has(h.name), 'two hires named ' + h.name); seen.add(h.name); });
  }],
  ['every placement names a hire for its own contract (or null)', f => {
    [...f.composition.placements, ...(f.composition.pages || []).flatMap(p => p.placements)].forEach(p => {
      if (p.hire === null) return;
      const h = hireOf(f, p.hire); assert(h, 'placement for ' + p.contract + ' names unknown hire ' + p.hire);
      assert(h.contract === p.contract, 'placement for ' + p.contract + ' names ' + p.hire + ', a hire for ' + h.contract);
    });
  }],
  ['every clause names a prop, event or slot the free component declares', f => {
    const errs = [];
    f.composition.hires.forEach(h => {
      const c = freeComponent(f.components, h.hires); if (!c) return;
      h.clauses.forEach(cl => {
        if ('slot' in cl && !c.slots.includes(cl.slot)) errs.push(h.name + ': ' + h.hires + ' has no slot ' + cl.slot);
        if ('prop' in cl && !(cl.prop in c.props)) errs.push(h.name + ': ' + h.hires + ' has no prop ' + cl.prop);
        if ('event' in cl && !c.events.includes(cl.event)) errs.push(h.name + ': ' + h.hires + ' has no event ' + cl.event);
      });
    });
    assert(!errs.length, errs.length + ': ' + errs.join(' · '));
  }],
  ['every clause names a value, intent or child its contract offers', f => {
    f.composition.hires.forEach(h => {
      const C = f.contracts[h.contract]; if (!C) return;
      h.clauses.forEach(cl => {
        if ('value' in cl) assert(cl.value in C.values, h.name + ': contract ' + h.contract + ' has no value ' + cl.value);
        if ('send' in cl) assert(C.intents.includes(cl.send), h.name + ': contract ' + h.contract + ' does not send ' + cl.send);
        if ('apply' in cl) assert(cl.send === 'setParams', h.name + ': apply on ' + cl.send + ' (only setParams applies)');
        if ('fill' in cl) cl.fill.forEach(s => {
          if ('child' in s) assert((C.children || {})[s.child], h.name + ': contract ' + h.contract + ' has no child ' + s.child);
          if ('hire' in s) { const o = hireOf(f, s.hire); assert(o, h.name + ': unknown hire ' + s.hire); assert(o.contract === h.contract, h.name + ': ' + s.hire + ' meets ' + o.contract + ', not ' + h.contract); }
        });
      });
    });
  }],
  ['every child of a contract reaches a slot (written or implied by name): required ones in every placed hire, optional ones in at least one', f => {
    const nested = new Set(f.composition.hires.flatMap(h => h.clauses.filter(cl => 'fill' in cl).flatMap(cl => cl.fill.filter(s => 'hire' in s).map(s => s.hire))));
    const draws = (h, k) => { const c = freeComponent(f.components, h.hires); return !!c && (h.clauses.some(cl => 'fill' in cl && cl.fill.some(s => s.child === k)) || c.slots.includes(k)); };
    const errs = [];
    Object.entries(f.contracts).forEach(([id, C]) => Object.entries(C.children || {}).forEach(([k, ch]) => {
      const hs = f.composition.hires.filter(h => h.contract === id && !nested.has(h.name));
      if (ch.optional) { if (hs.length && !hs.some(h => draws(h, k))) errs.push(id + ': no hire draws optional child ' + k); }
      else hs.forEach(h => { if (!draws(h, k)) errs.push(h.name + ': child ' + k + ' (' + h.hires + ' has no slot ' + k + ')'); });
    }));
    assert(!errs.length, errs.length + ': ' + errs.join(' · '));
  }],
  ['every token a clause or a hire\'s visuals name is a design token, and a hire\'s visuals name visuals its component has', f => {
    const errs = [], toks = v => !v || typeof v !== 'object' ? [] : Array.isArray(v) ? v.flatMap(toks) : 'token' in v ? [v.token] : Object.values(v).flatMap(toks);
    const visualsOf = (id, k = 0) => { const d = f.components[id]; return !d || k > 8 ? [] : [...Object.keys(d.visuals || {}), ...visualsOf(d.extends, k + 1)]; };
    f.composition.hires.forEach(h => {
      h.clauses.forEach(cl => toks(cl.token ? { token: cl.token } : {}).concat(toks(cl.cases || [])).forEach(t => { if (!tokenExists(f.tokens, t)) errs.push(h.name + ': ' + t + ' is not a design token'); }));
      const has = new Set(visualsOf(h.hires));
      Object.entries(h.visuals || {}).forEach(([v, row]) => {
        if (!has.has(v)) errs.push(h.name + ': ' + h.hires + ' has no visual ' + v);
        toks(row).forEach(t => { if (!tokenExists(f.tokens, t)) errs.push(h.name + '.' + v + ': ' + t + ' is not a design token'); });
      });
    });
    assert(!errs.length, errs.length + ': ' + errs.join(' · '));
  }],
  ['every design text a clause names exists in every locale', f => {
    const errs = [];
    f.composition.hires.forEach(h => h.clauses.forEach(cl => { if ('text' in cl) Object.entries(f.designTexts || {}).forEach(([loc, T]) => { if (!(cl.text in T)) errs.push(h.name + ': ' + cl.text + ' (' + loc + ')'); }); }));
    assert(!errs.length, errs.length + ': ' + errs.join(' · '));
  }],
  ['a hire\'s picks name a setting its component still offers (not picked by a child) and one of its options', f => {
    f.composition.hires.forEach(h => {
      const c = freeComponent(f.components, h.hires); if (!c) return;
      Object.entries(h.picks || {}).forEach(([axis, option]) => { const ax = c.variants[axis]; assert(ax && ax.options.includes(option), h.name + ': ' + h.hires + ' offers no setting ' + axis + ' = ' + option); });
    });
  }],
  ['two hires are never the same (same free component, contract, clauses, picks and visuals)', f => {
    const errs = [];
    f.composition.hires.forEach((h, i) => f.composition.hires.slice(i + 1).forEach(o => { if (sameHire(h, o)) errs.push(h.name + ' = ' + o.name); }));
    assert(!errs.length, errs.length + ': ' + errs.join(' · '));
  }],
  ['no placement is shadowed by an earlier one in the same list', f => {
    const errs = [];
    const check = (list, where) => list.forEach((p, j) => { const q = list.slice(0, j).find(q => covers(q, p)); if (q) errs.push(where + ': ' + JSON.stringify(p) + ' never reached (caught by ' + (q.hire === null ? 'null' : q.hire) + ')'); });
    check(f.composition.placements, 'defaults');
    (f.composition.pages || []).forEach(pg => check(pg.placements, pg.page));
    assert(!errs.length, errs.length + ': ' + errs.join(' · '));
  }],
  ['every prop of a hired free component is fed (by a clause or a contract value of the same name), unless design marks it optional', f => {
    const errs = [];
    f.composition.hires.forEach(h => {
      const c = freeComponent(f.components, h.hires), C = f.contracts[h.contract]; if (!c || !C) return;
      Object.keys(c.props).forEach(prop => { if (!c.optional.includes(prop) && !h.clauses.some(cl => cl.prop === prop) && !(prop in C.values)) errs.push(h.name + '.' + prop); });
    });
    assert(!errs.length, errs.length + ' unfed: ' + errs.join(' · '));
  }],
  ['every drawn config object has a placement on every layout', f => {
    const errs = new Set();
    placesOf(f.config).forEach(at => ['compact', 'wide'].forEach(layout => {
      if (placementFor(f.composition, { ...at, env: { layout } }) === undefined) errs.add(at.contract + (at.name ? ' ' + at.name : '') + (at.presentation ? ' ' + at.presentation : '') + (at.state ? ' ' + at.state : '') + (at.within ? ' in ' + at.within : '') + (at.page ? ' (' + at.page + ')' : '') + ' on ' + layout);
    }));
    assert(!errs.size, errs.size + ': ' + [...errs].slice(0, 40).join(' · '));
  }],
];

export function runCompositionRules(f) {
  f = { ...f, contracts: resolvedContracts(f.contracts) };   // a contract that extends another offers the other's values, intents and children too
  return COMPOSITION_RULES.map(([name, fn]) => {
    try { fn(f); return { name, ok: true }; }
    catch (e) { return e instanceof Skip ? { name, ok: true, skipped: true, error: e.message } : { name, ok: false, error: e.message }; }
  });
}
