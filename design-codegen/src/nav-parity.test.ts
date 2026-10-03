import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { componentName } from './nav.js';
import { OUTPUTS, REPO_ROOT } from './outputs.js';

/**
 * The two apps' generated navigation, read side by side: the web router (`routes.tsx`) and the
 * Android graph (`AuralisNavGraph.kt` and its pages), both from the same nav.json. Each page on
 * both platforms has the same route parameters and the same back rule on each.
 */
interface Shape {
  /** Path parameters, required. */
  params: string[];
  /** Query names, optional. */
  query: string[];
  /** How the page closes: to its opener, as a sheet, or not at all. */
  close: 'opener' | 'sheet' | 'none';
  /** The destination whose home it closes to with nothing under it, when it closes. */
  home?: string;
}

const lower = (name: string) => name[0]!.toLowerCase() + name.slice(1);

/** Each web page's shape, from routes.tsx's `pages` table. */
function webShapes(routes: string): Map<string, Shape> {
  const row =
    /\{ id: '(\w+)', path: '([^']*)', query: \[([^\]]*)\], title: '(?:[^'\\]|\\.)*', lights: (?:'(\w+)'|null), close: '(\w+)'/g;
  return new Map(
    [...routes.matchAll(row)].map((m) => [
      m[1]!,
      {
        params: [...m[2]!.matchAll(/:(\w+)/g)].map((p) => p[1]!),
        query: [...m[3]!.matchAll(/'(\w+)'/g)].map((q) => q[1]!),
        close: m[5] as Shape['close'],
        ...(m[5] === 'none' ? {} : { home: m[4] ?? 'browse' }),
      },
    ]),
  );
}

/** Each Android page's shape, from the graph's typed routes and the page's own back handler. */
function androidShapes(graph: string, pages: Map<string, string>): Map<string, Shape> {
  const decl = /@Serializable data (?:object|class) (\w+)(?:\(([^)]*)\))? : Route/g;
  return new Map(
    [...graph.matchAll(decl)].map((m) => {
      const fields = [...(m[2] ?? '').matchAll(/val (\w+): String(\?)?/g)];
      const page = pages.get(`${m[1]}Page.kt`) ?? '';
      const home = /BackHandler \{ closePage\(navController, Route\.(\w+)\W/.exec(page)?.[1];
      const close = home === undefined ? 'none' : page.includes('openTab(') ? 'sheet' : 'opener';
      return [
        lower(m[1]!),
        {
          params: fields.filter((f) => f[2] === undefined).map((f) => f[1]!),
          query: fields.filter((f) => f[2] !== undefined).map((f) => f[1]!),
          close,
          ...(home === undefined ? {} : { home: lower(home) }),
        },
      ];
    }),
  );
}

/** Where two shape tables disagree on a page both have, one line each; and the pages only one has. */
function differences(web: Map<string, Shape>, android: Map<string, Shape>): string[] {
  const out: string[] = [];
  for (const [id, w] of web) {
    const a = android.get(id);
    if (a === undefined) out.push(`${id}: on the web only`);
    else if (JSON.stringify(a) !== JSON.stringify(w))
      out.push(`${id}: web ${JSON.stringify(w)}, Android ${JSON.stringify(a)}`);
  }
  for (const id of android.keys()) if (!web.has(id)) out.push(`${id}: on Android only`);
  return out;
}

const read = (dir: string, file: string) => readFileSync(join(REPO_ROOT, dir, file), 'utf8');
const kotlinPages = () =>
  new Map(
    readdirSync(join(REPO_ROOT, OUTPUTS.kotlinPages)).map((f) => [f, read(OUTPUTS.kotlinPages, f)]),
  );

describe('the web router and the Android graph, generated from one nav.json', () => {
  it('[M0.canvas/a] give each page the same route parameters and back rule, Downloads alone Android-only', () => {
    const web = webShapes(read(OUTPUTS.webNav, 'routes.tsx'));
    const android = androidShapes(read(OUTPUTS.kotlinNav, 'AuralisNavGraph.kt'), kotlinPages());
    expect(web.size).toBe(25);
    expect(differences(web, android)).toEqual(['downloads: on Android only']);
    expect(android.get('album')).toEqual({
      params: ['ref'],
      query: [],
      close: 'opener',
      home: 'music',
    });
    expect(android.get('search')).toEqual({ params: [], query: ['q'], close: 'none' });
    expect(android.get('queue')).toEqual({ params: [], query: [], close: 'sheet', home: 'browse' });
  });

  it('names a page whose parameter or back rule differs between the two', () => {
    const web = webShapes(
      "  { id: 'album', path: '/music/albums/:ref', query: [], title: 'Album', lights: 'music', close: 'opener', presentation: 'screen' },\n" +
        "  { id: 'search', path: '/search', query: ['q'], title: 'Search', lights: 'search', close: 'none', presentation: 'screen' },",
    );
    const android = androidShapes(
      '    @Serializable data class Album(val id: String) : Route\n' +
        '    @Serializable data class Search(val q: String? = null) : Route\n',
      new Map([
        [
          `${componentName('search')}Page.kt`,
          'BackHandler { closePage(navController, Route.Search) }',
        ],
      ]),
    );
    expect(differences(web, android)).toEqual([
      'album: web {"params":["ref"],"query":[],"close":"opener","home":"music"}, Android {"params":["id"],"query":[],"close":"none"}',
      'search: web {"params":[],"query":["q"],"close":"none"}, Android {"params":[],"query":["q"],"close":"opener","home":"search"}',
    ]);
  });
});

/**
 * The shell's controls each page wires on the phone, as a set of each handler prop and what it
 * does: `onClick:close:<home>`, `onChange:destination`, `onOpen:open:<page>`, `onTabChange:tab`.
 * The web's are its w0 chrome's (or, for a player sheet, the shell's one `Player`'s), through `go`; Android's are its page's,
 * the back handler left out, and only the mini-player's `onOpen` and the avatar's `onClick`
 * counted as the shell's own opens, since a page's own links navigate the same way.
 */
function webWiring(source: string, ids: Map<string, string>): string[] {
  const phone = / {2}w0: \(\w*\) => \(\{\n([\s\S]*?)\n {2}\}\),/.exec(source)?.[1] ?? source;
  return [
    ...new Set(
      [...phone.matchAll(/(\w+)=\{(?:\w+ \? )?\(?\w*\)? => go\.(\w+)\(([^)]*)\)/g)].map(
        ([, prop, verb, arg]) => {
          const value = arg!.replace(/'/g, '');
          if (verb === 'close') return `${prop}:close:${value}`;
          if (verb === 'open') return `${prop}:open:${ids.get(value) ?? value}`;
          return `${prop}:${verb}`;
        },
      ),
    ),
  ].sort();
}

function androidWiring(source: string): string[] {
  const body = source.replace(/^ {4}BackHandler .*$/m, '');
  const handler = (call: string) => new RegExp(`(\\w+) = \\{\\s*(?:\\w+ ->\\s*)?${call}`, 'g');
  return [
    ...new Set([
      ...[...body.matchAll(handler('closePage\\(navController, Route\\.(\\w+)\\)'))].map(
        (m) => `${m[1]}:close:${lower(m[2]!)}`,
      ),
      ...[...body.matchAll(handler('openDestination\\(navController, key\\)'))].map(
        (m) => `${m[1]}:destination`,
      ),
      ...[...body.matchAll(handler('navController\\.navigate\\(Route\\.(\\w+)\\)'))]
        .filter((m) => m[1] === 'onOpen')
        .map((m) => `${m[1]}:open:${lower(m[2]!)}`),
      ...[
        ...body.matchAll(
          /AccountButtonProps\([^)]*?(onClick) = \{\s*navController\.navigate\(Route\.(\w+)\)/g,
        ),
      ].map((m) => `${m[1]}:open:${lower(m[2]!)}`),
      ...[...body.matchAll(handler('openTab\\(navController, tab\\)'))].map((m) => `${m[1]}:tab`),
    ]),
  ].sort();
}

describe("the shell's controls, on the web and on Android", () => {
  it('[M0.canvas] are wired alike, each on the same handler prop, on every page both apps have, on the phone', () => {
    const routes = read(OUTPUTS.webNav, 'routes.tsx');
    const ids = new Map(
      [...routes.matchAll(/\{ id: '(\w+)', path: '([^']*)', query/g)].map((m) => [m[2]!, m[1]!]),
    );
    const sheets = new Set(
      [...routes.matchAll(/\{ id: '(\w+)', [^\n]*presentation: 'sheet' \}/g)].map((m) => m[1]!),
    );
    const shell = read(OUTPUTS.webNav, 'Shell.tsx');
    const player = shell.slice(
      shell.indexOf('export function Player('),
      shell.indexOf('export function Shell('),
    );
    const android = kotlinPages();
    const differ: string[] = [];
    const kinds = new Set<string>();
    let wired = 0;
    for (const file of readdirSync(join(REPO_ROOT, OUTPUTS.webPages))) {
      const kotlin = android.get(file.replace('.tsx', 'Page.kt'));
      if (kotlin === undefined) continue;
      const id = file.replace('.tsx', '').replace(/^./, (c) => c.toLowerCase());
      const web = webWiring(sheets.has(id) ? player : read(OUTPUTS.webPages, file), ids);
      const mobile = androidWiring(kotlin);
      if (web.length > 0) wired++;
      for (const w of web) kinds.add(w.split(':').slice(0, 2).join(':'));
      if (JSON.stringify(web) !== JSON.stringify(mobile))
        differ.push(`${file}: web ${web.join(' ')}, Android ${mobile.join(' ')}`);
    }
    expect(wired).toBeGreaterThan(20);
    expect([...kinds].sort()).toEqual([
      'onChange:destination',
      'onClick:close',
      'onClick:open',
      'onClose:close',
      'onOpen:open',
      'onTabChange:tab',
    ]);
    expect(differ).toEqual([]);
  });

  it('names a page whose controls are wired differently on the two', () => {
    const web = webWiring(
      "  w0: (go) => ({\n    leading: <IconButton onClick={() => go.close('music')} />,\n  }),",
      new Map(),
    );
    const android = androidWiring(
      '    BackHandler { closePage(navController, Route.Music) }\n    IconButton(IconButtonProps(onClick = {}))',
    );
    expect(web).toEqual(['onClick:close:music']);
    expect(android).toEqual([]);
  });

  it('names a control whose handler is on a different prop on the two', () => {
    const web = webWiring(
      '  w0: (go) => ({\n    player: <BottomNav onChange={(key) => go.destination(key)} />,\n  }),',
      new Map(),
    );
    const android = androidWiring(
      '    BottomNav(BottomNavProps(onSelect = { key -> openDestination(navController, key) }))',
    );
    expect(web).toEqual(['onChange:destination']);
    expect(android).toEqual(['onSelect:destination']);
  });
});
