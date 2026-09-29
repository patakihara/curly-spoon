import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageHeading } from './app.js';
import { readNav } from './nav.js';
import { APP_DIR, OUTPUTS, REPO_ROOT } from './outputs.js';
import { parsePage } from './page.js';

/**
 * The heading each page shows with its placeholder data, which both apps' navigation tests look
 * for: the web e2e (web/e2e/canvas.spec.ts) and the emulator's CanvasNavTest read the one
 * generated `headings.json`, so the two cannot drift apart.
 */
const page = (body: string) =>
  parsePage(`export default function Album({ data }) {\n  return (\n${body}\n  );\n}\n`, 'album');

describe("a page's heading", () => {
  it("is its placeholder's value when its BackLayer binds the title from its data", () => {
    const tree = page(
      '<BackdropShell back={<BackLayer title={data.album.title} />}><PageBody /></BackdropShell>',
    );
    expect(pageHeading('Album', tree, { album: { title: 'Tears of Ice' } }, 'album')).toBe(
      'Tears of Ice',
    );
  });

  it("is nav.json's title when the BackLayer's title is written out, or there is no BackLayer", () => {
    const written = page(
      '<BackdropShell back={<BackLayer title="Albums" />}><PageBody /></BackdropShell>',
    );
    expect(pageHeading('Album', written, {}, 'album')).toBe('Album');
    expect(pageHeading('Album', page('<PageBody />'), {}, 'album')).toBe('Album');
  });

  it('names the page when the bound title is not a string', () => {
    const tree = page(
      '<BackdropShell back={<BackLayer title={data.n} />}><PageBody /></BackdropShell>',
    );
    expect(() => pageHeading('Album', tree, { n: 3 }, 'album')).toThrow(
      /album: data.n is not a string/,
    );
  });

  it('[M0.canvas/c] is generated for every page of nav.json, Android-only ones included', () => {
    const nav = readNav(join(REPO_ROOT, APP_DIR));
    const headings = JSON.parse(
      readFileSync(join(REPO_ROOT, OUTPUTS.webNav, 'headings.json'), 'utf8'),
    ) as Record<string, string>;
    expect(Object.keys(headings)).toEqual(nav.pages.map((p) => p.id));
    expect(headings).toMatchObject({
      album: 'Tears of Ice',
      browse: 'Browse',
      downloads: 'Downloads',
    });
  });
});
