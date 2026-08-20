package net.develivarr.auralis.features.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import coil.ImageLoader
import coil.compose.AsyncImage
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.features.home.FeedCarousel
import net.develivarr.auralis.features.home.ForYouCarouselRow
import net.develivarr.auralis.navigation.Routes

/**
 * The music tab's entry point: every artist and every album in the connected Jellyfin
 * library, each its own paginated section. Mirrors [net.develivarr.auralis.features.podcasts
 * .PodcastsScreen]'s shape — one top-level [LazyColumn] holding both of this screen's
 * potentially-long lists as their own `items` blocks, not two nested `LazyColumn`s inside a
 * `Column`; see that screen's own doc comment for the bug (an unweighted sibling silently
 * squeezed a second list to zero height) that shape avoids.
 *
 * No playback here — see `docs/agent-specs` (or an earlier wave's own spec) for why: playback is
 * a separate, later wave. Search is reachable from the top bar's "Search" action
 * ([MusicSearchScreen]) rather than built into this screen — a debounced-as-you-type field
 * fighting this screen's own two independently-paginated sections for one shared scroll
 * position would be its own source of bugs, and the web client
 * (`apps/web/src/features/search/SearchPage.tsx`) already treats search as its own page.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicLibraryScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: MusicLibraryViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { MusicLibraryViewModel(container.musicRepository, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Music") },
                actions = {
                    // A stock Material 3 icon set is not a confirmed dependency here — see
                    // HomeScreen.kt's identical text-not-icon top bar actions for why.
                    TextButton(onClick = { navController.navigate(Routes.MUSIC_SEARCH) }) {
                        Text("Search")
                    }
                    TextButton(onClick = { navController.navigate(Routes.MUSIC_FAVORITES) }) {
                        Text("Favourites")
                    }
                    TextButton(onClick = { navController.navigate(Routes.MUSIC_PLAYLISTS) }) {
                        Text("Playlists")
                    }
                    TextButton(onClick = { navController.navigate(Routes.MUSIC_REQUESTS) }) {
                        Text("Requests")
                    }
                },
            )
        },
    ) { innerPadding ->
        when (val availability = uiState.availability) {
            is MusicAvailabilityUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            // Calm, deliberately not an error and deliberately no retry button — retrying an
            // unconfigured server cannot succeed until the user connects one from the web app.
            // See `musicErrorMessage`'s doc comment for why this app builds no connect form.
            is MusicAvailabilityUiState.Unconfigured ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "No Jellyfin server connected yet.",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Connect one from the Auralis web app to browse your music library here.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
            is MusicAvailabilityUiState.Failed ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(availability.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = viewModel::load, modifier = Modifier.padding(top = 8.dp)) {
                            Text("Retry")
                        }
                    }
                }
            is MusicAvailabilityUiState.Available ->
                LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
                    // Wave 13f-2 — GET /music/recommended's shelves, the reader the BFF route
                    // had shipped without (docs/HANDOVER.md's "a wave that adds a writer must
                    // name its reader" rule). Rendered above Artists/Albums, using the exact same
                    // ForYouCarouselRow this screen's own "For you" tab uses for the book/podcast
                    // counterpart, rather than a second carousel composable — this LazyColumn's
                    // own `.padding(horizontal = 16.dp)` above additionally insets
                    // ForYouCarouselRow's own internal content padding, which is an acceptable
                    // (if not pixel-perfect) cost given nothing here can render on a device to
                    // check it.
                    //
                    // Wave 15d — a tapped item that isn't in the library (FeedItem.isExternal)
                    // must not open AlbumDetailScreen: its id is an opaque, namespaced
                    // (`external:<provider>:<id>`) value Jellyfin has never heard of, so that
                    // screen would render a blank "Album" with favourite/playlist actions acting
                    // on nothing and no tracks — a real dead end, confirmed on web and, by this
                    // wave, on Android too by reading this exact navigation path (there is no
                    // device here to click it). Instead it opens the music request flow,
                    // pre-filled with the recommended album's artist name so the user can request
                    // it straight away.
                    recommendedSection(
                        carousels = uiState.recommendedCarousels,
                        imageLoader = container.imageLoader,
                        onOpenAlbum = { albumId -> navController.navigate(Routes.musicAlbumDetail(albumId)) },
                        onRequestArtist = { artist -> navController.navigate(Routes.musicRequests(artist)) },
                    )
                    item {
                        Text(
                            "Artists",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                    artistsSection(
                        state = uiState.artistsState,
                        imageLoader = container.imageLoader,
                        onOpen = { artistId -> navController.navigate(Routes.musicArtistDetail(artistId)) },
                        onLoadMore = viewModel::loadMoreArtists,
                        onRetry = viewModel::retryArtists,
                    )

                    item {
                        Text(
                            "Albums",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 24.dp),
                        )
                    }
                    albumsSection(
                        state = uiState.albumsState,
                        imageLoader = container.imageLoader,
                        onOpen = { albumId -> navController.navigate(Routes.musicAlbumDetail(albumId)) },
                        onLoadMore = viewModel::loadMoreAlbums,
                        onRetry = viewModel::retryAlbums,
                    )
                }
        }
    }
}

/**
 * Wave 13f-2 — one [ForYouCarouselRow] per `GET /music/recommended` shelf, or nothing at all
 * when [carousels] is empty (a Jellyfin-unconfigured/credential-less user, a cold-start user
 * with no play history, or the call simply failing — [MusicLibraryViewModel.loadRecommended]'s
 * doc comment covers why every one of those degrades to an empty list rather than a distinct
 * UI state). No section heading of its own — each carousel's own [FeedCarousel.label] already
 * serves as its heading, same as on the "For you" screen, so a second "Recommended" heading
 * above them would be redundant.
 *
 * Wave 15d — [onOpenAlbum] and [onRequestArtist] replace the single `onOpen` this used to
 * carry: an owned item ([net.develivarr.auralis.features.home.FeedItem.isExternal] `false`)
 * still opens [net.develivarr.auralis.features.music.AlbumDetailScreen] as before, but an
 * external one is routed to the music request flow instead, keyed off [FeedItem.subtitle] (the
 * album's artist name) rather than its opaque, namespaced id — see this function's own call
 * site in [MusicLibraryScreen] for why.
 */
