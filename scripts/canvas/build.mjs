/**
 * `pnpm canvas:build`: the Auralis canvas artifact (claude.ai Design type) built from design/app
 * into build/canvas. `project/**` is what the orchestrator publishes: a start page holding the
 * flowchart and the screen list, then one canvas page per page of nav.json holding its structure
 * board and, once drawn, one phone and one desktop artboard, a player sheet also a 1024 px one, a
 * phone with its local search out or its first menu open for a page with one; `canvas.json`, the
 * art they show under `art/`, and Sonora installed under `project/ds/<folder>/` from build/sonora,
 * which must be Sonora's recorded publish. `stamp.json` carries that publish's version for
 * record-publish.mjs. Refuses uncommitted changes to design/app unless --draft.
 *
 *   tsx scripts/canvas/build.mjs [--out build/canvas] [--sonora build/sonora] [--draft] [--root <dir>]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readApp } from '../../design-codegen/src/app.ts';
import {
  ART_DIR,
  DS_FILES,
  DS_FOLDER,
  canvasArt,
  generateCanvas,
} from '../../design-codegen/src/canvas.ts';
import { readProps } from '../../design-codegen/src/props.ts';
import { discoverComponents } from '../../design-codegen/src/sonora.ts';
import { buildStamp } from '../plan/record-publish.mjs';
import { sonoraInstall } from './install.mjs';

/** Where each installed file comes from in build/sonora. */
const FROM = { 'tokens.css': 'canvas/tokens.css' };

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'build/canvas' },
    sonora: { type: 'string', default: 'build/sonora' },
    draft: { type: 'boolean', default: false },
    root: { type: 'string' },
  },
});
const root = resolve(values.root ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
const out = resolve(root, values.out);
const sonoraDir = resolve(root, values.sonora);
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

let stamp, files, art;
try {
  const now = new Date();
  const install = sonoraInstall({
    published: readJson(join(root, 'design/published.json')) ?? {},
    sonoraStamp: readJson(join(sonoraDir, 'stamp.json')),
    draft: values.draft,
  });
  stamp = {
    ...buildStamp({ root, artifact: 'canvas', draft: values.draft, now }),
    sonora: { version: install.version, tree: install.tree },
  };
  const props = readProps(discoverComponents(join(root, 'design/sonora')));
  const app = readApp(join(root, 'design/app'), props);
  files = generateCanvas(app, install, now);
  art = canvasArt(app);
  const missing = art.filter((file) => !existsSync(join(root, ART_DIR, file)));
  if (missing.length > 0) throw new Error(`no ${missing.join(', ')} in ${ART_DIR}`);
} catch (error) {
  console.error(`canvas:build: ${error.message}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
const put = (rel) => {
  const file = join(out, rel);
  mkdirSync(dirname(file), { recursive: true });
  return file;
};
for (const [rel, text] of files) writeFileSync(put(join('project', rel)), text);
for (const rel of DS_FILES) {
  copyFileSync(
    join(sonoraDir, FROM[rel] ?? join('project', rel)),
    put(join('project/ds', DS_FOLDER, rel)),
  );
}
for (const file of art) copyFileSync(join(root, ART_DIR, file), put(join('project/art', file)));
writeFileSync(join(out, 'stamp.json'), `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`${relative(root, out)}/project: ${files.size + DS_FILES.length + art.length} files`);
console.log(`${relative(root, join(out, 'stamp.json'))}: ${JSON.stringify(stamp)}`);
