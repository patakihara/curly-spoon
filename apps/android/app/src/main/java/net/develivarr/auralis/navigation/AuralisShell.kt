package net.develivarr.auralis.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import coil.ImageLoader
import net.develivarr.auralis.features.player.MiniPlayerBar
import net.develivarr.auralis.features.player.NowPlayingScreen
import net.develivarr.auralis.features.player.PlayerUiState
import net.develivarr.auralis.features.player.PlayerViewModel

/**
 * The width, in dp, at or above which [AuralisShell] renders a side [NavigationRail] instead of
 * a bottom [NavigationBar]. `androidx.compose.material3.windowsizeclass` — the "real" way to make
 * this call — is not a dependency of this module (checked `gradle/libs.versions.toml` before
 * writing this: only plain `material3` is present), and this wave does not add one; adding a new
 * dependency belongs with a decision to use its whole API, not a single breakpoint constant. 600dp
 * is Material's own documented compact/medium window-size-class boundary, so [BoxWithConstraints]
 * against this constant reproduces that boundary without the extra artifact.
 */
private val RAIL_BREAKPOINT = 600.dp

/**
 * The persistent navigation shell (`docs/ROADMAP.md` §12a, wave 12a-A1): five destinations
 * (For you, Music, Books, Podcasts, Search) in a bottom [NavigationBar] on narrow windows or a
 * side [NavigationRail] on windows at least [RAIL_BREAKPOINT] wide, plus one persistent
 * [MiniPlayerBar] that survives navigating between them — replacing [MiniPlayerBar] being wired
 * into `HomeScreen` alone, which made it (and the nav bar itself) vanish on every other screen.
 *
 * Hidden entirely — [content] renders with no extra chrome or padding — on [Routes.ONBOARDING]
 * and [Routes.LOGIN], per [shouldShowShell]: a signed-out user has nowhere the five destinations
 * lead yet.
 *
 * [content] is the call site's [androidx.navigation.compose.NavHost]; its lambda receives the
 * [PaddingValues] a screen's own `Scaffold` should treat as outer insets, exactly as a bare
 * `Scaffold`'s content slot would — a screen underneath keeps its own `topBar` and internal
 * `Scaffold`, this shell only owns the bottom chrome (nav bar/rail + mini player).
 *
 * Also owns the expanded [NowPlayingScreen] surface (Android wave 12a-A2), hoisted here rather
 * than as a route on [AuralisNavHost]: it has to render *over* the nav bar/rail as well as the
 * content slot, and a route would only ever reach the content slot, leaving the nav chrome
 * visible underneath it — wrong for a surface `docs/DESIGN.md` calls a full-screen sheet.
 * Rendered as an [AnimatedVisibility] `Box` overlay sized to this whole composable rather than a
 * `ModalBottomSheet`: a bottom sheet's own scrim/drag-handle chrome doesn't match "full-screen
 * sheet" either, and a plain overlay is the simplest thing that can cover both the rail and
 * bottom-bar branches below with one piece of state. `spring(dampingRatio = 0.9f, stiffness =
 * 300f)` on the fade matches `docs/DESIGN.md`'s own `spring.slow` token (300/0.9), documented
 * there as "Sheets, Now Playing expansion" — this project has no shared spring-token constants
 * for Compose (the web client's own token layer is CSS-only), so the numbers are inlined here
 * rather than invented fresh.
 *
 * **Wave 16d-A (2026-08-17) checked this shell against web's reported scroll bug** — the nav
 * rail and Now Playing sidebar scrolling away with the main content, `docs/HANDOVER.md`'s
 * "READ FIRST" section — and found no Android equivalent. The chrome here is pinned by
 * construction, not merely by styling that happens to hold today: the nav bar/rail and
 * [miniPlayer] are either a direct, unscrolled sibling in the wide-window [Row] (the rail) or
 * live in [Scaffold]'s own `bottomBar` slot (both branches below), never an item inside a
 * scrolling container. [content] only ever receives the *content* slot — it has no reference to
 * the chrome at all, so a screen cannot reintroduce this even by accident, unlike web where the
 * chrome and the content shared one scrolling document. Confirmed by grepping every screen under
 * `features/`: zero declare their own `bottomBar`, zero use `verticalScroll`, and zero use
 * `ScrollBehavior` — so there is not even a *collapsing* top bar to mistake for this bug; every
 * screen's own `TopAppBar` is a plain, always-visible one.
 */
