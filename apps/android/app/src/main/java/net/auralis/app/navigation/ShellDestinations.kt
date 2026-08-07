package net.auralis.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material.icons.filled.Search
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * The five persistent nav destinations from `docs/ROADMAP.md` §12a. Declared in bottom-bar
 * order — a `NavigationBar` rendered by iterating [entries] puts Search last, matching the
 * spec ("in the nav bar, Search sits far right"); [AuralisShell]'s rail rendering reorders
 * Search to the front itself, per the spec's "in the rail, Search sits at the top" — that is
 * a rendering-order choice, not a property of this enum, so it isn't encoded here.
 */
enum class ShellDestination(val route: String, val label: String, val icon: ImageVector) {
    FOR_YOU(Routes.HOME, "For you", Icons.Filled.Home),
    MUSIC(Routes.MUSIC, "Music", Icons.Filled.LibraryMusic),
    BOOKS(Routes.BOOKS, "Books", Icons.Filled.MenuBook),
    PODCASTS(Routes.PODCASTS, "Podcasts", Icons.Filled.Podcasts),
    SEARCH(Routes.MUSIC_SEARCH, "Search", Icons.Filled.Search),
}

/**
 * Resolves the shell destination active for [route] (typically
 * `navController.currentBackStackEntryAsState().value?.destination?.route`), or `null` when
 * [route] is outside all five destinations' subtrees (onboarding, login, requests, downloads,
 * a detail screen with no owning destination, or no route yet).
 *
 * Every nested detail route (`music/album/{id}`, `podcast/{itemId}`, etc.) belongs to whichever
 * destination's tab it was pushed from, so this matches by route *prefix*, not equality. The
 * one prefix collision in the graph is [Routes.MUSIC] ("music") against [Routes.MUSIC_SEARCH]
 * ("music/search") — matching destinations longest-route-first, rather than in [ShellDestination]
 * declaration order, is what keeps "music/search" resolving to Search instead of Music.
 */
fun shellDestinationFor(route: String?): ShellDestination? {
    if (route == null) return null
    return ShellDestination.entries
        .sortedByDescending { it.route.length }
        .firstOrNull { destination ->
            route == destination.route || route.startsWith("${destination.route}/")
        }
}

/**
 * Whether the shell's nav chrome (bar/rail + mini player) should render for [route]. False for
 * the two signed-out screens — a user who hasn't finished onboarding or logged in has nowhere
 * the five destinations lead yet, and showing them would imply otherwise. True for every other
 * route, including `null` (no route resolved yet, e.g. the first frame before the nav graph's
 * start destination is known): the shell has a definite opinion only about the two screens it
 * hides for, not about "unknown", and hiding by default would flash the chrome away on every
 * signed-in cold start.
 */
fun shouldShowShell(route: String?): Boolean = route != Routes.ONBOARDING && route != Routes.LOGIN
