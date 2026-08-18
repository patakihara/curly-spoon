package net.develivarr.auralis.features.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.features.player.PlayerViewModel
import net.develivarr.auralis.navigation.Routes

/**
 * "For you" (docs/ROADMAP.md §12d) — the shell's first destination, mounted at [Routes.HOME].
 * The Android port of `apps/web/src/features/home/HomePage.tsx`: a content-type filter chip
 * row, a two-column quick-picks grid, and — below that — nothing but uniform
 * [ForYouCarouselRow]s, all at exactly one card geometry. See [ForYouCard] for why there is
 * only one card composable, and [ForYouViewModel] for the three-source fan-out (Audiobookshelf
 * books, Audiobookshelf podcasts, Jellyfin favourite albums) that feeds it.
 *
 * **Replaces [net.develivarr.auralis.features.home.HomeScreen] at this route.** It also inherits that
 * screen's "Downloads"/"Requests" top-bar text actions — carried forward deliberately rather
 * than dropped, since [Routes.DOWNLOADS]/[Routes.REQUESTS] had no other entry point anywhere in
 * the app's navigation graph; dropping them would have stranded two already-shipped screens
 * with no way to reach them. [net.develivarr.auralis.features.home.HomeShelvesContent] and
 * [net.develivarr.auralis.features.home.HomeViewModel] are unaffected — both stay in use by
 * [net.develivarr.auralis.features.books.BooksScreen], which this wave does not touch.
 *
 * **Card taps**: a podcast card starts it playing via [playerViewModel], exactly as
 * [net.develivarr.auralis.features.home.HomeShelvesContent] does today. A music album card navigates
 * to [Routes.musicAlbumDetail]. **A book card navigates to [Routes.bookDetail]** (Android wave
 * 16e-book-A) — playing directly used to be every book tap's only behaviour anywhere in the app;
 * see `docs/design/screens/BOOK_DETAIL.md` for why that changed and `BookDetailScreen`'s own
 * Play/Resume button for where immediate playback still lives.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForYouScreen(
    container: AppContainer,
    playerViewModel: PlayerViewModel,
    navController: NavHostController,
) {
    val viewModel: ForYouViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        ForYouViewModel(container.apiClient, container.serverConfigRepository)
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    fun onSelect(item: FeedItem) {
        when (item.contentType) {
            // Android wave 16e-book-A: a book card now opens the book detail screen rather than
            // playing immediately — see docs/design/screens/BOOK_DETAIL.md §5. Podcasts are
            // unchanged and out of this wave's scope; they still play directly from here.
            //
            // Wave 15d-1-books: an EXTERNAL book (item.isExternal — a recommendation from an
            // outside provider the signed-in user does not own) goes to the book request flow
            // instead, pre-filled with its title/author, never to Routes.bookDetail — that id is
            // opaque and namespaced (external:openlibrary:…) and Audiobookshelf has never heard
            // of it, so BookDetailViewModel's fetch would fail and render a bare error screen
            // (the dead end this wave exists to close). Mirrors
            // net.develivarr.auralis.features.music.MusicLibraryScreen's identical `isExternal`
            // branch for the music equivalent (wave 15d-1-A). An owned book's behaviour is
            // completely unchanged.
            ForYouContentType.BOOKS ->
                if (item.isExternal) {
                    navController.navigate(Routes.requests(title = item.title, author = item.subtitle))
                } else {
                    navController.navigate(Routes.bookDetail(item.id))
                }
            ForYouContentType.PODCASTS -> playerViewModel.playItem(item.id)
            ForYouContentType.MUSIC -> navController.navigate(Routes.musicAlbumDetail(item.id))
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("For you") },
                actions = {
                    // See this file's own doc comment: these two are HomeScreen's former
                    // top-bar actions, carried forward so Routes.DOWNLOADS/Routes.REQUESTS stay
                    // reachable now that HomeScreen no longer mounts anywhere.
                    TextButton(onClick = { navController.navigate(Routes.DOWNLOADS) }) {
                        Text("Downloads")
                    }
                    TextButton(onClick = { navController.navigate(Routes.REQUESTS) }) {
                        Text("Requests")
                    }
                    // Wave 16f-A-1: reaches the new Settings screen (theme mode + accent) from
                    // existing chrome rather than a sixth AuralisShell destination — see
                    // Routes.SETTINGS's own doc comment for why.
                    TextButton(onClick = { navController.navigate(Routes.SETTINGS) }) {
                        Text("Settings")
                    }
                },
            )
        },
    ) { innerPadding ->
        when (uiState) {
            is ForYouUiState.Loading ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            is ForYouUiState.Error ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text((uiState as ForYouUiState.Error).message)
                }
            is ForYouUiState.Loaded -> {
                val loaded = uiState as ForYouUiState.Loaded
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    item {
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            FOR_YOU_FILTER_OPTIONS.forEach { option ->
                                FilterChip(
                                    selected = loaded.filter == option.value,
                                    onClick = { viewModel.selectFilter(option.value) },
                                    label = { Text(option.label) },
                                )
                            }
                        }
                    }

                    if (loaded.quickPicks.isNotEmpty()) {
                        item {
                            QuickPickGrid(
                                items = loaded.quickPicks,
                                imageLoader = container.imageLoader,
                                onSelect = ::onSelect,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                    }

                    if (loaded.visibleCarousels.isEmpty()) {
                        item {
                            Text(
                                text =
                                    if (loaded.allCarousels.isEmpty()) {
                                        "Nothing to show yet — start listening and it will show up here."
                                    } else {
                                        "Nothing to show for this filter yet."
                                    },
                                modifier = Modifier.padding(16.dp),
                            )
                        }
                    } else {
                        items(loaded.visibleCarousels, key = { it.id }) { carousel ->
                            ForYouCarouselRow(
                                carousel = carousel,
                                imageLoader = container.imageLoader,
                                onSelect = ::onSelect,
                            )
                        }
                    }
                }
            }
        }
    }
}
