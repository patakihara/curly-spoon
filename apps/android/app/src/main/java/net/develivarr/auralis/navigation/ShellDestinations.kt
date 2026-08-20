package net.develivarr.auralis.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.automirrored.filled.MenuBook
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
    // docs/design/screens/FOR_YOU.md §6.1 — "Home"/"For You"/"Browse"/"Discover" are one
    // destination under four names; Sofia picked "Browse" as the current UI-visible one. The
    // `explore` icon matches web's Icon.tsx FILLABLE_ICON_NAMES (`Shell.tsx:46`), so both
    // platforms independently arrived at the same glyph name for this destination.
    FOR_YOU(Routes.HOME, "Browse", Icons.Filled.Explore),
    MUSIC(Routes.MUSIC, "Music", Icons.Filled.LibraryMusic),
    BOOKS(Routes.BOOKS, "Books", Icons.AutoMirrored.Filled.MenuBook),
    PODCASTS(Routes.PODCASTS, "Podcasts", Icons.Filled.Podcasts),
    SEARCH(Routes.MUSIC_SEARCH, "Search", Icons.Filled.Search),
}

/**
 * Every route prefix that belongs to a [ShellDestination], paired with the destination it
 * resolves to. This is deliberately **not** just `ShellDestination.entries.map { it.route }`:
 * [Routes.PODCASTS] (the nav destination, plural — `"podcasts"`) and the podcast detail route
 * (singular — `"podcast/{itemId}"`, from [Routes.podcastDetailRoute]) are different words, not a
 * shared prefix, so a resolver built only from [ShellDestination.route] would never match a
 * podcast detail screen to [ShellDestination.PODCASTS] at all. Every other destination's nested
 * routes (`music/album/{id}`, `music/favorites`, etc.) genuinely do share their destination's own
 * route as a prefix, so they need no separate entry here.
 */
private val ADDITIONAL_ROUTE_PREFIXES: List<Pair<String, ShellDestination>> =
    listOf("podcast" to ShellDestination.PODCASTS)

/**
 * Resolves the shell destination active for [route] (typically
 * `navController.currentBackStackEntryAsState().value?.destination?.route`), or `null` when
 * [route] is outside all five destinations' subtrees (onboarding, login, requests, downloads,
 * a detail screen with no owning destination, or no route yet).
 *
 * Every nested detail route (`music/album/{id}`, `podcast/{itemId}`, etc.) belongs to whichever
 * destination's tab it was pushed from, so this matches by route *prefix*, not equality — using
 * [ShellDestination.route] plus [ADDITIONAL_ROUTE_PREFIXES] as the full set of prefixes. Matching
 * is longest-prefix-first, not [ShellDestination] declaration order: the one prefix collision in
 * the graph is [Routes.MUSIC] ("music") against [Routes.MUSIC_SEARCH] ("music/search"), and
 * longest-first is what keeps "music/search" resolving to Search instead of Music.
 */
fun shellDestinationFor(route: String?): ShellDestination? {
    if (route == null) return null
    val allPrefixes = ShellDestination.entries.map { it.route to it } + ADDITIONAL_ROUTE_PREFIXES
    return allPrefixes
        .sortedByDescending { (prefix, _) -> prefix.length }
        .firstOrNull { (prefix, _) -> route == prefix || route.startsWith("$prefix/") }
        ?.second
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

/**
 * Which upstreams the signed-in server has configured, mirroring
 * `apps/web/src/components/destinations.ts`'s `DestinationContext`. Every field defaults to
 * `false` so an instance built before any network call resolves reads exactly like "nothing is
 * configured yet" — the same default web's own `?? false` on each query gives — rather than
 * `null`/unknown needing a third state threaded through [visibleShellDestinations].
 */
data class DestinationAvailability(
    val jellyfinConfigured: Boolean = false,
    val audiobookshelfConfigured: Boolean = false,
    /** Whether `GET /libraries` returned at least one library with `mediaType == "book"`. */
    val hasBookLibrary: Boolean = false,
    /** Whether `GET /libraries` returned at least one library with `mediaType == "podcast"`. */
    val hasPodcastLibrary: Boolean = false,
)

/**
 * Which [ShellDestination]s are safe to show, mirroring web's `visibleDestinations` in
 * `apps/web/src/components/destinations.ts` — "never show a section that will only error".
 * [ShellDestination.FOR_YOU] and [ShellDestination.SEARCH] depend on no upstream and are always
 * present. [ShellDestination.MUSIC] needs Jellyfin configured. [ShellDestination.BOOKS] and
 * [ShellDestination.PODCASTS] need Audiobookshelf configured *and* a library of the matching
 * media type — a configured-but-library-less server would otherwise show a destination that
 * immediately 404s, the same reasoning web's own doc comment gives.
 *
 * This is the fix for wave 16d-A-2's finding: web already gated its five destinations this way,
 * and `AuralisShell` used to render [ShellDestination.entries] unfiltered.
 */
fun visibleShellDestinations(availability: DestinationAvailability): Set<ShellDestination> {
    val visible = mutableSetOf(ShellDestination.FOR_YOU, ShellDestination.SEARCH)
    if (availability.jellyfinConfigured) {
        visible += ShellDestination.MUSIC
    }
    if (availability.audiobookshelfConfigured && availability.hasBookLibrary) {
        visible += ShellDestination.BOOKS
    }
    if (availability.audiobookshelfConfigured && availability.hasPodcastLibrary) {
        visible += ShellDestination.PODCASTS
    }
    return visible
}
