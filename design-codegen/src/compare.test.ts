import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkComparison, pageHash, pngSize, sonoraShot } from './compare.js';
import { readNav } from './nav.js';
import { APP_DIR, REPO_ROOT, SONORA_DIR } from './outputs.js';

const appDir = join(REPO_ROOT, APP_DIR);
const screensReadme = join(REPO_ROOT, SONORA_DIR, 'docs/screens/README.md');
const nav = readNav(appDir);

/**
 * The pages not drawn yet, which parts 2 to 4 of the canvas draw. It only shrinks; the canvas is
 * done when it is empty and this list is gone.
 */
const UNDRAWN = [
  'requests',
  'shelf',
  'music',
  'album',
  'artist',
  'playlist',
  'favourites',
  'books',
  'book',
  'author',
  'series',
  'podcasts',
  'show',
  'episode',
  'list',
  'search',
  'nowPlaying',
  'queue',
  'lyrics',
  'downloads',
  'setup',
  'signIn',
  'shelfReview',
  'notFound',
];

describe('the visual comparisons', () => {
  it('[M0.canvas/e] leave undrawn exactly the pages that have no page file yet', () => {
    const missing = nav.pages
      .map((p) => p.id)
      .filter((id) => !existsSync(join(appDir, 'pages', `${id}.page.jsx`)));
    expect(missing).toEqual(UNDRAWN);
  });

  for (const page of nav.pages.filter((p) => !UNDRAWN.includes(p.id))) {
    it(`[M0.canvas/e] ${page.id} has a comparison made from its current page, with both renders beside its Sonora UI kit renders`, () => {
      expect(checkComparison(appDir, page, screensReadme)).toEqual([]);
    });
  }
});

describe('checking a comparison', () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });
  const settings = nav.pages.find((p) => p.id === 'settings')!;

  /** A copy of the canvas holding settings' page, placeholder and comparison. */
  function copy(): string {
    tmp = mkdtempSync(join(tmpdir(), 'auralis-compare-'));
    for (const rel of ['pages/settings.page.jsx', 'placeholders/settings.json', 'compare']) {
      cpSync(join(appDir, rel), join(tmp, rel), { recursive: true });
    }
    return tmp;
  }

  it('[M0.canvas/e] fails once the page has changed since its comparison was made', () => {
    const app = copy();
    const file = join(app, 'pages/settings.page.jsx');
    writeFileSync(file, readFileSync(file, 'utf8').replace('</', '\n</'));
    expect(checkComparison(app, settings, screensReadme)).toEqual([
      'settings: the page changed since compare/settings.md was made; look again',
    ]);
  });

  it('[M0.canvas/e] fails when a render is missing or is not a PNG', () => {
    const app = copy();
    rmSync(join(app, 'compare/settings/canvas-phone.png'));
    writeFileSync(join(app, 'compare/settings/canvas-desktop.png'), 'not a png');
    expect(checkComparison(app, settings, screensReadme)).toEqual([
      'settings: compare/settings/canvas-phone.png is missing',
      'settings: compare/settings/canvas-desktop.png is not a PNG',
    ]);
  });

  it('[M0.canvas/e] fails when the differences list is empty', () => {
    const app = copy();
    const md = join(app, 'compare/settings.md');
    writeFileSync(
      md,
      readFileSync(md, 'utf8').replace(/## Differences[\s\S]*$/, '## Differences\n'),
    );
    expect(checkComparison(app, settings, screensReadme)).toEqual([
      'settings: compare/settings.md lists no differences (write - none if there are none)',
    ]);
  });

  it('names the committed Sonora UI kit render or card image of each source', () => {
    expect(sonoraShot('kit:mobile/browse')).toBe('sonora/kit-mobile-browse.png');
    expect(sonoraShot('card:episode-rows')).toBe('sonora/card-episode-rows.png');
    expect(sonoraShot('none')).toBeUndefined();
  });

  it('hashes the page file with its placeholder', () => {
    const hash = pageHash(appDir, 'settings');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(pageHash(appDir, 'browse')).not.toBe(hash);
  });

  it('reads a PNG size, and refuses what is not one', () => {
    const png = readFileSync(join(appDir, 'compare/sonora/kit-mobile-browse.png'));
    expect(pngSize(png)).toEqual({ width: 412, height: 860 });
    expect(pngSize(Buffer.from('nope'))).toBeUndefined();
  });
});