@Composable
fun AuralisShell(
    navController: NavHostController,
    playerViewModel: PlayerViewModel,
    imageLoader: ImageLoader,
    content: @Composable (PaddingValues) -> Unit,
) {
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    if (!shouldShowShell(currentRoute)) {
        content(PaddingValues())
        return
    }

    val activeDestination = shellDestinationFor(currentRoute)
    val playerUiState by playerViewModel.uiState.collectAsState()
    val playingState = playerUiState as? PlayerUiState.Playing

    // rememberSaveable so rotating the device (a config change) doesn't silently collapse an
    // open Now Playing surface. Forced back to false the moment playback stops (below): once
    // playingState is null there is nothing left to show, and leaving this true would leave a
    // stale expanded surface with no state to render the next time something plays.
    var isNowPlayingExpanded by rememberSaveable { mutableStateOf(false) }
    if (playingState == null && isNowPlayingExpanded) {
        isNowPlayingExpanded = false
    }

    // Collapses Now Playing on back rather than letting the press fall through to the nav
    // host underneath (which would navigate away, or exit the app) — this is what makes the
    // expanded surface feel like a real screen instead of a stuck overlay. Only enabled while
    // actually expanded, so back behaves completely normally the rest of the time.
    BackHandler(enabled = isNowPlayingExpanded) { isNowPlayingExpanded = false }

    // launchSingleTop avoids stacking a second copy of a destination already at the top of the
    // back stack; popUpTo(Routes.HOME) { saveState = true } + restoreState clears everything
    // above the start destination and restores each tab's own scroll/nav state on return, so
    // switching tabs behaves like Android's own bottom-nav convention rather than pushing a new
    // screen every tap. Re-tapping the already-active destination is skipped entirely below —
    // navigating to the route already at the top would still be a no-op-ish re-navigation, but
    // skipping it avoids even that redundant back-stack operation.
    fun navigateTo(destination: ShellDestination) {
        if (destination == activeDestination) return
        navController.navigate(destination.route) {
            launchSingleTop = true
            popUpTo(Routes.HOME) { saveState = true }
            restoreState = true
        }
    }

    val miniPlayer: @Composable () -> Unit = {
        playingState?.let { state ->
            MiniPlayerBar(
                state = state,
                onTogglePlayPause = playerViewModel::togglePlayPause,
                onToggleShuffle = playerViewModel::toggleShuffle,
                onCycleRepeat = playerViewModel::cycleRepeatMode,
                onOpenLyrics = { navController.navigate(Routes.LYRICS) },
                onExpand = { isNowPlayingExpanded = true },
            )
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val isWide = maxWidth >= RAIL_BREAKPOINT
            if (isWide) {
                Row(modifier = Modifier.fillMaxSize()) {
                    NavigationRail {
                        // The spec's rail ordering: Search at the top, then the remaining four in
                        // their usual order — the opposite of the bottom bar, which puts Search last.
                        // This is purely a rendering-order choice for this composable; ShellDestination
                        // itself stays declared in bottom-bar order.
                        val railOrder =
                            listOf(ShellDestination.SEARCH) +
                                ShellDestination.entries.filter { it != ShellDestination.SEARCH }
                        railOrder.forEach { destination ->
                            NavigationRailItem(
                                selected = destination == activeDestination,
                                onClick = { navigateTo(destination) },
                                icon = { Icon(destination.icon, contentDescription = destination.label) },
                                label = { Text(destination.label) },
                            )
                        }
                    }
                    Scaffold(
                        modifier = Modifier.weight(1f),
                        bottomBar = miniPlayer,
                    ) { innerPadding -> content(innerPadding) }
                }
            } else {
                Scaffold(
                    bottomBar = {
                        Column {
                            miniPlayer()
                            NavigationBar {
                                ShellDestination.entries.forEach { destination ->
                                    NavigationBarItem(
                                        selected = destination == activeDestination,
                                        onClick = { navigateTo(destination) },
                                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                                        label = { Text(destination.label) },
                                    )
                                }
                            }
                        }
                    },
                ) { innerPadding -> content(innerPadding) }
            }
        }

        AnimatedVisibility(
            visible = isNowPlayingExpanded && playingState != null,
            enter = fadeIn(animationSpec = spring(dampingRatio = 0.9f, stiffness = 300f)),
            exit = fadeOut(animationSpec = spring(dampingRatio = 0.9f, stiffness = 300f)),
        ) {
            playingState?.let { state ->
                NowPlayingScreen(
                    state = state,
                    playerViewModel = playerViewModel,
                    imageLoader = imageLoader,
                    onDismiss = { isNowPlayingExpanded = false },
                    onOpenQueue = { navController.navigate(Routes.QUEUE) },
                )
            }
        }
    }
}
