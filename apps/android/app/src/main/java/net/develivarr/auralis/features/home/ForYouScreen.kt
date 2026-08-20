package net.develivarr.auralis.features.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
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
                // docs/design/screens/FOR_YOU.md §6.1: the on-screen heading matches the nav
                // label (ShellDestinations.kt's FOR_YOU entry), which Sofia renamed "Browse" —
                // "For you"/"Home"/"Discover" are the same destination under four names, and
                // this file's own type/route/component names deliberately keep the old term
                // (§6.1's "Naming" note); only this UI-visible string changes.
                title = { Text("Browse") },
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
            is ForYouUiState.Loading -> {
                // §6.6, new requirement: nothing on this screen announced the loading→loaded
                // transition before this wave (grepped for aria-live/liveRegion and found
                // nothing, per the spec's own recon). Not required to match web's wording
                // byte-for-byte — only that something is announced.
                ForYouStatusAnnouncer(loading = true)
                // §3.3/§10 item 5: a layout-shaped skeleton, replacing the bare
                // CircularProgressIndicator this branch used to render — ForYouViewModel.load()
                // itself is unchanged (§6.2: it already holds Loading until every source
                // settles), so this is a Compose-UI-only swap.
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    item {
                        // The filter row "can render immediately, it needs no data" (§3.3) —
                        // FOR_YOU_FILTER_OPTIONS is a static list, so the real chips render here
                        // too, pre-selecting "All" (DEFAULT_FOR_YOU_FILTER); onSelect is a no-op
                        // since ForYouViewModel.selectFilter is itself a no-op against
                        // ForYouUiState.Loading (its own doc comment).
                        ForYouFilterChipsRow(selectedFilter = DEFAULT_FOR_YOU_FILTER, onSelect = {})
                    }
                    item {
                        QuickPickGridSkeleton(modifier = Modifier.padding(horizontal = 16.dp))
                    }
                    repeat(SKELETON_CAROUSEL_ROW_COUNT) { index ->
                        item(key = "skeleton-carousel-$index") {
                            ForYouCarouselRowSkeleton()
                        }
                    }
                }
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
                        // §6.6: the loaded half of the loading/loaded announcement pair.
                        ForYouStatusAnnouncer(loading = false)
                    }
                    item {
                        ForYouFilterChipsRow(
                            selectedFilter = loaded.filter,
                            onSelect = { viewModel.selectFilter(it) },
                        )
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

/** The content-type filter chip row, shared by [ForYouScreen]'s loading and loaded branches —
 * §3.3 calls this out specifically as able to "render immediately, it needs no data", since
 * [FOR_YOU_FILTER_OPTIONS] is a static list rather than anything a fetch produces. §6.4: the
 * options themselves are unchanged by this wave, restated for completeness only. */
@Composable
private fun ForYouFilterChipsRow(
    selectedFilter: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FOR_YOU_FILTER_OPTIONS.forEach { option ->
            FilterChip(
                selected = selectedFilter == option.value,
                onClick = { onSelect(option.value) },
                label = { Text(option.label) },
            )
        }
    }
}

/**
 * §6.6, new requirement on both platforms: announces the loading→loaded transition, which
 * nothing on this screen did before this wave. §6.2's page-level hold (already Android's
 * existing behaviour — see [ForYouViewModel]'s doc comment) makes the silence more noticeable,
 * not less, per the spec's own reasoning: a screen-reader user now waits through one longer
 * silence instead of several shorter ones with no signal either way.
 *
 * Kept at a 1dp visual footprint rather than a full status line — neither §3's geometry tables
 * nor Sonora's own mock reserve space for one, and the requirement is that *something* is
 * announced (§6.6's own wording: "not… a byte-for-byte requirement, just a requirement that
 * *something* is announced"), not that a new line of visible body copy appears. Mirrors the
 * `liveRegion = LiveRegionMode.Polite` pattern `UnifiedSearchScreen.kt`'s own status line already
 * uses for the equivalent web `role="status"` announcement (§11's "Status announcement" there).
 */
@Composable
private fun ForYouStatusAnnouncer(loading: Boolean, modifier: Modifier = Modifier) {
    Text(
        text = if (loading) "Loading your browse feed…" else "Browse feed loaded.",
        style = MaterialTheme.typography.labelSmall,
        modifier =
            modifier
                .size(1.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
    )
}
