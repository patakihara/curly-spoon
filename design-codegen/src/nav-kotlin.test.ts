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

  it('[M0.canvas] decides once, as each page arrives, the destination it lights: a home itself, any other page the one under it', () => {
    expect(graph).toContain(
      [
        'private fun arrive(navController: NavController) {',
        '    val entry = navController.currentBackStackEntry ?: return',
        '    if (!entry.lifecycle.currentState.isAtLeast(Lifecycle.State.CREATED)) return',
        '    if (entry.savedStateHandle.contains(LIT)) return',
        '    val lit = homeOf(entry.destination)',
        '        ?: navController.previousBackStackEntry?.let(::litOf)',
        '        ?: lights(entry.destination)',
        '        ?: return',
        '    entry.savedStateHandle[LIT] = lit',
        '}',
      ].join('\n'),
    );
    expect(graph).toMatch(
      /DisposableEffect\(navController\) \{\n\s+val listener = NavController\.OnDestinationChangedListener \{ controller, _, _ ->\n\s+arrive\(controller\)\n\s+showing\.value = controller\.currentBackStackEntry\n\s+\}\n\s+navController\.addOnDestinationChangedListener\(listener\)/,
    );
    expect(graph).toContain(
      [
        'fun homeOf(destination: NavDestination): String? = when {',
        '    destination.hasRoute<Route.Music>() -> "music"',
        '    destination.hasRoute<Route.Search>() -> "search"',
        '    else -> null',
        '}',
      ].join('\n'),
    );
  });

  it("[M0.canvas] lights on the bottom bar the destination the page arrived on, with nothing under it the page's own", () => {
    expect(graph).toContain(
      '@Composable\nfun litDestination(fallback: String): String =\n    (LocalViewModelStoreOwner.current as? NavBackStackEntry)?.let(::litOf) ?: fallback',
    );
    expect(graph).not.toMatch(/fun litDestination\(navController/);
    expect(graph).toContain('destination.hasRoute<Route.Album>() -> "music"');
    expect(graph).toContain('destination.hasRoute<Route.Search>() -> "search"');
    expect(graph).not.toContain('hasRoute<Route.Downloads>()');
    expect(graph).not.toContain('hasRoute<Route.NotFound>()');
  });

  it('[M0.canvas] sends the lit destination tapped again to its home, from any of its pages', () => {
    expect(graph).toMatch(
      /fun openDestination\(navController: NavController, id: String\) \{\n\s+if \(navController\.currentBackStackEntry\?\.let\(::litOf\) == id\) return goHome\(navController, id\)/,
    );
    expect(graph).toContain(
      '"music" -> navController.popBackStack<Route.Music>(inclusive = false)',
    );
    expect(graph).toMatch(
      /fun goHome[\s\S]*if \(homeOf\(navController\.currentBackStackEntry\?\.destination \?: return\) == id\) return/,
    );
  });

  it('closes a page to its opener, or with nothing under it, to the home it is given', () => {
    expect(graph).toMatch(
      /fun closePage\(navController: NavController, home: Route\) \{\n\s+if \(navController.previousBackStackEntry != null\) navController.popBackStack\(\)\n\s+else startAt\(navController, home\)/,
    );
  });

  it('[M0.canvas] makes a home left alone on the stack its bottom, the one every destination opens over, so homes never stack twice', () => {
    expect(graph).toContain(
      [
        'private fun startAt(navController: NavController, home: Route) {',
        '    navController.navigate(home) { popUpTo(rootId(navController)) { inclusive = true } }',
        '    graphEntry(navController).savedStateHandle[ROOT] = navController.currentDestination?.id ?: return',
        '}',
      ].join('\n'),
    );
    expect(graph).toContain(
      'graphEntry(navController).savedStateHandle.get<Int>(ROOT) ?: navController.graph.findStartDestination().id',
    );
    expect(graph).toMatch(
      /fun openDestination[\s\S]*popUpTo\(rootId\(navController\)\) \{ saveState = true \}/,
    );
    expect(graph).toContain('    if (!popped) startAt(navController, destinationRoute(id))');
    expect(graph).not.toContain('popUpTo(navController.graph.id)');
  });

  it("switches the player's tabs between its sheets on Android", () => {
    expect(graph).toContain('"queue" -> Route.Queue');
  });

  it("[M0.canvas] switches the player's tabs in place, with no transition between one tab and another", () => {
    expect(graph).toContain(
      [
        '        composable<Route.Queue>(',
        '            enterTransition = { if (isPlayerTab(initialState.destination)) EnterTransition.None else null },',
        '            exitTransition = { if (isPlayerTab(targetState.destination)) ExitTransition.None else null },',
        '        ) { PlayerTab(showing) { QueuePage(navController, actions) } }',
      ].join('\n'),
    );
    expect(graph).toContain(
      'private fun isPlayerTab(destination: NavDestination): Boolean =\n    destination.hasRoute<Route.Queue>()\n',
    );
    expect(graph).toContain('composable<Route.Album> { AlbumPage(navController, actions) }');
  });

  it('[M0.canvas] draws a player tab until NavHost composes the next, or while the sheet closes, so every frame shows one tab', () => {
    expect(graph).toContain(
      'private fun AnimatedVisibilityScope.PlayerTab(showing: State<NavBackStackEntry?>, page: @Composable () -> Unit) {',
    );
    expect(graph).toContain(
      '    if (transition.targetState == EnterExitState.Visible || now == null || !isPlayerTab(now.destination)) page()',
    );
    expect(graph).not.toContain('now.id == entry.id');
    expect(graph).toContain(
      'val showing = remember(navController) { mutableStateOf(navController.currentBackStackEntry) }',
    );
  });

  it('refuses a destination whose home takes a route parameter, which the bottom bar cannot give', () => {
    const bad = parseNav({
      ...nav,
      pages: [entry('music', '/music/:ref', { close: 'none', params: { ref: 'ItemRef' } })],
    });
    expect(() => generateKotlinNav(bad, new Set())).toThrow(/music.*parameter/);
  });
});
