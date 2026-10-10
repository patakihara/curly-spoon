// Design system build: Specs (from load.js) → per-platform outputs. Pure; design/write-generated.mjs writes the files.
//   buildCss(specs)            → generated/web/tokens.css
//   buildKotlin(specs)         → generated/android/DesignTokens.kt
//   buildDts(id, raw, resolved, note) → design/components/<id>/<id>.d.ts   (own props from <id>.json; extends → interface extends)

const kebab = s => s.replace(/\./g, '-');
const pascal = s => s.split(/[.\-_]/).map(p => p[0].toUpperCase() + p.slice(1)).join('');
const unit = (name, v) => typeof v !== 'number' ? v : /^radius\.|\.radius$/.test(name) ? v + 'px' : /duration/.test(name) ? v + 'ms' : String(v);

function componentTokens(specs) {
  // flatten component visuals: <component>.<visual>.<state> → value (token refs kept as refs)
  const out = [];
  for (const [id, C] of Object.entries(specs.components)) {
    for (const [vis, states] of Object.entries(C.visuals || {})) {
      for (const [st, v] of Object.entries(states)) {
        if (v === null || v === 'content') continue;
        out.push({ id, vis, st, ref: v && typeof v === 'object' && 'token' in v ? v.token : null, value: v && typeof v === 'object' && 'token' in v ? specs.tokens[v.token] : v });
      }
    }
  }
  return out;
}

