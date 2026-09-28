import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The built web app names no outside host: everything the page loads, fonts and icons included,
 * comes from the container's own origin. The browser-side check is web/e2e/self-hosted.spec.ts.
 */

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
const FAMILIES = ['Inter', 'Archivo', 'Material Symbols Rounded'];

let outDir: string;
let files: string[];
const read = (file: string) => readFileSync(join(outDir, file), 'utf8');

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'auralis-web-dist-'));
  await build({
    root: webDir,
    configFile: join(webDir, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });
  files = readdirSync(outDir, { recursive: true, encoding: 'utf8' });
}, 120_000);

afterAll(() => {
  if (outDir !== undefined) rmSync(outDir, { recursive: true, force: true });
});

/** Every `url(...)` and `@import` target in a stylesheet. */
function cssRefs(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => m[2]);
  const imports = [...css.matchAll(/@import\s*(['"])([^'"]+)\1/g)].map((m) => m[2]);
  return [...urls, ...imports].filter((ref): ref is string => ref !== undefined);
}

/** Every `src` and `href` in a page. */
function htmlRefs(html: string): string[] {
  return [...html.matchAll(/\s(?:src|href)=(['"])([^'"]*)\1/g)].map((m) => m[2] ?? '');
}

const isOutside = (ref: string) =>
  /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref) && !ref.startsWith('data:');

describe('the built web app', () => {
  it('[M0.tokens/b] loads every page resource and stylesheet reference from its own origin', () => {
    const outside: string[] = [];
    for (const file of files) {
      if (file.endsWith('.html')) outside.push(...htmlRefs(read(file)).filter(isOutside));
      if (file.endsWith('.css')) outside.push(...cssRefs(read(file)).filter(isOutside));
    }
    expect(outside).toEqual([]);
  });

  it('[M0.tokens/b] names no Google Fonts host anywhere in its HTML, CSS or JavaScript', () => {
    const naming = files.filter((f) => /\.(html|css|js)$/.test(f) && FONT_HOSTS.test(read(f)));
    expect(naming).toEqual([]);
  });

  it('[M0.tokens/b] serves Inter, Archivo and Material Symbols Rounded as woff2 files it ships', () => {
    const css = files
      .filter((f) => f.endsWith('.css'))
      .map(read)
      .join('\n');
    for (const family of FAMILIES) {
      const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)]
        .map((m) => m[1] ?? '')
        .filter((body) => new RegExp(`font-family:\\s*['"]?${family}['"]?\\s*;`).test(body));
      expect(faces.length, `@font-face rules for ${family}`).toBeGreaterThan(0);
      for (const face of faces) {
        for (const ref of cssRefs(face)) {
          expect(ref, `${family} src`).toMatch(/\.woff2$/);
          expect(existsSync(join(outDir, ref.replace(/^\//, ''))), `${ref} is in the build`).toBe(
            true,
          );
        }
      }
    }
  });
});

describe('the web sources', () => {
  it('[M0.tokens/b] name no Google Fonts host, so the dev server makes no such request either', () => {
    const sources = [
      join(webDir, 'index.html'),
      ...readdirSync(join(webDir, 'src'), { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.(css|tsx?|jsx?|html)$/.test(f) && !f.endsWith('self-hosted.test.ts'))
        .map((f) => join(webDir, 'src', f)),
    ];
    const naming = sources
      .filter((f) => FONT_HOSTS.test(readFileSync(f, 'utf8')))
      .map((f) => relative(webDir, f));
    expect(naming).toEqual([]);
  });
});
