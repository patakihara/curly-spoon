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
