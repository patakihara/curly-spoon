import { describe, expect, it } from 'vitest';
import { parseNav } from './nav.js';
import { generateKotlinNav, graphDestinations } from './nav-kotlin.js';

const structure = {
  purpose: 'P.',
  sections: [{ name: 'S', holds: 'H.' }],
  empty: 'E.',
  links: [],
};
const entry = (id: string, route: string, over: Record<string, unknown> = {}) => ({
  id,
  route,
  lights: 'music',
  close: 'opener',
  presentation: 'screen',
  title: id,
  sources: { sonora: ['none'], spotify: [] },
  structure,
  ...over,
});
const nav = parseNav({
  destinations: [
    { id: 'music', label: 'Music', icon: 'album' },
    { id: 'search', label: 'Search', icon: 'search' },
  ],
  layouts: [{ minWidth: 0, nav: 'bottomBar', order: ['music', 'search'] }],
  back: { close: 'opener', stacks: 'perDestination', android: 'close', web: 'previousView' },
  pages: [
    entry('music', '/music', { close: 'none' }),
    entry('album', '/music/albums/:ref', { params: { ref: 'ItemRef' } }),
    entry('search', '/search?q', { lights: 'search', close: 'none' }),
    entry('webOnly', '/web-only', { platforms: ['web'] }),
    entry('downloads', '/downloads', { lights: null, platforms: ['android'] }),
    entry('queue', '/playing/queue', { lights: null, close: 'sheet', presentation: 'sheet' }),
    entry('notFound', '*', { lights: null }),
  ],
});
const graph = generateKotlinNav(nav, new Set(['music', 'album', 'search', 'downloads', 'queue']));

describe('the Android nav graph, from nav.json', () => {
  it('has a destination for each Android page, Android-only ones included, and none for a web-only page', () => {
    expect(graphDestinations(graph)).toEqual([
      'music',
      'album',
      'search',
      'downloads',
      'queue',
      'notFound',
    ]);
  });

  it('types each route: a path parameter is required, a query name optional, no parameter an object', () => {
    expect(graph).toContain('    @Serializable data class Album(val ref: String) : Route\n');
    expect(graph).toContain('    @Serializable data class Search(val q: String? = null) : Route\n');
    expect(graph).toContain('    @Serializable data object Music : Route\n');
    expect(graph).not.toContain('WebOnly');
  });

  it('draws each drawn page and leaves an undrawn one empty', () => {
    expect(graph).toContain('composable<Route.Album> { AlbumPage(navController, actions) }');
    expect(graph).toContain('composable<Route.NotFound> {}');
  });

  it('keeps a stack per destination: the bottom bar saves the one it leaves and restores the one it opens', () => {
    expect(graph).toMatch(/fun openDestination[\s\S]*saveState = true[\s\S]*restoreState = true/);
    expect(graph).toContain('"music" -> Route.Music');
    expect(graph).toContain('"search" -> Route.Search()');
  });

  it('leaves the page showing when a destination is tapped over it and it lights another or none', () => {
    expect(graph).toMatch(
      /fun openDestination[\s\S]*resumed\?\.id == showing\.id && lights\(resumed\.destination\) != id\) \{\n\s+navController\.popBackStack\(\)/,
    );
    expect(graph).toContain('destination.hasRoute<Route.Album>() -> "music"');
    expect(graph).toContain('destination.hasRoute<Route.Search>() -> "search"');
    expect(graph).not.toContain('hasRoute<Route.Downloads>()');
    expect(graph).not.toContain('hasRoute<Route.NotFound>()');
  });

  it('closes a page to its opener, or with nothing under it, to the home it is given', () => {
    expect(graph).toMatch(
      /fun closePage\(navController: NavController, home: Route\) \{\n\s+if \(navController.previousBackStackEntry != null\) navController.popBackStack\(\)/,
    );
  });

  it("switches the player's tabs between its sheets on Android", () => {
    expect(graph).toContain('"queue" -> Route.Queue');
  });

  it('refuses a destination whose home takes a route parameter, which the bottom bar cannot give', () => {
    const bad = parseNav({
      ...nav,
      pages: [entry('music', '/music/:ref', { close: 'none', params: { ref: 'ItemRef' } })],
    });
    expect(() => generateKotlinNav(bad, new Set())).toThrow(/music.*parameter/);
  });
});