private fun LazyListScope.recommendedSection(
    carousels: List<FeedCarousel>,
    imageLoader: ImageLoader,
    onOpenAlbum: (String) -> Unit,
    onRequestArtist: (String?) -> Unit,
) {
    items(carousels, key = { "recommended:${it.id}" }) { carousel ->
        ForYouCarouselRow(
            carousel = carousel,
            imageLoader = imageLoader,
            onSelect = { item -> if (item.isExternal) onRequestArtist(item.subtitle) else onOpenAlbum(item.id) },
            modifier = Modifier.padding(bottom = 16.dp),
        )
    }
}

private fun LazyListScope.artistsSection(
    state: ArtistsSectionUiState,
    imageLoader: ImageLoader,
    onOpen: (String) -> Unit,
    onLoadMore: () -> Unit,
    onRetry: () -> Unit,
) {
    when (state) {
        is ArtistsSectionUiState.Loading ->
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        is ArtistsSectionUiState.Failed ->
            item {
                Column(modifier = Modifier.padding(top = 8.dp)) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                    // Not onLoadMore: this section has no Loaded items yet (the first page
                    // itself failed), and loadMoreArtists() is a no-op without one — see
                    // MusicLibraryViewModel.retryArtists's doc comment.
                    Button(onClick = onRetry, modifier = Modifier.padding(top = 4.dp)) { Text("Retry") }
                }
            }
        is ArtistsSectionUiState.Loaded ->
            if (state.items.isEmpty()) {
                item { Text("No artists in this library yet.", modifier = Modifier.padding(top = 8.dp)) }
            } else {
                items(state.items, key = { "artist:${it.id}" }) { artist ->
                    MusicRow(
                        title = artist.name,
                        subtitle = null,
                        coverUrl = artist.coverUrl,
                        imageLoader = imageLoader,
                        onClick = { onOpen(artist.id) },
                    )
                }
                loadMoreRow(hasMore = state.hasMore, loadingMore = state.loadingMore, onLoadMore = onLoadMore)
            }
    }
}

private fun LazyListScope.albumsSection(
    state: AlbumsSectionUiState,
    imageLoader: ImageLoader,
    onOpen: (String) -> Unit,
    onLoadMore: () -> Unit,
    onRetry: () -> Unit,
) {
    when (state) {
        is AlbumsSectionUiState.Loading ->
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        is AlbumsSectionUiState.Failed ->
            item {
                Column(modifier = Modifier.padding(top = 8.dp)) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                    // Not onLoadMore: this section has no Loaded items yet (the first page
                    // itself failed), and loadMoreAlbums() is a no-op without one — see
                    // MusicLibraryViewModel.retryAlbums's doc comment.
                    Button(onClick = onRetry, modifier = Modifier.padding(top = 4.dp)) { Text("Retry") }
                }
            }
        is AlbumsSectionUiState.Loaded ->
            if (state.items.isEmpty()) {
                item { Text("No albums in this library yet.", modifier = Modifier.padding(top = 8.dp)) }
            } else {
                items(state.items, key = { "album:${it.id}" }) { album ->
                    MusicRow(
                        title = album.name,
                        subtitle = album.artistName,
                        coverUrl = album.coverUrl,
                        imageLoader = imageLoader,
                        onClick = { onOpen(album.id) },
                    )
                }
                loadMoreRow(hasMore = state.hasMore, loadingMore = state.loadingMore, onLoadMore = onLoadMore)
            }
    }
}

