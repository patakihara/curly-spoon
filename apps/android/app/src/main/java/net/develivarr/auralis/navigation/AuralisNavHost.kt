package net.develivarr.auralis.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.features.books.BooksScreen
import net.develivarr.auralis.features.downloads.DownloadsScreen
import net.develivarr.auralis.features.login.LoginScreen
import net.develivarr.auralis.features.home.ForYouScreen
import net.develivarr.auralis.features.onboarding.OnboardingScreen
import net.develivarr.auralis.features.music.AlbumDetailScreen
import net.develivarr.auralis.features.music.ArtistDetailScreen
import net.develivarr.auralis.features.music.FavoritesScreen
import net.develivarr.auralis.features.music.MusicLibraryScreen
import net.develivarr.auralis.features.music.PlaylistDetailScreen
import net.develivarr.auralis.features.music.PlaylistsScreen
import net.develivarr.auralis.features.player.LyricsScreen
import net.develivarr.auralis.features.player.PlayerViewModel
import net.develivarr.auralis.features.player.QueueScreen
import net.develivarr.auralis.features.musicrequests.MusicRequestsScreen
import net.develivarr.auralis.features.podcasts.PodcastDetailScreen
import net.develivarr.auralis.features.podcasts.PodcastsScreen
import net.develivarr.auralis.features.requests.RequestsScreen
import net.develivarr.auralis.features.search.UnifiedSearchScreen

/** Route name constants for [AuralisNavHost]'s graph. */
object Routes {
    const val ONBOARDING = "onboarding"
    const val LOGIN = "login"
    const val HOME = "home"

    /** Android wave 12a-A1 — the "Books" shell destination. Its own route, not shared with
     * [HOME]: two `ShellDestination`s pointing at one route would make active-item resolution
     * ambiguous (`shellDestinationFor` returns the first/longest match, and there could only
     * ever be one). Renders the same audiobook shelves as [HOME] for now, via
     * [net.develivarr.auralis.features.books.BooksScreen] — a real "For you" recommendation mix is a
     * later wave. */
    const val BOOKS = "books"
    const val REQUESTS = "requests"
    const val DOWNLOADS = "downloads"
    const val PODCASTS = "podcasts"
    const val MUSIC = "music"
    const val MUSIC_SEARCH = "music/search"
    const val MUSIC_FAVORITES = "music/favorites"
    const val MUSIC_PLAYLISTS = "music/playlists"
    const val MUSIC_REQUESTS = "music/requests"

    /** Android wave J — the synced lyrics view, reached from [net.develivarr.auralis.features.player
     * .MiniPlayerBar]'s "Lyrics" action. No argument: unlike every other detail route above,
     * this reads the currently-playing track straight off `PlayerViewModel.uiState` rather than
     * a nav argument — see [net.develivarr.auralis.features.player.LyricsScreen]'s own doc comment for
     * why. */
    const val LYRICS = "music/lyrics"

    /** Android wave 12f — the queue view, reached from [net.develivarr.auralis.features.player
     * .NowPlayingScreen]'s queue button. Same "no argument, reads live state off `PlayerViewModel`"
     * shape as [LYRICS] — see [net.develivarr.auralis.features.player.QueueScreen]'s own doc comment for
     * why: which queue to show is [net.develivarr.auralis.features.player.PlayerViewModel.currentContentTypeFlow],
     * not a nav argument. */
    const val QUEUE = "player/queue"

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

    /** Argument name within [PLAYLIST_DETAIL_PATTERN] — the Jellyfin playlist item's id. */
    const val PLAYLIST_DETAIL_ARG_PLAYLIST_ID = "playlistId"
    private const val PLAYLIST_DETAIL_PATTERN = "music/playlist/{$PLAYLIST_DETAIL_ARG_PLAYLIST_ID}"

    fun playlistDetailRoute(): String = PLAYLIST_DETAIL_PATTERN

    fun playlistDetail(playlistId: String): String = "music/playlist/$playlistId"
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
                    initializer {
                        PlayerViewModel(
                            appContext,
                            container.playbackItemResolver,
                            container.jellyfinPlaybackReportSender,
                        )
                    }
                },
        )
    when (val state = startViewModel.state.collectAsState().value) {
        is StartState.Loading -> LoadingScreen()
        is StartState.Ready -> {
            AuralisShell(
                navController = navController,
                playerViewModel = playerViewModel,
                imageLoader = container.imageLoader,
            ) { shellPadding ->
            NavHost(
                navController = navController,
                startDestination = state.destination,
                // The shell reserves its own bottom chrome (nav bar/rail + mini player) via
                // Scaffold's bottomBar slot, and hands that reservation back here as
                // [shellPadding] rather than clipping it itself — Scaffold's content slot is
                // *not* auto-clipped to the area above bottomBar, so a NavHost that ignored this
                // would let every screen render underneath the nav bar. Each individual screen
                // keeps its own inner Scaffold/topBar untouched; this padding only ever reserves
                // the bottom, since the shell's own Scaffold has no topBar of its own.
                modifier = Modifier.padding(shellPadding),
            ) {
                composable(Routes.ONBOARDING) { OnboardingScreen(container, navController) }
                composable(Routes.LOGIN) { LoginScreen(container, navController) }
                composable(Routes.HOME) { ForYouScreen(container, playerViewModel, navController) }
                composable(Routes.BOOKS) { BooksScreen(container, playerViewModel, navController) }
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
                composable(Routes.MUSIC_SEARCH) { UnifiedSearchScreen(container, navController) }
                composable(Routes.MUSIC_FAVORITES) { FavoritesScreen(container, navController, playerViewModel) }
                composable(Routes.MUSIC_PLAYLISTS) { PlaylistsScreen(container, navController) }
                composable(Routes.MUSIC_REQUESTS) { MusicRequestsScreen(container) }
                composable(Routes.LYRICS) { LyricsScreen(container, playerViewModel) }
                composable(Routes.QUEUE) { QueueScreen(playerViewModel) }
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
                    AlbumDetailScreen(container, playerViewModel, navController, albumId)
                }
                composable(
                    Routes.playlistDetailRoute(),
                    arguments =
                        listOf(navArgument(Routes.PLAYLIST_DETAIL_ARG_PLAYLIST_ID) { type = NavType.StringType }),
                ) { backStackEntry ->
                    val playlistId =
                        backStackEntry.arguments?.getString(Routes.PLAYLIST_DETAIL_ARG_PLAYLIST_ID)
                            ?: return@composable
                    PlaylistDetailScreen(container, playerViewModel, navController, playlistId)
                }
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