export function buildCss(specs) {
  const lines = ['/* Generated from design/ by design/build.js — do not edit. */', ':root {'];
  for (const [k, v] of Object.entries(specs.tokens)) lines.push(`  --${kebab(k)}: ${unit(k, v)};`);
  lines.push('');
  for (const t of componentTokens(specs)) {
    const name = `--${t.id}-${t.vis}${t.st === 'default' ? '' : '-' + t.st}`;
    lines.push(`  ${name}: ${t.ref ? `var(--${kebab(t.ref)})` : unit(t.vis === 'radius' ? 'radius.' : t.vis, t.value)};`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

const kt = (name, v) => {
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return `Color(0xFF${v.slice(1).toUpperCase()})`;
  if (typeof v === 'string' && v.startsWith('cubic-bezier(')) return `CubicBezierEasing(${v.slice(13, -1).split(',').map(x => x.trim() + 'f').join(', ')})`;
  if (typeof v === 'string' && v.startsWith('rgba(')) { const [r, g, b, a] = v.slice(5, -1).split(',').map(Number); return `Color(${r}, ${g}, ${b}, ${Math.round(a * 255)})`; }
  if (typeof v === 'number') return /^radius\.|radius$/.test(name) ? `${v}.dp` : /duration/.test(name) ? `${v}` : `${v}f`;
  return JSON.stringify(v);
};
export function buildKotlin(specs) {
  const L = ['// Generated from design/ by design/build.js — do not edit.', 'package app.design', '',
    'import androidx.compose.animation.core.CubicBezierEasing', 'import androidx.compose.ui.graphics.Color', 'import androidx.compose.ui.unit.dp', '',
    'object DesignTokens {'];
  for (const [k, v] of Object.entries(specs.tokens)) L.push(`    val ${pascal(k)} = ${kt(k, v)}`);
  L.push('}');
  const byComp = {};
  for (const t of componentTokens(specs)) (byComp[t.id] = byComp[t.id] || []).push(t);
  for (const [id, ts] of Object.entries(byComp)) {
    L.push('', `object ${pascal(id)}Tokens {`);
    for (const t of ts) L.push(`    val ${pascal(t.vis)}${t.st === 'default' ? '' : pascal(t.st)} = ${t.ref ? 'DesignTokens.' + pascal(t.ref) : kt(t.vis, t.value)}`);
    L.push('}');
  }
  return L.join('\n') + '\n';
}

const TS = { string: 'string', number: 'number', boolean: 'boolean', token: 'string', slot: 'Slot', 'string[]': 'string[]', value: 'ParamValue', options: '{ value: string; label: string }[]' };
export function buildDts(id, raw, C, note = '') {
  const own = raw.props || {}, parent = raw.extends;
  const L = [`// Generated from ${id}.json by design/build.js — edit the .json, not this file.`];
  if (parent) L.push(`import type { ${pascal(parent)}Props } from '../${parent}/${parent}';`);
  if (Object.values(own).includes('slot')) L.push(`export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)`);
  if (Object.values(own).includes('value')) L.push(`export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1`);
  const tags = [parent ? (raw.variant ? 'Variant of ' + parent + ': drawn by its implementation.' : 'Extends ' + parent + '.') : ''].filter(Boolean);
  L.push('', `/** ${note || id}${tags.map(t => '\n *  ' + t).join('')} */`, `export interface ${pascal(id)}Props${parent ? ' extends ' + pascal(parent) + 'Props' : ''} {`);
  for (const [k, t] of Object.entries(own)) L.push(`  ${k}: ${TS[t] || 'unknown'};`);
  L.push('}');
  if (C.states) L.push(`export type ${pascal(id)}State = ${C.states.map(s => `'${s}'`).join(' | ')};`);
  return L.join('\n') + '\n';
}

// ── Tokens at every level (NOTES decision 54) → generated/tokens.json. Every visual of every component (free or child) and
// every hire is a named token: '<owner>.<visual>', ':<state>' for a state's value, '[<option>]' per option of a setting it
// depends on. Each aliases what it inherits (its parent's, its component's) unless set there; marks set · new · inherited.
// A hire's prop tokens (clauses naming a design token) are '<hire>.<prop>'. Grouped by inheritance: system tokens by group;
// each component with its children (extends) nested and its hires listed under it; inside each, tokens by kind.
//   buildTokenTree(rawTokens, raw, specs, hires) → the tree. raw: design files (raw.components: each <name>.json as written);
//   specs: resolved design (specs.tokens flat); hires: [{ name, ...HireDef }].
export function buildTokenTree(rawTokens, raw, specs, hires) {
  const T = specs.tokens, comps = raw.components, R = specs.components;
  const kindOf = (name, alias, value) => {
    const root = (alias || '').split('.')[0], w = new Set(name.replace(/\[.*$/, '').split(/(?=[A-Z])/).map(x => x.toLowerCase()));   // the visual's words: detailShrink → detail, shrink
    const has = (...xs) => xs.some(x => w.has(x));
    if (root === 'color' || /^(#|rgb|hsl)/.test(String(value)) || has('fill', 'ink', 'color', 'colour', 'divider', 'scrim', 'border')) return 'colour';
    if (root === 'radius' || has('radius', 'corner')) return 'radius';
    if (root === 'font' || has('font', 'weight', 'line', 'letter', 'family')) return 'type';
    if (root === 'motion' || has('ms', 'duration', 'easing', 'ease')) return 'motion';
    if (root === 'icon' || has('icon', 'glyph', 'handle')) return 'icon';
    if (root === 'size' || root === 'grid' || typeof value === 'number') return 'size';
    return 'other';
  };
  const final = (v, k = 0) => k > 12 || v == null || typeof v !== 'object' ? v : 'token' in v ? final(T[v.token], k + 1) : null;
  const tokenMap = {};   // name → final value, so aliases between owners resolve
  // one visual value → token rows ([option] rows for a setting's cases)
  const rows = (owner, visual, state, v, mark, picks) => {
    const base = owner + '.' + visual + (state === 'default' ? '' : ':' + state);
    if (v && typeof v === 'object' && 'variant' in v && 'cases' in v) {
      if (picks && picks[v.variant] !== undefined) return rows(owner, visual, state, v.cases[picks[v.variant]], mark, picks).map(r => ({ ...r, picked: v.variant + ' ' + picks[v.variant] }));
      return Object.entries(v.cases).flatMap(([opt, cv]) => rows(owner, visual + '[' + opt + ']', state, cv, mark, picks));
    }
    const alias = v && typeof v === 'object' && 'token' in v ? v.token : v && typeof v === 'object' && 'role' in v ? 'role:' + v.role : null;
    const value = alias && !alias.startsWith('role:') ? final(v) : v && typeof v === 'object' ? null : v;
    return [{ name: base, visual, state, ...(alias ? { alias } : {}), value: value === undefined ? null : value, ...(v && typeof v === 'object' && 'if' in v ? { condition: v } : {}), mark }];
  };
  const group = list => {
    const by = {};
    for (const r of list) (by[r.kind] = by[r.kind] || []).push(r);
    return ['colour', 'size', 'radius', 'type', 'motion', 'icon', 'other'].filter(k => by[k]).map(k => ({ group: k, tokens: by[k].map(({ kind, ...r }) => r) }));
  };
  const withKind = r => ({ ...r, kind: kindOf(r.visual, r.alias, r.value) });
  // the token an inherited row aliases: the same name on the owner it inherits from; a row whose setting this owner picks
  // aliases that option's token there (queueRow.fill → listRow.fill; a hire picking size md: x.size → iconButton.size[md])
  const from = (src, owner, r, vis, st) => r.picked && !(R[src] && R[src].picks && R[src].picks[r.picked.split(' ')[0]] !== undefined)
    ? src + '.' + vis + '[' + r.picked.split(' ')[1] + ']' + (st === 'default' ? '' : ':' + st) : src + r.name.slice(owner.length);
  // a component's tokens: its own visuals set / new, the rest inherited from its parent's tokens of the same name
  const ownerTokens = (id) => {
    const C = comps[id] || {}, P = C.extends ? R[C.extends] : null, own = C.visuals || {}, all = (R[id] || {}).visuals || {}, picks = (R[id] || {}).picks;
    const out = [];
    for (const [vis, row] of Object.entries(all)) for (const [st, val] of Object.entries(row)) {
      if (own[vis] && own[vis][st] !== undefined) out.push(...rows(id, vis, st, own[vis][st], P && P.visuals && P.visuals[vis] ? 'set' : P ? 'new' : 'set', picks));
      else out.push(...rows(id, vis, st, val, 'inherited', picks).map(r => ({ ...r, alias: from(C.extends, id, r, vis, st) })));
    }
    return out;
  };
  const hireTokens = h => {
    const C = R[h.hires] || {}, own = h.visuals || {}, out = [];
    for (const [vis, row] of Object.entries({ ...(C.visuals || {}), ...own })) for (const st of new Set([...Object.keys((C.visuals || {})[vis] || {}), ...Object.keys(own[vis] || {})])) {
      if (own[vis] && own[vis][st] !== undefined) out.push(...rows(h.name, vis, st, own[vis][st], 'set', h.picks));
      else out.push(...rows(h.name, vis, st, C.visuals[vis][st], 'inherited', h.picks).map(r => ({ ...r, alias: from(h.hires, h.name, r, vis, st) })));
    }
    for (const cl of h.clauses) {
      if ('token' in cl) out.push({ name: h.name + '.' + cl.prop, visual: cl.prop, state: 'default', alias: cl.token, value: T[cl.token] ?? null, mark: 'set', prop: true });
      for (const k of cl.cases || []) out.push({ name: h.name + '.' + cl.prop + '[' + k.equals + ']', visual: cl.prop, state: 'default', alias: k.token, value: T[k.token] ?? null, mark: 'set', prop: true });
    }
    return out;
  };
  // final values through aliases between owners (a parent's token, a component's)
  const resolveAll = owners => {
    for (const o of owners) for (const r of o.list) tokenMap[r.name] = r;
    const val = (r, k = 0) => { if (!r || k > 16) return null; if (r.alias && tokenMap[r.alias]) return val(tokenMap[r.alias], k + 1); if (r.alias && r.alias in T) return T[r.alias]; return r.value; };
    for (const o of owners) for (const r of o.list) r.value = val(r);
  };
  const ids = Object.keys(comps), kids = id => ids.filter(x => comps[x].extends === id);
  const hiresOf = id => hires.filter(h => h.hires === id);
  const owners = [];
  const node = id => {
    const n = { name: id, is: comps[id].variant ? 'child' : 'free', ...(comps[id].extends ? { extends: comps[id].extends } : {}), source: 'design/components/' + id + '/' + id + '.json', list: ownerTokens(id) };
    owners.push(n);
    n.children = kids(id).map(node);
    n.hires = hiresOf(id).map(h => { const o = { name: h.name, is: 'hire', contract: h.contract, uses: h.hires, ...(h.picks ? { picks: h.picks } : {}), source: 'app/hires/' + h.name + '/' + h.name + '.json', list: hireTokens(h) }; owners.push(o); return o; });
    return n;
  };
  const tree = ids.filter(id => !comps[id].extends).map(node);
  resolveAll(owners);
  const finish = n => { const { list, children, hires: hs, ...rest } = n; return { ...rest, groups: group(list.map(withKind)), ...(children ? { children: children.map(finish) } : {}), ...(hs ? { hires: hs.map(finish) } : {}) }; };
  const system = Object.keys(rawTokens).filter(k => k[0] !== '$').map(g => ({ group: g, tokens: Object.entries(T).filter(([k]) => k.split('.')[0] === g).map(([name, value]) => {
    const rv = name.split('.').reduce((o, k) => o && o[k], rawTokens), a = rv && typeof rv.$value === 'string' && /^\{.+\}$/.test(rv.$value) ? rv.$value.slice(1, -1) : null;
    return { name, ...(a ? { alias: a } : {}), value: a ? T[a] ?? value : value, ...(rv && rv.$description ? { usage: rv.$description } : {}) };
  }) }));
  return { system, components: tree.map(finish) };
}
