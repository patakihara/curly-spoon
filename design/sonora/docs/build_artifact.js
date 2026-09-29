/**
 * Build the Sonora Design System ARTIFACT (claude.ai "Design System" type) from this repo.
 *
 * This repo is the source of truth; the artifact is a generated view of it, the same way
 * export/ is for curly-spoon. Never hand-edit the artifact: change tokens/, components/ or
 * docs/, rerun this, republish. Output: <out>/project/** ready to publish with the Artifact tool
 * (url + root=<out>, every file under project/), and <out>/canvas/tokens.css for canvas installs.
 * <out> defaults to the Auralis repo's gitignored build/sonora; `pnpm sonora:build` runs both
 * scripts and writes <out>/stamp.json for record-publish.mjs.
 *
 *   node docs/build_bundle.js && node docs/build_artifact.js [--out <dir>]
 *
 * What maps to what:
 *   tokens/*.css            -> project/tokens.json (the page's editable, themed tokens)
 *                              + project/components/bundle.css for anything tokens.json cannot
 *                              hold (var()-built non-colours, gradients, motion) and the fonts
 *   _ds_bundle.js           -> project/components/bundle.js (window.SonoraDesignSystem_6c1435)
 *   components/<g>/<C>.d.ts -> project/components/<C>/<C>.d.ts + concatenated index.d.ts
 *   <C>.prompt.md / .d.ts   -> project/components/<C>/README.md
 *   docs/examples/<C>.snippet.jsx -> project/components/<C>/preview.html (per-component preview)
 *   components/<g>/*.card.html    -> project/components/<Name>Card/preview.html (showcase page)
 *   Previews and showcase pages alike are grouped by level: Basic, Components, Layouts.
 *   readme.md               -> project/README.md
 * Not carried: reference/ + assets/reference (Spotify screenshots: research, not brand), guidelines/ cards
 * (the artifact page renders tokens itself).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const outArg = process.argv.indexOf('--out');
const BUILD = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, '..', '..', 'build', 'sonora');
const OUT = path.join(BUILD, 'project');
const NS = 'SonoraDesignSystem_6c1435';
// Pinned in the Auralis root package.json's devDependencies; `pnpm install` provides it.
const Babel = require('@babel/standalone');

const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const wr = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
fs.rmSync(BUILD, { recursive: true, force: true });

// ---------------------------------------------------------------- tokens
// Every `--name: value; /* comment */` in each selector block of every tokens/*.css file.
const decls = []; // {file, sel, name, value, kind, note}
for (const f of fs.readdirSync(path.join(ROOT, 'tokens')).filter((f) => f.endsWith('.css')).sort()) {
  const css = rd('tokens/' + f);
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n').pop().trim();
    const body = m[2];
    const lineRe = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+);([^\n]*)/g;
    let d;
    while ((d = lineRe.exec(body))) {
      const tail = d[3] || '';
      const kind = (tail.match(/@kind\s+(\w+)/) || [])[1] || null;
      const note = tail.replace(/\/\*\s*@kind\s+\w+\s*\*\//, '').replace(/\/\*|\*\//g, '').trim();
      decls.push({ file: f, sel, name: d[1], value: d[2].trim(), kind, note });
    }
  }
}
const themeOf = (sel) => (/data-theme="light"/.test(sel) ? 'light' : /data-theme="dark"/.test(sel) ? 'dark' : 'base');
// base (:root) holds the dark defaults; dark block repeats them. First theme = dark.
const byName = {};
for (const d of decls) { (byName[d.name] = byName[d.name] || {})[themeOf(d.sel)] = d; }

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\))$/;
const isColorFile = (d) => d.file === 'colors.css';
function resolve(name, theme, depth = 0) { // literal value of a token in a theme, var() expanded
  if (depth > 20) return null;
  const e = byName[name]; if (!e) return null;
  const d = e[theme] || e.base || e.dark || e.light; if (!d) return null;
  return d.value.replace(/var\(--([A-Za-z0-9_-]+)(?:\s*,\s*([^)]+))?\)/g, (_, n, fb) => resolve(n, theme, depth + 1) ?? (fb || ''));
}
// hex/rgb parser + oklch mixing for color-mix(in oklch, A p%, B)
function parseColor(s) {
  s = s.trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) { let h = m[1]; if (h.length <= 4) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1]; }
  m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[\/,]\s*([\d.]+%?))?\s*\)$/i);
  if (m) { let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [+m[1], +m[2], +m[3], a]; }
  if (/^black$/i.test(s)) return [0, 0, 0, 1];
  if (/^white$/i.test(s)) return [255, 255, 255, 1];
  return null;
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const unlin = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255); };
function toOklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
function mix(value) { // color-mix(in oklch|oklab|srgb, A p%, B [q%]) -> hex (hue-less oklab interpolation)
  const m = value.match(/^color-mix\(\s*in\s+\w+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*\)$/);
  if (!m) return null;
  const A = parseColor(m[1]), B = parseColor(m[3]); if (!A || !B) return null;
  const p = parseFloat(m[2]) / 100;
  const la = toOklab(A), lb = toOklab(B);
  const [r, g, b] = fromOklab([0, 1, 2].map((i) => la[i] * p + lb[i] * (1 - p)));
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const colorTokens = [], other = { spacing: [], radius: [], shadow: [], layout: [], timing: [] }, residue = [], report = { mixed: [], residue: [] };
const typeVars = {};
for (const [name, e] of Object.entries(byName)) {
  const any = e.base || e.dark || e.light;
  const usage = (any.note || '').slice(0, 1000) || undefined;
  if (isColorFile(any) && any.kind !== 'other') {
    const val = {};
    for (const th of ['dark', 'light']) {
      const d = e[th] || e.base; if (!d) continue;
      let v = d.value;
      const alias = v.match(/^var\(--([A-Za-z0-9_-]+)\)$/);
      if (alias && byName[alias[1]] && isColorFile(byName[alias[1]].base || byName[alias[1]].dark || byName[alias[1]].light)) { val[th] = '{' + alias[1] + '}'; continue; }
      v = resolve(name, th === 'dark' && !e.dark ? 'base' : th);
      if (/^color-mix/.test(v)) { const x = mix(v); if (x) { report.mixed.push(name + ' [' + th + ']'); v = x; } }
      // rgb()/hsl() space-and-slash syntax -> the comma form the artifact's grammar documents
      if (v && /^rgba?\([^,]*\//.test(v.trim())) { const c = parseColor(v); if (c) { val[th] = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${+c[3].toFixed(3)})`; continue; } }
      if (v && COLOR_RE.test(v.trim())) val[th] = v.trim().toLowerCase();
      else if (v) { const c = parseColor(v); if (c) val[th] = c[3] < 1 ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${+c[3].toFixed(3)})` : '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join(''); }
    }
    if (!Object.keys(val).length) { residue.push(name); report.residue.push(name + ' (colour: ' + any.value + ')'); continue; }
    const value = val.dark && val.light && val.dark === val.light ? val.dark : val.dark && !val.light ? val.dark : val;
    colorTokens.push({ name, value, ...(usage && { usage }) });
    continue;
  }
  if (any.file === 'typography.css' || any.file === 'fonts.css') { typeVars[name] = resolve(name, 'base'); residue.push(name); continue; }
  const v = resolve(name, 'base');
  const fam = any.file === 'spacing.css' ? 'spacing' : any.file === 'radius.css' ? 'radius' : any.file === 'shadows.css' ? 'shadow' : any.file === 'motion.css' ? 'timing' : 'layout';
  if (v && !/var\(|url\(/.test(v) && v.length <= 200 && /^[A-Za-z0-9 #%(),./+_-]+$/.test(v)) other[fam].push({ name, value: v, ...(usage && { usage }) });
  else { residue.push(name); report.residue.push(name + ' (' + fam + ': ' + any.value + ')'); }
}
// type: families from fonts.css, styles from the text/leading/heading scales
const fam = (n) => (typeVars[n] || '').replace(/;/g, '');
const tv = (n) => typeVars[n];
const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
const leadFor = { xs: 'xs', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl' };
const tokens = {
  name: 'Sonora', version: 1,
  meta: { source: 'repo', repo: 'SofiaThinkPad:~/src/sonora', builtBy: 'docs/build_artifact.js', built: new Date().toISOString() },
  color: { themes: [{ id: 'dark', name: 'Dark' }, { id: 'light', name: 'Light' }], tokens: colorTokens },
  type: {
    fonts: [],
    families: { body: fam('font-body'), display: fam('font-display'), heading: fam('font-heading') },
    groups: [
      { name: 'Headings', family: 'heading', styles: ['1', '2', '3', '4'].filter((i) => tv('h' + i + '-size')).map((i) => ({ name: 'h' + i, fontSize: tv('h' + i + '-size'), lineHeight: tv('h' + i + '-leading'), fontWeight: +(tv('heading-weight') || 900) })) },
      { name: 'Text', family: 'body', styles: sizes.filter((s) => tv('text-' + s)).map((s) => ({ name: 'text-' + s, fontSize: tv('text-' + s), ...(leadFor[s] && tv('leading-' + leadFor[s]) && { lineHeight: tv('leading-' + leadFor[s]) }), fontWeight: +(tv('weight-body') || 500) })) },
    ],
  },
};
for (const k of Object.keys(other)) if (other[k].length) tokens[k] = { tokens: other[k] };
// tokens.json can't carry these (type scale variables, gradients, var()-built values): ship the
// original declarations in bundle.css so components read them exactly as in the repo.
const residueSet = new Set(residue);
let residueCss = '';
const bySel = {};
for (const d of decls) if (residueSet.has(d.name)) (bySel[d.sel] = bySel[d.sel] || []).push(`--${d.name}:${d.value};`);
for (const [sel, lines] of Object.entries(bySel)) residueCss += `${sel}{\n${lines.join('\n')}\n}\n`;
const fontsCss = rd('tokens/fonts.css');
const imports = [...rd('styles.css').matchAll(/@import url\([^)]*\);/g), ...fontsCss.matchAll(/@import url\([^)]*\);/g)].map((m) => m[0]);
const extraRules = fontsCss.replace(/@import[^;]+;/g, '').replace(/:root\{[\s\S]*?\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
wr('tokens.json', JSON.stringify(tokens, null, 2));
// tokens.css for canvas installs, compiled from tokens.json by the artifact format's own rules
// (the Design System page generates the official one only when opened; this keeps installs mechanical).
{
  const val = (v) => (typeof v === 'string' && /^\{.+\}$/.test(v) ? `var(--${v.slice(1, -1)})` : v);
  const th = (t, id) => (typeof t.value === 'string' ? t.value : t.value[id] ?? t.value.dark);
  let css = '/* Generated by docs/build_artifact.js: tokens.json compiled per format.md, for canvas installs. */\n';
  css += `:root,[data-theme="dark"]{${colorTokens.map((t) => `--${t.name}:${val(th(t, 'dark'))};`).join('')}}\n`;
  css += `[data-theme="light"]{${colorTokens.map((t) => `--${t.name}:${val(th(t, 'light'))};`).join('')}}\n`;
  const flat = Object.values(other).flat().map((t) => `--${t.name}:${typeof t.value === 'string' ? t.value : t.value.dark};`).join('');
  const fonts = Object.entries(tokens.type.families).map(([k, f]) => `--font-${k}:${f};`).join('');
  css += `:root{${flat}${fonts}}\n`;
  const cf = path.join(BUILD, 'canvas', 'tokens.css');
  fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, css);
}
wr('components/bundle.css', `/* Generated by docs/build_artifact.js from tokens/*.css. Only what tokens.json cannot hold. */\n${imports.join('\n')}\n${residueCss}${extraRules}\n`);

// ---------------------------------------------------------------- components
const bundle = fs.readFileSync(path.join(ROOT, '_ds_bundle.js'), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\x3C!--');
const comps = [];
for (const g of fs.readdirSync(path.join(ROOT, 'components'))) {
  const d = path.join(ROOT, 'components', g); if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.jsx')) comps.push({ name: f.slice(0, -4), group: g });
}
comps.sort((a, b) => a.name.localeCompare(b.name));
wr('components/bundle.js', `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NS, components: comps.map((c) => ({ name: c.name })) })} */\n` + bundle);
const GROUP = { basic: 'Basic', components: 'Components', layouts: 'Layouts' };
const compile = (jsx, file) => Babel.transform(jsx, { presets: [['react', { runtime: 'classic' }]], filename: file }).code;
const noPicsum = (s) => s.replace(/https:\/\/picsum\.photos\/[^'"`\s)]*/g, '');
let indexDts = '';
const previews = [];
for (const c of comps) {
  const base = `components/${c.group}/${c.name}`;
  const dts = fs.existsSync(path.join(ROOT, base + '.d.ts')) ? rd(base + '.d.ts') : '';
  if (dts) { wr(`components/${c.name}/${c.name}.d.ts`, dts); indexDts += `// ---- ${c.name}\n${dts.replace(/^import[^\n]*\n/gm, '')}\n`; }
  let readme;
  if (fs.existsSync(path.join(ROOT, base + '.prompt.md'))) readme = rd(base + '.prompt.md');
  else {
    const doc = (dts.match(/^\/\*\*([\s\S]*?)\*\//) || [])[1];
    const text = doc ? doc.split('\n').map((l) => l.replace(/^\s*\*\s?/, '')).join('\n').trim() : `${c.name} component.`;
    readme = `# ${c.name}\n\n${text}\n\nProps: see \`${c.name}.d.ts\`. Reads Sonora tokens only; nothing hardcoded.\n`;
  }
  wr(`components/${c.name}/README.md`, readme);
  const snip = path.join(ROOT, 'docs/examples', c.name + '.snippet.jsx');
  if (fs.existsSync(snip)) {
    const used = [...new Set([...fs.readFileSync(snip, 'utf8').matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]))].filter((n) => comps.some((x) => x.name === n));
    const js = compile(`const { ${used.join(', ')} } = window.${NS};\nfunction Demo(){ return (<div style={{padding:16}}>${noPicsum(fs.readFileSync(snip, 'utf8'))}</div>); }\nfunction Themed(){ return (<div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>{['dark','light'].map(t => <div key={t} data-theme={t} style={{background:'var(--surface-bg)',color:'var(--surface-fg)'}}><Demo/></div>)}</div>); }\nReactDOM.createRoot(document.getElementById('root')).render(<Themed/>);`, c.name + '.preview.jsx');
    wr(`components/${c.name}/preview.html`, `<!-- @dsCard group="${GROUP[c.group] || c.group}" height=160 -->\n<style>html,body{margin:0;background:var(--surface-bg);font-family:var(--font-body)}</style>\n<div id="root"></div>\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`);
    previews.push(c.name);
  }
}
wr('components/index.d.ts', `// Generated by docs/build_artifact.js from components/**/*.d.ts\n${indexDts}`);

// showcase pages from the group cards
const cards = [];
for (const g of fs.readdirSync(path.join(ROOT, 'components'))) {
  const d = path.join(ROOT, 'components', g); if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.card.html')) cards.push({ file: `components/${g}/${f}`, group: g, stem: f.replace('.card.html', '') });
}
const pascal = (s) => s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const cardFail = [];
for (const c of cards) {
  const html = rd(c.file);
  const marker = html.split('\n')[0];
  const attr = (k) => (marker.match(new RegExp(k + '="([^"]*)"')) || [])[1];
  const [w, h] = (attr('viewport') || '1200x400').split('x').map(Number);
  const scripts = [...html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const body = html.replace(/<!--[\s\S]*?-->/, '').replace(/<link[^>]*>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').trim();
  let js;
  try { js = scripts.map((s, i) => compile(noPicsum(s), c.stem + i + '.jsx')).join('\n'); } catch (e) { cardFail.push(c.file + ': ' + String(e.message).split('\n')[0]); continue; }
  const name = pascal(c.stem) + 'Card';
  const sub = (attr('name') || c.stem).replace(/["<>]/g, '').replace(/--/g, '–');
  wr(`components/${name}/preview.html`, `<!-- @dsCard group="${GROUP[c.group]}" page width=${w} height=${h} subtitle="${sub}" -->\n<style>${styles}</style>\n${body}\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`);
}

// ---------------------------------------------------------------- cover
// Blocks: accent (identity), now-playing plum, the two art-gradient ends, one success tint small.
// Arrangement: a tall slab with satellites, right of x=480. Pattern: pills and discs cut from
// --radius-pill / --radius-lg (Sonora is soft: pill buttons, 16-32px corners, circular people).
// Steps: --spacing-2xl (24) gaps, radii --radius-lg (32) and full pills.
wr('components/Cover/preview.html', `<!-- @dsCard height=300 -->
<style>
html,body{margin:0;background:var(--surface-bg)}
.cv{position:relative;width:960px;height:300px;background:var(--surface-bg);overflow:hidden;font-family:var(--font-body)}
.a{fill:var(--accent)} .p{fill:var(--surface-now-playing)} .s{fill:var(--art-gradient-start)} .e{fill:var(--art-gradient-end)} .g{fill:var(--tone-library)} .c{fill:var(--surface-card)}
.name{position:absolute;left:48px;bottom:84px;margin:0;font-family:var(--font-display);font-weight:900;font-stretch:125%;font-size:104px;line-height:.92;color:var(--surface-fg);letter-spacing:-.01em}
.tag{position:absolute;left:48px;bottom:48px;width:420px;margin:0;font-size:14px;color:var(--surface-fg-muted)}
</style>
<div class="cv">
<svg width="960" height="300" viewBox="0 0 960 300" style="position:absolute;inset:0" aria-hidden="true">
<!-- blocks: accent 216x252 slab, plum 168x120, art-start 168x108, art-end pill 144x48, success disc 36; gaps 24 (spacing-2xl); corners radius-lg 32 / pills half the short side -->
<rect class="a" x="504" y="24" width="216" height="252" rx="32"/>
<rect class="p" x="744" y="24" width="192" height="120" rx="32"/>
<rect class="s" x="744" y="168" width="120" height="108" rx="32"/>
<rect class="e" x="888" y="168" width="96" height="48" rx="24"/>
<circle class="g" cx="906" cy="252" r="18"/>
<rect class="c" x="528" y="204" width="168" height="48" rx="24"/>
<circle class="e" cx="552" cy="228" r="12"/>
</svg>
<p class="name">Sonora</p>
<p class="tag">A dark-first design language for self-hosted music, podcasts and audiobooks: one big accent, square art, soft corners.</p>
</div>
`);

// ---------------------------------------------------------------- README + index
const readme = rd('readme.md');
wr('README.md', readme + `\n\n## How this artifact is made\n\nGenerated from the Sonora git repo by \`docs/build_artifact.js\`; the repo is the source of truth. Change tokens or components there, rebuild, republish. Motion, gradients, the type scale variables and anything built from other variables live in \`components/bundle.css\` exactly as in the repo, because the token editor cannot hold them.\n`);
wr('design-system.json', JSON.stringify({
  v: 3, layout: 'files', createdOnFiles: { v: 1, at: '2026-09-27T14:23:58.935Z' }, title: 'Sonora', namespace: NS,
  libraries: [{ name: 'react', version: '18' }, { name: 'react-dom', version: '18' }],
  sections: {}, groups: [], assetGroups: {}, blobs: {}, docs: { readme: 'project/README.md', sections: [] },
  lastChange: { by: 'Auralis', at: new Date().toISOString(), via: 'Claude Code · docs/build_artifact.js', note: 'Built from design/sonora in the Auralis repo' },
}, null, 2));

console.log(`tokens: ${colorTokens.length} colours, ${Object.entries(other).map(([k, v]) => v.length + ' ' + k).join(', ')}`);
console.log(`colour-mix resolved: ${report.mixed.length}; kept in bundle.css: ${residue.length} (${report.residue.length} non-type)`);
for (const r of report.residue) console.log('   residue ' + r);
console.log(`components: ${comps.length}, with previews: ${previews.length}; showcase cards: ${cards.length - cardFail.length}/${cards.length}`);
for (const f of cardFail) console.log('   CARD FAIL ' + f);
