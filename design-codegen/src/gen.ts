/**
 * `pnpm gen`: the web UI package and the Android props classes, from Sonora's components; the
 * web gallery, from Sonora's cards, and the Android gallery, from the web gallery's usages; the
 * web CSS tokens and `SonoraTokens.kt`, from Sonora's token export; the web route table and
 * pages and the Android nav graph and pages, from the canvas. It fails when Sonora's committed
 * token export is out of date.
 *
 *   tsx src/gen.ts [--sonora <Sonora dir>] [--app <canvas dir>] [--out <output root>]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateAppKotlin, generateAppWeb, readApp } from './app.js';
import { androidComponents, androidSonoraDir } from './android-sonora.js';
import { galleryEntries, generateGallery, readCards } from './gallery.js';
import { generateKotlinGallery } from './gallery-kotlin.js';
import { generateKotlin } from './kotlin.js';
import { APP_DIR, KOTLIN_PACKAGE, OUTPUTS, REPO_ROOT, SONORA_DIR } from './outputs.js';
import { readProps } from './props.js';
import { discoverComponents } from './sonora.js';
import { exportDrift, generateTokens } from './tokens.js';
import { generateWeb } from './web.js';

const { values } = parseArgs({
  options: {
    sonora: { type: 'string', default: join(REPO_ROOT, SONORA_DIR) },
    app: { type: 'string', default: join(REPO_ROOT, APP_DIR) },
    out: { type: 'string', default: REPO_ROOT },
  },
});
const out = resolve(values.out);
const sonora = resolve(values.sonora);

const tokens = await generateTokens(sonora);
const drift = exportDrift(sonora, tokens.exported);
if (drift.length > 0) {
  process.stderr.write(
    `Sonora's committed export differs from what its tokens give now: ${drift.join(', ')}.\n` +
      'Re-export in Sonora with export/generate.js, publish it, and pull it in before pnpm gen.\n',
  );
  process.exit(1);
}

const components = discoverComponents(sonora);
const props = readProps(components);
const canvas = readApp(resolve(values.app), props);
const app = generateAppWeb(canvas);
const android = generateAppKotlin(canvas, props);
const { entries } = galleryEntries(components, readCards(sonora));
// The Android gallery draws the Sonora composables :sonora has; a test names any it leaves out.
const androidSonora = new Set(androidComponents(androidSonoraDir(REPO_ROOT)).keys());
const outputs: Record<keyof typeof OUTPUTS, Map<string, string>> = {
  web: generateWeb(components),
  kotlin: generateKotlin(props, KOTLIN_PACKAGE),
  webNav: app.nav,
  webPages: app.pages,
  webTokens: tokens.web,
  webGallery: generateGallery(sonora, components),
  kotlinTheme: tokens.kotlin,
  kotlinGallery: generateKotlinGallery(entries, props, androidSonora),
  kotlinNav: android.nav,
  kotlinPages: android.pages,
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