/** The trailing row of a paginated section: a "Load more" button, a spinner while a page is
 * in flight, or nothing once [hasMore] is false — shared by [artistsSection] and
 * [albumsSection] rather than duplicated between them. */
private fun LazyListScope.loadMoreRow(
    hasMore: Boolean,
    loadingMore: Boolean,
    onLoadMore: () -> Unit,
) {
    if (!hasMore) return
    item {
        Box(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
            if (loadingMore) {
                CircularProgressIndicator()
            } else {
                Button(onClick = onLoadMore) { Text("Load more") }
            }
        }
    }
}

/**
 * Shared with [ArtistDetailScreen], [MusicSearchScreen], [FavoritesScreen] and
 * [net.develivarr.auralis.features.search.UnifiedSearchScreen] — an artist row and an album row
 * are visually identical (cover, title, optional subtitle), so this is `internal`, not
 * `private`, rather than duplicated.
 *
 * [trailing] defaults to nothing, which every pre-existing caller relies on to keep this row's
 * layout unchanged. When it's supplied ([FavoritesScreen]'s own favourite-toggle rows), it is a
 * *sibling* of the clickable artwork-plus-text [Row], not nested inside its `clickable`
 * modifier's subtree — see [AlbumDetailScreen]'s `TrackRow` doc comment for why that avoids
 * depending on Compose's nested-`clickable` pointer-event-consumption behaviour, which nothing
 * in this app tests directly.
 *
 * [artSize]/[artCornerRadius]/[fallbackIcon] default to this row's original 56dp/unrounded/no-
 * fallback shape, which every pre-16e-search caller (this screen's own two sections,
 * [ArtistDetailScreen], [MusicSearchScreen], [FavoritesScreen], [PlaylistsScreen],
 * [AddToPlaylistSheet]) still gets unchanged — `docs/design/screens/SEARCH.md` §3 only asks for
 * the smaller 52dp/8dp-radius/muted-icon-tile treatment on the search screen's own book/podcast/
 * artist/album rows, and this app has far more `MusicRow` call sites than that spec's own recon
 * named (nine across seven files, not the "two other call sites in MusicLibraryScreen" its §10
 * says to check), so widening the *default* would have silently reshaped six unrelated screens
 * as a side effect of a search-screen wave — exactly what §10 says not to do.
 */
@Composable
internal fun MusicRow(
    title: String,
    subtitle: String?,
    coverUrl: String?,
    imageLoader: ImageLoader,
    /**
     * Null means the row has nowhere to go, and must therefore not look tappable.
     * Unified search renders book, series and author results this way: Android has no
     * detail route for any of them yet, and a row that ripples under a finger and then
     * does nothing reads as a broken app rather than as an unavailable feature.
     */
    onClick: (() -> Unit)? = null,
    trailing: @Composable () -> Unit = {},
    artSize: Dp = 56.dp,
    artCornerRadius: Dp = 0.dp,
    /**
     * Rendered underneath the [AsyncImage] exactly as [net.develivarr.auralis.ui.components
     * .MediaHeader] already establishes for the same reason: Coil paints nothing while
     * loading/on failure/when [coverUrl] is null, so this icon shows through in every one of
     * those cases without needing a Coil `error`/`placeholder` painter. `null` (the default)
     * renders no fallback at all, preserving every pre-existing caller's blank-square behaviour.
     */
    fallbackIcon: ImageVector? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier =
                Modifier
                    .weight(1f)
                    .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(artSize).clip(RoundedCornerShape(artCornerRadius)),
                contentAlignment = Alignment.Center,
            ) {
                if (fallbackIcon != null) {
                    Icon(
                        imageVector = fallbackIcon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(artSize / 2),
                    )
                }
                AsyncImage(
                    model = coverUrl,
                    contentDescription = null,
                    imageLoader = imageLoader,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(artSize),
                )
            }
            Column(modifier = Modifier.padding(start = 16.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
        trailing()
    }
}
