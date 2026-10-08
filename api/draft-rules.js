// Backdrop Nav — COMPOSITION RULES (draft for 18.0.0; joins api/invariants.js when the draft replaces api.d.ts)
// Check composition (app/draft/composition.json) against the contracts (api/contracts.js), the draft config
// (app/draft/app.json) and design's free components and tokens.
//
// runDraftRules(f) → [{ name, ok, skipped?, error? }]
// f = { contracts, unions, config, composition, components: { <id>: raw design json }, tokens: design tokens.json }

import { placementFor, hireOf as findHire, freeComponent } from '../core/compose.js';

const assert = (c, msg) => { if (!c) throw new Error(msg); };
class Skip extends Error {}
const skip = msg => { throw new Skip(msg); };

const tokenExists = (tokens, name) => { let n = tokens; for (const k of name.split('.')) { if (!n || typeof n !== 'object' || !(k in n)) return false; n = n[k]; } return !!n && typeof n === 'object' && '$value' in n; };
const hireOf = (f, name) => findHire(f.composition, name);

// ── the drawn objects of the draft config: one 'place' per contract instance, with what placement may match on
export function placesOf(config) {
  const out = [];
  const paramSpec = (page, bind) => {
    if (bind && typeof bind === 'object') return { draft: true };
    const s = (page.params || {})[bind] || {};
    return { name: bind, type: s.type, axis: !!s.axis, draft: false };
  };
  // within: the ancestor contracts, nearest first
  const item = (page, within, it) => out.push({ contract: it.kind, page: page.id, within, kind: it.kind, name: it.name });
  const header = (page, within, h) => { const w = ['header', ...within]; out.push({ contract: 'header', page: page.id, within }); h.items.forEach(i => item(page, w, i)); if (h.detail) out.push({ contract: 'detail', page: page.id, within: w }); };
  const content = (page, within, c) => {
    const w = ['content', ...within];
    c.presentations.forEach(pr => { out.push({ contract: 'content', page: page.id, within, presentation: pr.key }); out.push({ contract: 'item', page: page.id, within: w, presentation: pr.key }); });
    ['empty', 'error', 'offlineStale'].forEach(state => out.push({ contract: 'contentState', page: page.id, within: w, state }));
  };
  const input = (page, within, bind) => out.push({ contract: 'input', page: page.id, within, param: paramSpec(page, bind) });
  const pageOf = (p, within = []) => {
    const kind = p.kind === 'backdrop' ? 'backdropPage' : 'appBarPage';
    out.push({ contract: kind, page: p.id, within });
    const w = [kind, ...within];
    if (p.kind === 'backdrop') {
      const b = ['backLayer', ...w], fr = ['frontLayer', ...w];
      out.push({ contract: 'backLayer', page: p.id, within: w }, { contract: 'frontLayer', page: p.id, within: w }, { contract: 'frontHeader', page: p.id, within: fr });
      header(p, b, p.back.header);
      (p.back.actions || []).forEach(i => item(p, b, i));
      if (p.back.basicAction) input(p, b, p.back.basicAction.bind);
      (p.back.panel || []).forEach(r => {
        if (r.kind === 'param') { out.push({ contract: 'paramRow', page: p.id, within: b }); input(p, ['paramRow', ...b], r.bind); }
        else out.push({ contract: 'suggestions', page: p.id, within: b }, { contract: 'suggestion', page: p.id, within: ['suggestions', ...b] });
      });
      p.front.header.items.forEach(i => item(p, ['frontHeader', ...fr], i));
      content(p, fr, p.front.content);
    } else {
      header(p, w, p.header);
      (p.body || []).forEach(i => item(p, w, i));
      if (p.content) content(p, w, p.content);
      if (p.sheet) { const s = ['pageSheet', ...w]; out.push({ contract: 'pageSheet', page: p.id, within: w }); if (p.sheet.control) input(p, s, p.sheet.control.bind); content(p, s, p.sheet.content); }
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
  ['dialog', 'menu', 'snackbar'].forEach(overlay => out.push({ contract: 'overlay', page: null, overlay }));
  if (config.launch) out.push({ contract: 'splash', page: null });
  return out;
}

export const DRAFT_RULES = [
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
  ['every token a clause uses is minted by its hire, and every hire token aliases a design token', f => {
    const errs = [];
    f.composition.hires.forEach(h => {
      const mine = new Set((h.tokens || []).map(t => t.name));
      h.clauses.forEach(cl => {
        if ('token' in cl && !mine.has(cl.token)) errs.push(h.name + ': token ' + cl.token + ' is not minted by the hire');
        (cl.cases || []).forEach(k => { if (!mine.has(k.token)) errs.push(h.name + ': token ' + k.token + ' is not minted by the hire'); });
      });
      (h.tokens || []).forEach(t => {
        if (!t.name.startsWith(h.name + '.')) errs.push(h.name + ': token ' + t.name + ' is not named after the hire');
        if (!tokenExists(f.tokens, t.alias)) errs.push(h.name + ': ' + t.alias + ' is not a design token');
      });
    });
    assert(!errs.length, errs.length + ': ' + errs.join(' · '));
  }],
  ['variant picks name a declared axis and option of the free component', f => {
    f.composition.hires.forEach(h => {
      const c = freeComponent(f.components, h.hires); if (!c) return;
      (h.variants || []).forEach(v => { const ax = c.variants[v.axis]; assert(ax && ax.options.includes(v.option), h.name + ': ' + h.hires + ' has no variant ' + v.axis + ' = ' + v.option); });
    });
  }],
  ['every drawn config object has a placement on every layout', f => {
    const errs = new Set();
    placesOf(f.config).forEach(at => ['compact', 'wide'].forEach(layout => {
      if (placementFor(f.composition, { ...at, env: { layout } }) === undefined) errs.add(at.contract + (at.name ? ' ' + at.name : '') + (at.presentation ? ' ' + at.presentation : '') + (at.state ? ' ' + at.state : '') + (at.within ? ' in ' + at.within : '') + (at.page ? ' (' + at.page + ')' : '') + ' on ' + layout);
    }));
    assert(!errs.size, errs.size + ': ' + [...errs].slice(0, 40).join(' · '));
  }],
];

export function runDraftRules(f) {
  return DRAFT_RULES.map(([name, fn]) => {
    try { fn(f); return { name, ok: true }; }
    catch (e) { return e instanceof Skip ? { name, ok: true, skipped: true, error: e.message } : { name, ok: false, error: e.message }; }
  });
}
