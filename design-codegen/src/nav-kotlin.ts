/**
 * nav.json as the Android app's Navigation-Compose graph, `generated/nav/AuralisNavGraph.kt`: a
 * typed route per Android page, the NavHost drawing each page's generated `<Id>Page`, and the
 * back behaviour nav.json states. The close control and Android's back return to the page's
 * opener, or, with nothing under it, to the home of the destination it lights. The bottom bar
 * keeps a stack per destination and lights the one that opened the page, the lit one tapped again
 * goes to its home, and the player's tabs switch between its sheets in place, with no transition.
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
  const tabIds = new Set(tabs.map(([, p]) => p.id));
  /** A page's NavHost entry: a player tab switches to and from another with no transition. */
  const destination = (p: NavPage) => {
    const route = `Route.${componentName(p.id)}`;
    const page = `${componentName(p.id)}Page(navController, actions)`;
    if (!tabIds.has(p.id))
      return `        composable<${route}>${drawn.has(p.id) ? ` { ${page} }` : ' {}'}`;
    const content = drawn.has(p.id) ? ` { PlayerTab(showing) { ${page} } }` : ' {}';
    return [
      `        composable<${route}>(`,
      '            enterTransition = { if (isPlayerTab(initialState.destination)) EnterTransition.None else null },',
      '            exitTransition = { if (isPlayerTab(targetState.destination)) ExitTransition.None else null },',
      `        )${content}`,
    ].join('\n');
  };
  const isTab = tabs.map(([, p]) => `destination.hasRoute<Route.${componentName(p.id)}>()`);
  return [
    `// ${APP_NOTE}`,
    `package ${KOTLIN_NAV_PACKAGE}`,
    '',
    'import androidx.compose.animation.AnimatedVisibilityScope',
    'import androidx.compose.animation.EnterExitState',
    'import androidx.compose.animation.EnterTransition',
    'import androidx.compose.animation.ExitTransition',
    'import androidx.compose.animation.ExperimentalAnimationApi',
    'import androidx.compose.runtime.Composable',
    'import androidx.compose.runtime.DisposableEffect',
    'import androidx.compose.runtime.State',
    'import androidx.compose.runtime.mutableStateOf',
    'import androidx.compose.runtime.remember',
    'import androidx.lifecycle.Lifecycle',
    'import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner',
    'import androidx.navigation.NavBackStackEntry',
    'import androidx.navigation.NavController',
    'import androidx.navigation.NavDestination',
    'import androidx.navigation.NavDestination.Companion.hasRoute',
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
    '    val onSignIn: () -> Unit,',
    ')',
    '',
    '/**',
    ' * Every Android page of nav.json, each drawn by its generated page, each deciding as it arrives',
    ' * the destination it lights.',
    ' */',
    '@Composable',
    'fun AuralisNavGraph(navController: NavHostController, start: Route, actions: PageActions) {',
    '    val showing = remember(navController) { mutableStateOf(navController.currentBackStackEntry) }',
    '    DisposableEffect(navController) {',
    '        val listener = NavController.OnDestinationChangedListener { controller, _, _ ->',
    '            arrive(controller)',
    '            showing.value = controller.currentBackStackEntry',
    '        }',
    '        navController.addOnDestinationChangedListener(listener)',
    '        onDispose { navController.removeOnDestinationChangedListener(listener) }',
    '    }',
    '    NavHost(navController = navController, startDestination = start) {',
    ...pages.map(destination),
    '    }',
    '}',
    '',
    '/** Where a back stack entry keeps the destination it lights, kept with its saved stack. */',
    'private const val LIT = "lit"',
    '',
    '/**',
    " * The page showing decides, once as it arrives, the destination it lights: a destination's home",
    " * itself, any other page the one lit under it, its opener's, and with nothing under it the one",
    ' * it lights itself. A page no stack keeps, lighting none, so lights the destination in use.',
    ' */',
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
    '',
    'private fun litOf(entry: NavBackStackEntry): String? = entry.savedStateHandle.get<String>(LIT)',
    '',
    '/**',
    ' * The destination the bottom bar lights on the page drawing it, the one its own entry arrived',
    ' * on, or, with nothing deciding it, [fallback], the one the page lights. A page leaving as',
    " * another arrives keeps its own, never the arriving page's.",
    ' */',
    '@Composable',
    'fun litDestination(fallback: String): String =',
    '    (LocalViewModelStoreOwner.current as? NavBackStackEntry)?.let(::litOf) ?: fallback',
    '',
    '/** Where the graph keeps the destination at the bottom of its stack, once a page leaves for a home. */',
    'private const val ROOT = "root"',
    '',
    '/** The graph, kept on the back stack under every page. */',
    'private fun graphEntry(navController: NavController): NavBackStackEntry =',
    '    navController.getBackStackEntry(navController.graph.id)',
    '',
    '/** The destination at the bottom of the stack: the start one, or the home that replaced it. */',
    'private fun rootId(navController: NavController): Int =',
    '    graphEntry(navController).savedStateHandle.get<Int>(ROOT) ?: navController.graph.findStartDestination().id',
    '',
    '/** [home] alone on the stack, at its bottom from now on, in place of everything under it. */',
    'private fun startAt(navController: NavController, home: Route) {',
    '    navController.navigate(home) { popUpTo(rootId(navController)) { inclusive = true } }',
    '    graphEntry(navController).savedStateHandle[ROOT] = navController.currentDestination?.id ?: return',
    '}',
    '',
    '/**',
    " * A page's close control, and Android's back on a page that closes: back to whatever opened it,",
    ' * or, with nothing under it, to [home], the home of the destination it lights.',
    ' */',
    'fun closePage(navController: NavController, home: Route) {',
    '    if (navController.previousBackStackEntry != null) navController.popBackStack()',
    '    else startAt(navController, home)',
    '}',
    '',
    '/**',
    ' * A destination from the bottom bar: the lit one goes to its home from any of its pages, and',
    ' * another opens on its own stack, left and resumed as it was.',
    ' */',
    'fun openDestination(navController: NavController, id: String) {',
    '    if (navController.currentBackStackEntry?.let(::litOf) == id) return goHome(navController, id)',
    '    navController.navigate(destinationRoute(id)) {',
    '        popUpTo(rootId(navController)) { saveState = true }',
    '        launchSingleTop = true',
    '        restoreState = true',
    '    }',
    '}',
    '',
    '/** The home of destination `id`, back down its stack, or, with it not on the stack, alone. */',
    'private fun goHome(navController: NavController, id: String) {',
    '    if (homeOf(navController.currentBackStackEntry?.destination ?: return) == id) return',
    '    val popped = when (id) {',
    ...homes.map(
      (p) =>
        `        ${kotlinString(p!.id)} -> navController.popBackStack<Route.${componentName(p!.id)}>(inclusive = false)`,
    ),
    '        else -> throw IllegalArgumentException("$id is not a destination")',
    '    }',
    '    if (!popped) startAt(navController, destinationRoute(id))',
    '}',
    '',
    '/** The destination the page [destination] draws lights, or null for a page that lights none. */',
    'fun lights(destination: NavDestination): String? = when {',
    ...pages
      .filter((p) => p.lights !== null)
      .map(
        (p) =>
          `    destination.hasRoute<Route.${componentName(p.id)}>() -> ${kotlinString(p.lights!)}`,
      ),
    '    else -> null',
    '}',
    '',
    '/** The destination whose home [destination] is, or null for a page that is no home. */',
    'fun homeOf(destination: NavDestination): String? = when {',
    ...homes.map(
      (p) => `    destination.hasRoute<Route.${componentName(p!.id)}>() -> ${kotlinString(p!.id)}`,
    ),
    '    else -> null',
    '}',
    '',
    '/** The home of the destination `id` names. */',
    'fun destinationRoute(id: String): Route = when (id) {',
    ...homes.map((p) => `    ${kotlinString(p!.id)} -> ${routeCall(p!)}`),
    '    else -> throw IllegalArgumentException("$id is not a destination")',
    '}',
    '',
    '/**',
    " * A player tab's page, drawn while NavHost holds it as the entry arriving or settled, or while the",
    ' * page showing is no tab, as the sheet closes. The leaving tab learns it is leaving in the very',
    ' * composition NavHost first draws the next, so every frame of a switch shows exactly one tab.',
    ' */',
    '@OptIn(ExperimentalAnimationApi::class)',
    '@Composable',
    'private fun AnimatedVisibilityScope.PlayerTab(showing: State<NavBackStackEntry?>, page: @Composable () -> Unit) {',
    '    val now = showing.value',
    '    if (transition.targetState == EnterExitState.Visible || now == null || !isPlayerTab(now.destination)) page()',
    '}',
    '',
    "/** Whether [destination] is one of the player's tabs, which switch in place. */",
    'private fun isPlayerTab(destination: NavDestination): Boolean =',
    `    ${isTab.length === 0 ? 'false' : isTab.join(' ||\n        ')}`,
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
