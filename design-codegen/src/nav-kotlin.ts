/**
 * nav.json as the Android app's Navigation-Compose graph, `generated/nav/AuralisNavGraph.kt`: a
 * typed route per Android page, the NavHost drawing each page's generated `<Id>Page`, and the
 * back behaviour nav.json states. The close control and Android's back return to the page's
 * opener, or, with nothing under it, to the home of the destination it lights. The bottom bar
 * keeps a stack per destination, and the player's tabs switch between its sheets.
 */
import { componentName, splitRoute, type Nav, type NavPage } from './nav.js';
import { APP_NOTE, KOTLIN_NAV_PACKAGE, KOTLIN_PAGES_PACKAGE } from './outputs.js';
import { PLAYER_TABS } from './shell.js';

/** The pages the Android app has, in nav.json's order. */
export const androidPages = (nav: Nav): NavPage[] =>
  nav.pages.filter((p) => p.platforms.includes('android'));

/** A page's route arguments: its path parameters, required, then its query names, optional. */
function routeArgs(page: NavPage): { name: string; required: boolean }[] {
  return [
    ...Object.keys(page.params).map((name) => ({ name, required: true })),
    ...splitRoute(page.route).query.map((name) => ({ name, required: false })),
  ];
}

/** Kotlin's string literal for `value`, `$` escaped so it never interpolates. */
export const kotlinString = (value: string) => JSON.stringify(value).replace(/\$/g, '\\$');

/** A typed route to `page` with `args` bound: `Route.Album(ref = "…")`, or `Route.Browse`. */
export function routeCall(page: NavPage, args: Record<string, string> = {}): string {
  const name = `Route.${componentName(page.id)}`;
  if (routeArgs(page).length === 0) return name;
  const given = routeArgs(page)
    .filter((a) => args[a.name] !== undefined)
    .map((a) => `${a.name} = ${kotlinString(args[a.name]!)}`);
  return `${name}(${given.join(', ')})`;
}

function routeDecl(page: NavPage): string {
  const name = componentName(page.id);
  const args = routeArgs(page);
  if (args.length === 0) return `    @Serializable data object ${name} : Route`;
  const fields = args.map((a) =>
    a.required ? `val ${a.name}: String` : `val ${a.name}: String? = null`,
  );
  return `    @Serializable data class ${name}(${fields.join(', ')}) : Route`;
}

/** The ids of the pages a generated graph draws, from its `composable<Route.X>` entries. */
export function graphDestinations(graph: string): string[] {
  return [...graph.matchAll(/composable<Route\.([A-Za-z0-9]+)>/g)].map(
    (m) => m[1]![0]!.toLowerCase() + m[1]!.slice(1),
  );
}

/** `AuralisNavGraph.kt`. A page not yet drawn gets a destination with nothing in it. */
export function generateKotlinNav(nav: Nav, drawn: Set<string>): string {
  const pages = androidPages(nav);
  const errors: string[] = [];
  const homes = nav.destinations.map((d) => {
    const page = pages.find((p) => p.id === d.id);
    if (page === undefined) errors.push(`${d.id}: a destination with no Android page`);
    else if (Object.keys(page.params).length > 0)
      errors.push(
        `${d.id}: a destination's home takes no route parameter, the bottom bar gives none`,
      );
    return page;
  });
  if (errors.length > 0) throw new Error(`nav.json, for Android:\n  ${errors.join('\n  ')}`);
  const tabs = Object.entries(PLAYER_TABS).flatMap(([id, tab]) => {
    const page = pages.find((p) => p.id === id);
    return page === undefined ? [] : [[tab, page] as const];
  });
  const painted = pages.filter((p) => drawn.has(p.id));
  return [
    `// ${APP_NOTE}`,
    `package ${KOTLIN_NAV_PACKAGE}`,
    '',
    'import androidx.compose.runtime.Composable',
    'import androidx.navigation.NavController',
    'import androidx.navigation.NavGraph.Companion.findStartDestination',
    'import androidx.navigation.NavHostController',
    'import androidx.navigation.compose.NavHost',
    'import androidx.navigation.compose.composable',
    'import kotlinx.serialization.Serializable',
    ...painted.map((p) => `import ${KOTLIN_PAGES_PACKAGE}.${componentName(p.id)}Page`).sort(),
    '',
    "/** Each of nav.json's Android pages as a typed route: path parameters required, query names optional. */",
    'sealed interface Route {',
    ...pages.map(routeDecl),
    '}',
    '',
    '/** The queue an item plays on: spoken word (books and episodes) or music. */',
    'enum class PlayQueue { SPOKEN, MUSIC }',
    '',
    '/** How an item plays: now, next, or as a list on its own, leaving the queue as it is. */',
    'enum class PlayMode { NOW, NEXT, SOURCE }',
    '',
    "/** What a page's handlers do beyond navigating, which the app supplies. */",
    'class PageActions(',
    '    val onPlay: (ref: String, queue: PlayQueue, mode: PlayMode) -> Unit,',
    '    val onRequest: (ref: String) -> Unit,',
    '    val onSignIn: () -> Unit,',
    ')',
    '',
    '/** Every Android page of nav.json, each drawn by its generated page. */',
    '@Composable',
    'fun AuralisNavGraph(navController: NavHostController, start: Route, actions: PageActions) {',
    '    NavHost(navController = navController, startDestination = start) {',
    ...pages.map((p) =>
      drawn.has(p.id)
        ? `        composable<Route.${componentName(p.id)}> { ${componentName(p.id)}Page(navController, actions) }`
        : `        composable<Route.${componentName(p.id)}> {}`,
    ),
    '    }',
    '}',
    '',
    '/**',
    " * A page's close control, and Android's back on a page that closes: back to whatever opened it,",
    ' * or, with nothing under it, to [home], the home of the destination it lights.',
    ' */',
    'fun closePage(navController: NavController, home: Route) {',
    '    if (navController.previousBackStackEntry != null) navController.popBackStack()',
    '    else navController.navigate(home) { popUpTo(navController.graph.id) { inclusive = true } }',
    '}',
    '',
    '/** A destination from the bottom bar: each keeps its own stack, left and resumed as it was. */',
    'fun openDestination(navController: NavController, id: String) {',
    '    navController.navigate(destinationRoute(id)) {',
    '        popUpTo(navController.graph.findStartDestination().id) { saveState = true }',
    '        launchSingleTop = true',
    '        restoreState = true',
    '    }',
    '}',
    '',
    '/** The home of the destination `id` names. */',
    'fun destinationRoute(id: String): Route = when (id) {',
    ...homes.map((p) => `    ${kotlinString(p!.id)} -> ${routeCall(p!)}`),
    '    else -> throw IllegalArgumentException("$id is not a destination")',
    '}',
    '',
    "/** One of the player's tabs, the sheet showing it in place of the one showing now. */",
    'fun openTab(navController: NavController, tab: String) {',
    '    val route: Route = when (tab) {',
    ...tabs.map(([tab, p]) => `        ${kotlinString(tab)} -> ${routeCall(p)}`),
    '        else -> throw IllegalArgumentException("$tab is not a tab of the player")',
    '    }',
    '    navController.navigate(route) {',
    '        navController.currentDestination?.let { popUpTo(it.id) { inclusive = true } }',
    '        launchSingleTop = true',
    '    }',
    '}',
    '',
  ].join('\n');
}
