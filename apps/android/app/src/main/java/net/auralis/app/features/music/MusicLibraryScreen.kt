package net.auralis.app.features.music

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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import coil.ImageLoader
import coil.compose.AsyncImage
import net.auralis.app.AppContainer
import net.auralis.app.navigation.Routes

/**
 * The music tab's entry point: every artist and every album in the connected Jellyfin
 * library, each its own paginated section. Mirrors [net.auralis.app.features.podcasts
 * .PodcastsScreen]'s shape — one top-level [LazyColumn] holding both of this screen's
 * potentially-long lists as their own `items` blocks, not two nested `LazyColumn`s inside a
 * `Column`; see that screen's own doc comment for the bug (an unweighted sibling silently
 * squeezed a second list to zero height) that shape avoids.
 *
 * No search field and no playback here — see `docs/agent-specs` (or this wave's own spec) for
 * why: search and playback are separate, later waves, and adding either here would collide
 * with whichever agent picks them up next.
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
        topBar = { TopAppBar(title = { Text("Music") }) },
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

/** Shared with [ArtistDetailScreen] — an artist row and an album row are visually identical
 * (cover, title, optional subtitle), so this is `internal`, not `private`, rather than
 * duplicated. */
@Composable
internal fun MusicRow(
    title: String,
    subtitle: String?,
    coverUrl: String?,
    imageLoader: ImageLoader,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = coverUrl,
            contentDescription = null,
            imageLoader = imageLoader,
            modifier = Modifier.size(56.dp),
        )
        Column(modifier = Modifier.padding(start = 16.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
