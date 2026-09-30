/**
 * Sonora → downstream export generator.
 *
 * Run it from a run_script call:
 *   const src = await readFile('export/generate.js');
 *   await new Function(src + '; return generateExport;')()({ readFile, saveFile, ls, log });
 *
 * Reads tokens/ and every component .d.ts, writes:
 *   export/web/sonora-tokens.css   static token families (:root)
 *   export/web/sonora-theme.css    theme-dependent families, one block per theme
 *   export/android/SonoraTokens.kt Compose colors / dimens / type / motion
 *   export/component-api.md        prop tables, generated from the .d.ts files
 *
 * Everything here is derived. Never hand-edit the outputs — change tokens/ or a .d.ts and
 * regenerate (see CLAUDE.md).
 */

async function generateExport(env) {
const readFile = env.readFile, saveFile = env.saveFile, ls = env.ls, log = env.log;

const TOKEN_FILES = ['colors', 'typography', 'spacing', 'layout', 'radius', 'shadows', 'motion', 'states', 'fonts'];

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const parseScope = (css, re) => {
  const m = css.match(re);
  if (!m) return {};
  const out = {};
  stripComments(m[1]).split(';').forEach((line) => {
    const t = line.trim();
    if (!t.startsWith('--')) return;
    const i = t.indexOf(':');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  });
  return out;
};

const srcs = {};
// Read in parallel: one round trip per file, serially, outgrew the script time limit as the
// component count grew.
await Promise.all(TOKEN_FILES.map(async (f) => {
  try { srcs[f] = await readFile('tokens/' + f + '.css'); } catch (e) { /* optional file */ }
}));
const root = {};
const order = [];
for (const f of TOKEN_FILES) {
  if (!srcs[f]) continue;
  const scope = parseScope(srcs[f], /:root\s*\{([\s\S]*?)\n\}/);
  for (const k of Object.keys(scope)) { if (!(k in root)) order.push(k); root[k] = scope[k]; }
}
const themeScope = (name) => Object.assign({}, root, parseScope(srcs.colors, new RegExp('\\[data-theme="' + name + '"\\]\\s*\\{([\\s\\S]*?)\\n\\}')));
const light = themeScope('light');
const dark = themeScope('dark');
const themedNames = Object.keys(parseScope(srcs.colors, /\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/));

const resolve = (v, scope, depth) => {
  const d = depth || 0;
  if (d > 8 || !v) return v;
  const m = String(v).match(/^var\((--[a-z0-9-]+)\)$/i);
  return m && scope[m[1]] ? resolve(scope[m[1]], scope, d + 1) : v;
};
const argb = (v) => {
  let m = String(v).match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let d = m[1];
    if (d.length === 3) d = d.split('').map((c) => c + c).join('');
    if (d.length === 6) return '0xFF' + d.toUpperCase();
    if (d.length === 8) return '0x' + d.slice(6).toUpperCase() + d.slice(0, 6).toUpperCase();
  }
  m = String(v).match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m) return '0xFF' + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0').toUpperCase()).join('');
  m = String(v).match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\s*\)$/i);
  if (m) {
    const a = Math.round(parseFloat(m[4]) * 2.55).toString(16).padStart(2, '0').toUpperCase();
    return '0x' + a + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0').toUpperCase()).join('');
  }
  return null;
};
const px = (v) => { const m = String(v).match(/^(-?[\d.]+)px$/); return m ? m[1] : null; };
const rem = (v) => { const m = String(v).match(/^(-?[\d.]+)rem$/); return m ? String(parseFloat(m[1]) * 16) : null; };
const ms = (v) => { const m = String(v).match(/^(\d+)ms$/); return m ? m[1] : null; };
const camel = (n) => n.replace(/^--/, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (n) => { const c = camel(n); return c.charAt(0).toUpperCase() + c.slice(1); };

const isColor = (k, scope) => !!argb(resolve(scope[k], scope, 0));
const colorNames = order.filter((k) => isColor(k, root));
const themedColors = themedNames.filter((k) => isColor(k, light));
const staticColors = colorNames.filter((k) => themedColors.indexOf(k) < 0);
const dimenNames = order.filter((k) => !isColor(k, root) && px(resolve(root[k], root, 0)));
const typeNames = order.filter((k) => rem(resolve(root[k], root, 0)));
const motionNames = order.filter((k) => ms(root[k]));
const other = order.filter((k) => [].concat(colorNames, dimenNames, typeNames, motionNames).indexOf(k) < 0);
// Interaction states: the state layer's opacities and the focus ring's measures, one Compose object.
const stateNames = Object.keys(parseScope(srcs.states || '', /:root\s*\{([\s\S]*?)\n\}/));
const notState = (k) => stateNames.indexOf(k) < 0;
const stateValue = (k) => {
  const v = resolve(root[k], root, 0);
  return px(v) !== null ? px(v) + '.dp' : parseFloat(v) + 'f';
};

const HEAD = (what) => '/**\n * GENERATED — ' + what + '\n * Source: the Sonora design system\'s tokens/*.css. Do not hand-edit; regenerate with\n * export/generate.js when tokens change.\n */\n';

/* ---- web ---- */
const decl = (k, scope) => '  ' + k + ': ' + scope[k] + ';';
await saveFile('export/web/sonora-tokens.css', HEAD('static token families (identical in both themes)') + '\n:root {\n'
  + staticColors.map((k) => decl(k, root)).join('\n') + '\n\n'
  + [].concat(dimenNames, typeNames, motionNames, other).map((k) => decl(k, root)).join('\n')
  + '\n}\n');
await saveFile('export/web/sonora-theme.css', HEAD('theme-dependent families — scope these selectors to your theme root') + '\n'
  + '[data-theme="dark"] {\n' + themedColors.map((k) => decl(k, dark)).join('\n') + '\n}\n\n'
  + '[data-theme="light"] {\n' + themedColors.map((k) => decl(k, light)).join('\n') + '\n}\n');

/* ---- android ---- */
const kt = '// GENERATED — Sonora tokens as Compose values.\n'
  + '// Source: the Sonora design system\'s tokens/*.css. Do not hand-edit; regenerate with\n'
  + '// export/generate.js when tokens change.\n'
  + 'package com.sonora.design\n\n'
  + 'import androidx.compose.animation.core.CubicBezierEasing\n'
  + 'import androidx.compose.ui.graphics.Color\n'
  + 'import androidx.compose.ui.unit.dp\n'
  + 'import androidx.compose.ui.unit.sp\n\n'
  + '/** Colors that carry one value regardless of theme. */\n'
  + 'object SonoraPalette {\n'
  + staticColors.map((k) => '    val ' + pascal(k) + ' = Color(' + argb(resolve(root[k], root, 0)) + ')').join('\n')
  + '\n}\n\n'
  + '/** Theme-dependent colors: build one and pass it down; never read the other theme\'s. */\n'
  + 'data class SonoraColors(\n'
  + themedColors.map((k) => '    val ' + camel(k) + ': Color').join(',\n')
  + '\n)\n\n'
  + 'val SonoraDarkColors = SonoraColors(\n'
  + themedColors.map((k) => '    ' + camel(k) + ' = Color(' + argb(resolve(dark[k], dark, 0)) + ')').join(',\n')
  + '\n)\n\n'
  + 'val SonoraLightColors = SonoraColors(\n'
  + themedColors.map((k) => '    ' + camel(k) + ' = Color(' + argb(resolve(light[k], light, 0)) + ')').join(',\n')
  + '\n)\n\n'
  + '/** Spacing, icon sizes, radii, and frame measurements. */\n'
  + 'object SonoraDimens {\n'
  + dimenNames.filter(notState).map((k) => '    val ' + camel(k) + ' = ' + px(resolve(root[k], root, 0)) + '.dp').join('\n')
  + '\n}\n\n'
  + '/** Type scale (rem → sp at 16). */\n'
  + 'object SonoraType {\n'
  + typeNames.map((k) => '    val ' + camel(k) + ' = ' + rem(resolve(root[k], root, 0)) + '.sp').join('\n')
  + '\n}\n\n'
  + '/** Motion: one curve, durations named by role (milliseconds). */\n'
  + 'object SonoraMotion {\n'
  + '    val EaseStandard = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)\n'
  + motionNames.map((k) => '    const val ' + camel(k) + ' = ' + ms(root[k])).join('\n')
  + '\n}\n\n'
  + '/** Interaction states: state-layer opacities over the content colour, and the focus ring. */\n'
  + 'object SonoraState {\n'
  + stateNames.map((k) => '    val ' + camel(k.replace(/^--state-layer-/, '--')) + ' = ' + stateValue(k)).join('\n')
  + '\n}\n\n'
  + '/*\n * Not exported — no single Compose equivalent; read these from the CSS:\n'
  + other.filter(notState).map((k) => ' *   ' + k + ': ' + root[k]).join('\n')
  + '\n */\n';
await saveFile('export/android/SonoraTokens.kt', kt);

/* ---- component API ---- */
const DIRS = ['basic', 'components', 'layouts'];
const dts = [];
const listings = await Promise.all(DIRS.map(async (dir) => {
  try { return [dir, await ls('components/' + dir)]; } catch (e) { return [dir, []]; }
}));
for (const entry of listings) {
  const dir = entry[0];
  for (const n of entry[1]) if (/\.d\.ts$/.test(n)) dts.push(['components/' + dir + '/' + n, dir, n.replace(/\.d\.ts$/, '')]);
}
dts.sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]));
const sources = await Promise.all(dts.map((e) => readFile(e[0])));
let md = '<!-- GENERATED from components/**/*.d.ts by export/generate.js. Do not hand-edit. -->\n\n'
  + '# Sonora component API\n\nEvery prop each component accepts, with its type and the note from its declaration.\n';
