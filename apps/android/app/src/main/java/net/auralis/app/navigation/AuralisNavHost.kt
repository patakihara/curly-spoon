package net.auralis.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import net.auralis.app.AppContainer
import net.auralis.app.features.downloads.DownloadsScreen
import net.auralis.app.features.login.LoginScreen
import net.auralis.app.features.home.HomeScreen
import net.auralis.app.features.onboarding.OnboardingScreen
import net.auralis.app.features.music.AlbumDetailScreen
import net.auralis.app.features.music.ArtistDetailScreen
import net.auralis.app.features.music.MusicLibraryScreen
import net.auralis.app.features.music.MusicSearchScreen
import net.auralis.app.features.player.PlayerViewModel
import net.auralis.app.features.podcasts.PodcastDetailScreen
import net.auralis.app.features.podcasts.PodcastsScreen
import net.auralis.app.features.requests.RequestsScreen

/** Route name constants for [AuralisNavHost]'s graph. */
object Routes {
    const val ONBOARDING = "onboarding"
    const val LOGIN = "login"
    const val HOME = "home"
    const val REQUESTS = "requests"
    const val DOWNLOADS = "downloads"
    const val PODCASTS = "podcasts"
    const val MUSIC = "music"
    const val MUSIC_SEARCH = "music/search"

    /** Argument name within [PODCAST_DETAIL_PATTERN] — the podcast library item's id. */
    const val PODCAST_DETAIL_ARG_ITEM_ID = "itemId"
    private const val PODCAST_DETAIL_PATTERN = "podcast/{$PODCAST_DETAIL_ARG_ITEM_ID}"

    /** Route pattern registered with [NavHost]. */
    fun podcastDetailRoute(): String = PODCAST_DETAIL_PATTERN

    /** The concrete route to `navController.navigate(...)` for one podcast's detail screen. */
    fun podcastDetail(itemId: String): String = "podcast/$itemId"

    /** Argument name within [MUSIC_ARTIST_DETAIL_PATTERN] — the Jellyfin artist item's id. */
    const val MUSIC_ARTIST_DETAIL_ARG_ARTIST_ID = "artistId"
    private const val MUSIC_ARTIST_DETAIL_PATTERN = "music/artist/{$MUSIC_ARTIST_DETAIL_ARG_ARTIST_ID}"

    fun musicArtistDetailRoute(): String = MUSIC_ARTIST_DETAIL_PATTERN

    fun musicArtistDetail(artistId: String): String = "music/artist/$artistId"

    /** Argument name within [MUSIC_ALBUM_DETAIL_PATTERN] — the Jellyfin album item's id. */
    const val MUSIC_ALBUM_DETAIL_ARG_ALBUM_ID = "albumId"
    private const val MUSIC_ALBUM_DETAIL_PATTERN = "music/album/{$MUSIC_ALBUM_DETAIL_ARG_ALBUM_ID}"

    fun musicAlbumDetailRoute(): String = MUSIC_ALBUM_DETAIL_PATTERN

    fun musicAlbumDetail(albumId: String): String = "music/album/$albumId"
}

/**
 * The app's single nav graph: onboarding → login → home. [AppStartViewModel] decides the
 * start destination; until it has, [LoadingScreen] is shown instead of the graph so nothing
 * flashes the wrong first screen.
 */
@Composable
fun AuralisNavHost(
    container: AppContainer,
    navController: NavHostController = rememberNavController(),
) {
    val startViewModel: AppStartViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { AppStartViewModel(container.serverConfigRepository, container.apiClient) }
                },
        )
    // Constructed once at the nav host's own scope — not per-screen — so the MediaController
    // connection it owns survives navigating away from and back to Home rather than being torn
    // down and rebuilt. `initializer` blocks run outside composition, so the Context has to be
    // read here, during composition, and captured by the closure below. `applicationContext`
    // rather than the raw `LocalContext.current`: this ViewModel's ViewModelStore is retained
    // across configuration changes by the hosting Activity, so a raw Activity Context captured
    // once would go stale (pointing at a destroyed Activity) after the first rotation.
    val appContext = LocalContext.current.applicationContext
    val playerViewModel: PlayerViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { PlayerViewModel(appContext, container.playbackItemResolver) }
                },
        )
    when (val state = startViewModel.state.collectAsState().value) {
        is StartState.Loading -> LoadingScreen()
        is StartState.Ready -> {
            NavHost(navController = navController, startDestination = state.destination) {
                composable(Routes.ONBOARDING) { OnboardingScreen(container, navController) }
                composable(Routes.LOGIN) { LoginScreen(container, navController) }
                composable(Routes.HOME) { HomeScreen(container, playerViewModel, navController) }
                composable(Routes.REQUESTS) { RequestsScreen(container) }
                composable(Routes.DOWNLOADS) { DownloadsScreen(container) }
                composable(Routes.PODCASTS) { PodcastsScreen(container, navController) }
                composable(
                    Routes.podcastDetailRoute(),
                    arguments = listOf(navArgument(Routes.PODCAST_DETAIL_ARG_ITEM_ID) { type = NavType.StringType }),
                ) { backStackEntry ->
                    val itemId =
                        backStackEntry.arguments?.getString(Routes.PODCAST_DETAIL_ARG_ITEM_ID)
                            ?: return@composable
                    PodcastDetailScreen(container, playerViewModel, itemId)
                }
                composable(Routes.MUSIC) { MusicLibraryScreen(container, navController) }
                composable(Routes.MUSIC_SEARCH) { MusicSearchScreen(container, navController) }
                composable(
                    Routes.musicArtistDetailRoute(),
                    arguments =
                        listOf(navArgument(Routes.MUSIC_ARTIST_DETAIL_ARG_ARTIST_ID) { type = NavType.StringType }),
                ) { backStackEntry ->
                    val artistId =
                        backStackEntry.arguments?.getString(Routes.MUSIC_ARTIST_DETAIL_ARG_ARTIST_ID)
                            ?: return@composable
                    ArtistDetailScreen(container, navController, artistId)
                }
                composable(
                    Routes.musicAlbumDetailRoute(),
                    arguments =
                        listOf(navArgument(Routes.MUSIC_ALBUM_DETAIL_ARG_ALBUM_ID) { type = NavType.StringType }),
                ) { backStackEntry ->
                    val albumId =
                        backStackEntry.arguments?.getString(Routes.MUSIC_ALBUM_DETAIL_ARG_ALBUM_ID)
                            ?: return@composable
                    AlbumDetailScreen(container, playerViewModel, albumId)
                }
            }
        }
    }
}

@Composable
private fun LoadingScreen() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}
