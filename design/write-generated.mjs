// Writes the design build outputs: node design/write-generated.mjs
//   generated/web/tokens.css · generated/android/DesignTokens.kt · design/components/<id>/<id>.d.ts (each component's note: the first paragraph of its .md)
//   · app/hires/<name>/<name>.d.ts (each hire: its component's props type, with the hire's note)
//   · generated/tokens.json (every token of every level, grouped by inheritance: NOTES decision 54)
import fs from 'node:fs';
import { loadDesign, loadDesignRaw, resolveExtends, loadNotes } from './load.js';
import { buildCss, buildKotlin, buildDts, buildTokenTree } from './build.js';

const dir = new URL('.', import.meta.url).pathname, root = dir + '../';
const read = p => Promise.resolve(fs.readFileSync(dir + p, 'utf8'));
const specs = await loadDesign(read), raw = await loadDesignRaw(read), resolved = resolveExtends(raw);
const notes = await loadNotes(read, Object.keys(resolved.components));
const write = (p, text) => { fs.mkdirSync(p.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(p, text); };
write(root + 'generated/web/tokens.css', buildCss(specs));
write(root + 'generated/android/DesignTokens.kt', buildKotlin(specs));
for (const id of Object.keys(resolved.components)) {
  const note = (notes[id] || '').split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').replace(/\*\//g, '* /');
  write(dir + 'components/' + id + '/' + id + '.d.ts', buildDts(id, raw.components[id], resolved.components[id], note));
}
// hires (app/hires): each one's props are its component's; its type carries the hire's note, contract and picks
const pascal = x => x[0].toUpperCase() + x.slice(1);
const man = JSON.parse(fs.readFileSync(root + 'app/composition.json', 'utf8'));
for (const name of man.hires) {
  const h = JSON.parse(fs.readFileSync(root + 'app/hires/' + name + '/' + name + '.json', 'utf8'));
  let note = ''; try { note = fs.readFileSync(root + 'app/hires/' + name + '/' + name + '.md', 'utf8').replace(/^#.*\n+/, '').split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').replace(/\*\//g, '* /').trim(); } catch (e) {}
  const picks = Object.entries(h.picks || {}).map(([k, v]) => k + ' ' + v).join(', ');
  write(root + 'app/hires/' + name + '/' + name + '.d.ts', '// Generated from ' + name + '.json by design/write-generated.mjs — edit the .json, not this file.\n'
    + "import type { " + pascal(h.hires) + "Props as ComponentProps } from '../../../design/components/" + h.hires + '/' + h.hires + "';\n\n"
    + '/** ' + note + '\n *  Contract `' + h.contract + '`; component `' + h.hires + '`' + (picks ? ' (picks ' + picks + ')' : '') + '. */\n'
    + 'export type ' + pascal(name) + 'Props = ComponentProps;\n');
}
const hires = man.hires.map(name => ({ name, ...JSON.parse(fs.readFileSync(root + 'app/hires/' + name + '/' + name + '.json', 'utf8')) }));
write(root + 'generated/tokens.json', JSON.stringify(buildTokenTree(JSON.parse(fs.readFileSync(dir + 'tokens.json', 'utf8')), raw, specs, hires), null, 1) + '\n');
console.log('wrote tokens.json, tokens.css, DesignTokens.kt, ' + Object.keys(resolved.components).length + ' component .d.ts files, ' + man.hires.length + ' hire .d.ts files');
