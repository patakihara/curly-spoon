import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkComparison,
  componentFile,
  pageHash,
  pngSize,
  sonoraShot,
  usedComponents,
} from './compare.js';
import { readNav } from './nav.js';
import { APP_DIR, REPO_ROOT, SONORA_DIR } from './outputs.js';

const appDir = join(REPO_ROOT, APP_DIR);
const sonoraDir = join(REPO_ROOT, SONORA_DIR);
const nav = readNav(appDir);

describe('the visual comparisons', () => {
  it('[M0.canvas/e] cover every page of nav.json, each drawn in its page file', () => {
    const missing = nav.pages
      .map((p) => p.id)
      .filter((id) => !existsSync(join(appDir, 'pages', `${id}.page.jsx`)));
    expect(missing).toEqual([]);
  });

  for (const page of nav.pages) {
    it(`[M0.canvas/e] ${page.id} has a comparison made from its current page, with both renders beside its Sonora UI kit renders`, () => {
      expect(checkComparison(appDir, sonoraDir, page)).toEqual([]);
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

  /** A copy of the canvas holding settings' page, placeholder and comparison, and of Sonora. */
  function copy(): string {
    tmp = mkdtempSync(join(tmpdir(), 'auralis-compare-'));
    for (const rel of [
      'nav.json',
      'shell.json',
      'pages/settings.page.jsx',
      'pages/nowPlaying.page.jsx',
      'placeholders/settings.json',
      'placeholders/nowPlaying.json',
      'compare',
    ]) {
      cpSync(join(appDir, rel), join(tmp, 'app', rel), { recursive: true });
    }
    for (const rel of ['components', 'docs/screens/README.md']) {
      cpSync(join(sonoraDir, rel), join(tmp, 'sonora', rel), { recursive: true });
    }
    return join(tmp, 'app');
  }
  const sonora = () => join(tmp ?? '', 'sonora');

  it('[M0.canvas/e] fails once the page has changed since its comparison was made', () => {
    const app = copy();
    const file = join(app, 'pages/settings.page.jsx');
    writeFileSync(file, readFileSync(file, 'utf8').replace('</', '\n</'));
    expect(checkComparison(app, sonora(), settings)).toEqual([
      'settings: the page changed since compare/settings.md was made; look again',
    ]);
  });

  it('[M0.canvas/e] fails once the shell the page sits in has changed since its comparison was made', () => {
    const app = copy();
    const file = join(app, 'shell.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"Account"', '"You"'));
    expect(checkComparison(app, sonora(), settings)).toEqual([
      'settings: the page changed since compare/settings.md was made; look again',
    ]);
  });

  for (const [what, change] of [
    ['its title', (page: Record<string, unknown>) => ({ ...page, title: 'Preferences' })],
    [
      'its filter',
      (page: Record<string, unknown>) => ({ ...page, filter: { all: 'All', narrows: ['music'] } }),
    ],
  ] as const) {
    it(`[M0.canvas/e] fails once ${what} in nav.json, which the shell draws, has changed since its comparison was made`, () => {
      const app = copy();
      const file = join(app, 'nav.json');
      const json = JSON.parse(readFileSync(file, 'utf8')) as { pages: Record<string, unknown>[] };
      json.pages = json.pages.map((p) => (p.id === 'settings' ? change(p) : p));
      writeFileSync(file, JSON.stringify(json));
      expect(checkComparison(app, sonora(), settings)).toEqual([
        'settings: the page changed since compare/settings.md was made; look again',
      ]);
    });
  }

  for (const [component, why] of [
    ['PageBody', 'a component the page draws'],
    ['SectionHeader', 'a component one the page draws looks up'],
    ['NavRail', 'a component the shell draws'],
  ] as const) {
    it(`[M0.canvas/e] fails once ${why} has changed since the comparison was made`, () => {
      const app = copy();
      const file = componentFile(sonora(), component)!;
      writeFileSync(file, readFileSync(file, 'utf8') + '\n');
      expect(checkComparison(app, sonora(), settings)).toEqual([
        'settings: the page changed since compare/settings.md was made; look again',
      ]);
    });
  }

  it("[M0.canvas/e] a page's hash moves once Sonora's shared helpers change, since every component reads them", () => {
    const app = copy();
    const before = pageHash(app, sonora(), 'settings');
    const file = join(sonora(), 'components', 'shared.js');
    writeFileSync(file, readFileSync(file, 'utf8') + '\n');
    expect(pageHash(app, sonora(), 'settings')).not.toBe(before);
  });

  it("[M0.canvas/e] fails once Now Playing's page has changed, since every page's side panel shows it", () => {
    const app = copy();
    const file = join(app, 'pages/nowPlaying.page.jsx');
    writeFileSync(file, readFileSync(file, 'utf8').replace('round\n', ''));
    expect(checkComparison(app, sonora(), settings)).toEqual([
      'settings: the page changed since compare/settings.md was made; look again',
    ]);
  });

  it('[M0.canvas/e] fails when a render is missing or is not a PNG', () => {
    const app = copy();
    rmSync(join(app, 'compare/settings/canvas-phone.png'));
    writeFileSync(join(app, 'compare/settings/canvas-desktop.png'), 'not a png');
    expect(checkComparison(app, sonora(), settings)).toEqual([
      'settings: compare/settings/canvas-phone.png is missing',
      'settings: compare/settings/canvas-desktop.png is not a PNG',
    ]);
  });

  it("[M0.canvas/c] fails when a player sheet's 1024 px render, the panel the mini-player opens there, is missing", () => {
    const app = copy();
    const nowPlaying = nav.pages.find((p) => p.id === 'nowPlaying')!;
    expect(checkComparison(app, sonora(), nowPlaying)).toEqual([]);
    rmSync(join(app, 'compare/nowPlaying/canvas-tablet.png'), { force: true });
    expect(checkComparison(app, sonora(), nowPlaying)).toEqual([
      'nowPlaying: compare/nowPlaying/canvas-tablet.png is missing',
    ]);
    expect(checkComparison(app, sonora(), settings)).toEqual([]);
  });

  it('[M0.canvas/e] fails when the differences list is empty', () => {
    const app = copy();
    const md = join(app, 'compare/settings.md');
    writeFileSync(
      md,
      readFileSync(md, 'utf8').replace(/## Differences[\s\S]*$/, '## Differences\n'),
    );
    expect(checkComparison(app, sonora(), settings)).toEqual([
      'settings: compare/settings.md lists no differences (write - none if there are none)',
    ]);
  });

  it('names the committed Sonora UI kit render or card image of each source', () => {
    expect(sonoraShot('kit:mobile/browse')).toBe('sonora/kit-mobile-browse.png');
    expect(sonoraShot('card:episode-rows')).toBe('sonora/card-episode-rows.png');
    expect(sonoraShot('none')).toBeUndefined();
  });

  it('hashes the page file with its placeholder and the Sonora sources it draws with', () => {
    const hash = pageHash(appDir, sonoraDir, 'settings');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(pageHash(appDir, sonoraDir, 'browse')).not.toBe(hash);
  });

  it('follows the components a page uses through their NS() lookups and imports', () => {
    const used = usedComponents(sonoraDir, ['Section', 'PageBody']);
    expect(used).toEqual(expect.arrayContaining(['PageBody', 'Section', 'SectionHeader']));
    expect(used).toEqual([...used].sort());
  });

  it('reads a PNG size, and refuses what is not one', () => {
    const png = readFileSync(join(appDir, 'compare/sonora/kit-mobile-browse.png'));
    expect(pngSize(png)).toEqual({ width: 412, height: 860 });
    expect(pngSize(Buffer.from('nope'))).toBeUndefined();
  });
});
