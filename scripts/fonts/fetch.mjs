/**
 * Fetches the fonts Auralis serves itself, once, by hand: `node scripts/fonts/fetch.mjs`.
 * Never run by a test or by CI; the files it writes are committed. Needs the network, the tag
 * `legacy`, and fontTools (`pip install fonttools brotli`) to turn the icon woff2 into a TTF.
 *
 * Web gets woff2 in web/src/fonts, Android gets TTF in android/sonora/src/main/res/font. What
 * comes from where is in web/src/fonts/README.md.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const web = join(root, 'web/src/fonts');
const androidFont = join(root, 'android/sonora/src/main/res/font');
const androidLicences = join(root, 'android/sonora/src/main/fonts');

// Google serves woff2 only to a browser; anything else gets TTF.
const BROWSER =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const CSS2 = 'https://fonts.googleapis.com/css2?family=';
// The same queries as Sonora's tokens/fonts.css and styles.css.
const ARCHIVO = `${CSS2}Archivo:wdth,wght@62.5..125,100..900&display=swap`;
const SYMBOLS = `${CSS2}Material+Symbols+Rounded:opsz,wght,FILL@20..48,100..700,0..1`;
const GOOGLE_FONTS_REPO = 'https://raw.githubusercontent.com/google/fonts/main/ofl';
const SYMBOLS_REPO = 'https://raw.githubusercontent.com/google/material-design-icons/master';

async function get(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Each `@font-face` in Google's CSS, keyed by the subset named in the comment before it. */
async function faces(cssUrl) {
  const css = (await get(cssUrl, { 'User-Agent': BROWSER })).toString('utf8');
  const out = {};
  for (const m of css.matchAll(/(?:\/\* ([\w-]+) \*\/\s*)?@font-face\s*{([^}]*)}/g)) {
    const src = /url\((https:[^)]+\.woff2)\)/.exec(m[2]);
    if (src) out[m[1] ?? 'all'] = src[1];
  }
  return out;
}

function save(dir, name, bytes) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), bytes);
  console.log(`${join(dir, name).slice(root.length + 1)}  ${bytes.length} bytes`);
}

const legacy = (path) =>
  execFileSync('git', ['show', `legacy:packages/ui/src/styles/fonts/${path}`], { cwd: root });

// Inter for web carries over from legacy, byte for byte.
save(web, 'inter-latin.woff2', legacy('inter-latin.woff2'));
save(web, 'inter-latin-ext.woff2', legacy('inter-latin-ext.woff2'));
save(web, 'OFL-Inter.txt', legacy('OFL-Inter.txt'));

const archivo = await faces(ARCHIVO);
save(web, 'archivo-latin.woff2', await get(archivo.latin));
save(web, 'archivo-latin-ext.woff2', await get(archivo['latin-ext']));
save(web, 'OFL-Archivo.txt', await get(`${GOOGLE_FONTS_REPO}/archivo/OFL.txt`));

const symbols = await faces(SYMBOLS);
const symbolsWoff2 = await get(symbols.fallback ?? symbols.all);
save(web, 'material-symbols-rounded.woff2', symbolsWoff2);
const apache = await get(`${SYMBOLS_REPO}/LICENSE`);
save(web, 'LICENSE-MaterialSymbols.txt', apache);

// Android reads one TTF per family, every script in it, from google/fonts; the icon font is the
// web woff2 decompressed, so both platforms draw the same glyphs.
save(androidFont, 'inter.ttf', await get(`${GOOGLE_FONTS_REPO}/inter/Inter%5Bopsz,wght%5D.ttf`));
save(
  androidFont,
  'archivo.ttf',
  await get(`${GOOGLE_FONTS_REPO}/archivo/Archivo%5Bwdth,wght%5D.ttf`),
);
const woff2 = join(androidFont, 'material_symbols_rounded.woff2');
writeFileSync(woff2, symbolsWoff2);
execFileSync('fonttools', [
  'ttLib.woff2',
  'decompress',
  woff2,
  '-o',
  woff2.replace(/woff2$/, 'ttf'),
]);
rmSync(woff2);
console.log('android/sonora/src/main/res/font/material_symbols_rounded.ttf  decompressed');
save(androidLicences, 'OFL-Inter.txt', await get(`${GOOGLE_FONTS_REPO}/inter/OFL.txt`));
save(androidLicences, 'OFL-Archivo.txt', await get(`${GOOGLE_FONTS_REPO}/archivo/OFL.txt`));
save(androidLicences, 'LICENSE-MaterialSymbols.txt', apache);
