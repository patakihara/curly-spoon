/**
 * `pnpm gen`: the web UI package and the Android props classes, from Sonora's components; the
 * web route table and pages, from the canvas.
 *
 *   tsx src/gen.ts [--sonora <Sonora dir>] [--app <canvas dir>] [--out <output root>]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateAppWeb, readApp } from './app.js';
import { generateKotlin } from './kotlin.js';
import { APP_DIR, KOTLIN_PACKAGE, OUTPUTS, REPO_ROOT, SONORA_DIR } from './outputs.js';
import { readProps } from './props.js';
import { discoverComponents } from './sonora.js';
import { generateWeb } from './web.js';

const { values } = parseArgs({
  options: {
    sonora: { type: 'string', default: join(REPO_ROOT, SONORA_DIR) },
    app: { type: 'string', default: join(REPO_ROOT, APP_DIR) },
    out: { type: 'string', default: REPO_ROOT },
  },
});
const out = resolve(values.out);

const components = discoverComponents(resolve(values.sonora));
const props = readProps(components);
const app = generateAppWeb(readApp(resolve(values.app), props));
const outputs: Record<keyof typeof OUTPUTS, Map<string, string>> = {
  web: generateWeb(components),
  kotlin: generateKotlin(props, KOTLIN_PACKAGE),
  webNav: app.nav,
  webPages: app.pages,
};

// Every folder belongs to this generator alone, so a stale file cannot survive a run.
for (const rel of Object.values(OUTPUTS)) rmSync(join(out, rel), { recursive: true, force: true });
for (const [key, files] of Object.entries(outputs) as [
  keyof typeof OUTPUTS,
  Map<string, string>,
][]) {
  for (const [path, content] of files) {
    const file = join(out, OUTPUTS[key], path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  process.stdout.write(`wrote ${files.size} files to ${OUTPUTS[key]}\n`);
}
