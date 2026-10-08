// Design system build: Specs (from load.js) → per-platform outputs. Pure; the caller writes the files.
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