let group = '';
for (let di = 0; di < dts.length; di++) {
  const entry = dts[di];
  const dir = entry[1], name = entry[2];
  const src = sources[di];
  if (dir !== group) { group = dir; md += '\n## ' + dir + '\n'; }
  const leadMatch = src.match(/\/\*\*([\s\S]*?)\*\//);
  const lead = (leadMatch ? leadMatch[1] : '').split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).join(' ');
  md += '\n### ' + name + '\n\n' + lead + '\n\n| prop | type | notes |\n| --- | --- | --- |\n';
  const bodyMatch = src.match(new RegExp('interface\\s+' + name + 'Props\\s*\\{([\\s\\S]*?)\\n\\}'));
  const body = bodyMatch ? bodyMatch[1] : '';
  let note = '';
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    const doc = l.match(/^\/\*\*(.*?)\*\/$/);
    if (doc) { note = doc[1].trim(); continue; }
    if (l.indexOf('/**') === 0) { note = l.replace('/**', '').trim(); continue; }
    if (l.charAt(0) === '*') { note += ' ' + l.replace(/^\*\/?/, '').replace(/\*\/$/, '').trim(); continue; }
    const p = l.match(/^([A-Za-z_$][\w$]*)(\??):\s*(.+?);?$/);
    if (p) { md += '| `' + p[1] + '`' + (p[2] ? '' : ' *(required)*') + ' | `' + p[3].replace(/\|/g, '\\|') + '` | ' + note.replace(/\|/g, '\\|') + ' |\n'; note = ''; }
  }
}
await saveFile('export/component-api.md', md);

log('tokens: ' + colorNames.length + ' colors (' + themedColors.length + ' themed), ' + dimenNames.length + ' dimens, '
  + typeNames.length + ' type, ' + motionNames.length + ' motion, ' + other.length + ' unmapped');
log('components documented: ' + dts.length);
}
