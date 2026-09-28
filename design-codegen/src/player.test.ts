import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readApp } from './app.js';
import { generateCanvas } from './canvas.js';
import { APP_DIR, REPO_ROOT, SONORA_DIR } from './outputs.js';
import { readProps } from './props.js';
import { PLAYER_TABS } from './shell.js';
import { discoverComponents } from './sonora.js';
import { elements, readPage } from './test-pages.js';

const appDir = join(REPO_ROOT, APP_DIR);
const props = readProps(discoverComponents(join(REPO_ROOT, SONORA_DIR)));
const app = readApp(appDir, props);
const sheets = app.nav.pages.filter((p) => p.presentation === 'sheet');
const files = generateCanvas(app, { title: 'Sonora', artifact: 'a', version: null }, new Date(0));
const root = (id: string) => readPage(id).tree;
const shellFile = app.shell;
/** The side panel's tree in a desktop artboard: the NowPlaying element, whole. */
const panelOf = (board: string) => {
  const start = board.indexOf('{"kind":"element","component":"NowPlaying"');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < board.length; i++) {
    if (board[i] === '{') depth++;
    else if (board[i] === '}' && --depth === 0) return board.slice(start, i + 1);
  }
  throw new Error('unterminated panel');
};
const component = (id: string) => {
  const tree = root(id);
  return tree.kind === 'element' ? tree.component : tree.kind;
};

describe("the player's sheets: Now Playing, Queue and Lyrics", () => {
  it("[M0.canvas] draws each as its tab's page alone, the shell putting it in the player", () => {
    expect(sheets.map((p) => [p.id, PLAYER_TABS[p.id]])).toEqual([
      ['nowPlaying', 'now'],
      ['queue', 'queue'],
      ['lyrics', 'lyrics'],
    ]);
    expect(sheets.map((p) => component(p.id))).toEqual([
      'NowPlayingPage',
      'QueuePage',
      'LyricsPage',
    ]);
  });

  it('[M0.canvas] covers the phone with the sheet alone, open on its tab, with no bottom bar under it', () => {
    for (const { id } of sheets) {
      const board = files.get(`${id}.phone.dc.html`)!;
      expect(board).toContain(
        `<x-import component-from-global-scope="SonoraDesignSystem_6c1435.NowPlaying" open="{{ true }}" tab="${PLAYER_TABS[id]}"`,
      );
      expect(board).not.toContain('SonoraDesignSystem_6c1435.BackdropShell');
      expect(board).not.toContain('"BottomNav"');
    }
  });

  it('[M0.canvas] holds it in the desktop side panel, open on its tab, beside the page it is drawn over', () => {
    for (const { id } of sheets) {
      const board = files.get(`${id}.desktop.dc.html`)!;
      expect(board).toContain('SonoraDesignSystem_6c1435.BackdropShell');
      expect(board).toMatch(
        new RegExp(
          `"component":"NowPlaying"[^\\]]*"tab":\\{"kind":"literal","value":"${PLAYER_TABS[id]}"\\}`,
        ),
      );
      expect(board).toContain('const scope = { data, shell, sheet };');
      expect(board).toContain(
        `<title>${app.nav.pages.find((p) => p.id === id)!.title} · desktop</title>`,
      );
    }
  });

  it('[M0.canvas] gives Now Playing the transport of what is loaded, music or spoken', () => {
    const page = elements(root('nowPlaying')).find((e) => e.component === 'NowPlayingPage')!;
    expect(page.props.variant).toEqual({ kind: 'binding', path: ['shell', 'playing', 'variant'] });
  });

  it('[M0.canvas] shows both queues, what played, the hand-off to the other queue and autoplay', () => {
    const { data } = readPage('queue');
    expect((data.queues as { key: string }[]).map((q) => q.key)).toEqual(['music', 'spoken']);
    expect(data.played).not.toHaveLength(0);
    expect((data.items as { handoff?: string }[]).filter((i) => i.handoff)).toHaveLength(1);
    expect((data.autoplay as { items: unknown[] }).items).not.toHaveLength(0);
  });

  it('[M0.canvas] follows the hand-off with the spoken items that play, then marks the music as waiting', () => {
    const items = readPage('queue').data.items as {
      sub: string;
      handoff?: string;
      waiting?: string;
      current?: boolean;
    }[];
    const handoff = items.findIndex((i) => i.handoff);
    const waiting = items.findIndex((i) => i.waiting);
    const music = (i: { sub: string }) => i.sub === shellFile.playing!.artist;
    expect(items[waiting]!.waiting).toBe('Waiting in the music queue');
    // Playback moves to the spoken queue at the episode and stays there: 04-play never says music resumes.
    expect(waiting - handoff).toBeGreaterThan(1);
    expect(items.slice(handoff, waiting).some(music)).toBe(false);
    expect(items.slice(waiting).every(music)).toBe(true);
  });

  it("[M0.canvas] shows one Now Playing in every desktop page's side panel, its about card included", () => {
    const screens = app.nav.pages.filter(
      (p) => p.presentation === 'screen' && files.has(`${p.id}.desktop.dc.html`),
    );
    expect(screens.length).toBeGreaterThan(0);
    const panels = screens.map((p) => panelOf(files.get(`${p.id}.desktop.dc.html`)!));
    for (const panel of panels)
      expect(panel).toBe(panelOf(files.get('nowPlaying.desktop.dc.html')!));
    expect(panels[0]).toContain('"component":"AboutCard"');
  });

  it('[M0.canvas] draws the lyrics with sync off, a dot on the current line', () => {
    const lyrics = elements(root('lyrics')).find((e) => e.component === 'LyricsPage')!;
    expect(lyrics.props.syncMode).toEqual({ kind: 'binding', path: ['data', 'syncMode'] });
    expect(readPage('lyrics').data.syncMode).toBe('dot');
  });
});

describe('checking the player’s sheets', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'auralis-player-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const copy = (name: string) => {
    const dir = join(tmp, name);
    cpSync(appDir, dir, { recursive: true });
    return dir;
  };

  it('[M0.canvas] refuses a player sheet drawn in a backdrop', () => {
    const dir = copy('backdrop');
    writeFileSync(
      join(dir, 'pages/lyrics.page.jsx'),
      'export default function Lyrics({ data }) {\n  return <BackdropShell><LyricsPage lines={data.lines} /></BackdropShell>;\n}\n',
    );
    expect(() => readApp(dir, props)).toThrow(
      /lyrics.page.jsx: a player sheet is its tab's page alone/,
    );
  });

  it("[M0.canvas] refuses a Now Playing that reads its own data, since every page's panel shows it", () => {
    const dir = copy('now-data');
    writeFileSync(
      join(dir, 'pages/nowPlaying.page.jsx'),
      'export default function NowPlaying({ data }) {\n  return <NowPlayingPage title={shell.playing.title} sleep={data.sleep} />;\n}\n',
    );
    writeFileSync(join(dir, 'placeholders/nowPlaying.json'), '{ "sleep": "Off" }\n');
    expect(() => readApp(dir, props)).toThrow(
      /nowPlaying.page.jsx: every page's side panel shows Now Playing, so it binds only shell/,
    );
  });

  it('[M0.canvas] refuses a drawn sheet with no page named to draw it over', () => {
    const dir = copy('over');
    writeFileSync(
      join(dir, 'shell.json'),
      JSON.stringify({ ...app.shell, sheetOver: 'queue' }, null, 2),
    );
    expect(() => readApp(dir, props)).toThrow(
      /sheetOver names queue, not a web page drawn as a screen/,
    );
  });
});
