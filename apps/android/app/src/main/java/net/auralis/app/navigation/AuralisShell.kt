package net.auralis.app.navigation

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.weight
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import net.auralis.app.features.player.MiniPlayerBar
import net.auralis.app.features.player.PlayerUiState
import net.auralis.app.features.player.PlayerViewModel

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
 */
@Composable
fun AuralisShell(
    navController: NavHostController,
    playerViewModel: PlayerViewModel,
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
            )
        }
    }

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
}
