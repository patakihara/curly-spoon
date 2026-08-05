package net.auralis.app.features.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import net.auralis.app.AppContainer
import net.auralis.app.navigation.Routes
import net.auralis.app.util.formatDuration

/**
 * Favourited artists, albums and tracks (`music/favorites`). Reached from [MusicLibraryScreen]'s
 * top bar, the same way [MusicSearchScreen] is — a view *within* music, not a new top-level nav
 * destination, matching `apps/web/src/features/music/MusicFavoritesPage.tsx`'s own placement.
 *
 * Three sections, each omitted entirely when empty — same shape [MusicSearchScreen]'s results
 * already use, and the same reasoning [FavoritesViewModel]'s own doc comment gives for why they
 * are three independent listings rather than one merged one. A favourited track's row opens its
 * album rather than playing directly, same as a [MusicSearchScreen] track result — see that
 * screen's own doc comment for why (no sibling track list to build a queue from here either).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: FavoritesViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { FavoritesViewModel(container.musicRepository, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.load() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Favourites") }) },
    ) { innerPadding ->
        when (val state = uiState) {
            is FavoritesUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            // Calm, deliberately not an error and deliberately no retry button — see
            // MusicLibraryScreen's identical treatment of this same state for why.
            is FavoritesUiState.Unconfigured ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Text("No Jellyfin server connected yet.")
                }
            is FavoritesUiState.Failed ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = viewModel::load, modifier = Modifier.padding(top = 8.dp)) {
                            Text("Retry")
                        }
                    }
                }
            is FavoritesUiState.Loaded ->
                if (state.isEmpty) {
                    Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                        Text("Nothing favourited yet — tap the heart on an artist, album or track.")
                    }
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
                        favoritesSections(
                            state = state,
                            imageLoader = container.imageLoader,
                            onOpenArtist = { artistId -> navController.navigate(Routes.musicArtistDetail(artistId)) },
                            onOpenAlbum = { albumId -> navController.navigate(Routes.musicAlbumDetail(albumId)) },
                            onToggleArtistFavorite = viewModel::toggleArtistFavorite,
                            onToggleAlbumFavorite = viewModel::toggleAlbumFavorite,
                            onToggleTrackFavorite = viewModel::toggleTrackFavorite,
                        )
                    }
                }
        }
    }
}

private fun LazyListScope.favoritesSections(
    state: FavoritesUiState.Loaded,
    imageLoader: ImageLoader,
    onOpenArtist: (String) -> Unit,
    onOpenAlbum: (String) -> Unit,
    onToggleArtistFavorite: (String) -> Unit,
    onToggleAlbumFavorite: (String) -> Unit,
    onToggleTrackFavorite: (String) -> Unit,
) {
    if (state.artists.isNotEmpty()) {
        item {
            Text("Artists", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        }
        items(state.artists, key = { "artist:${it.id}" }) { artist ->
            MusicRow(
                title = artist.name,
                subtitle = null,
                coverUrl = artist.coverUrl,
                imageLoader = imageLoader,
                onClick = { onOpenArtist(artist.id) },
                trailing = {
                    FavoriteToggleButton(
                        favorite = artist.favorite,
                        itemName = artist.name,
                        onToggle = { onToggleArtistFavorite(artist.id) },
                    )
                },
            )
        }
    }

    if (state.albums.isNotEmpty()) {
        item {
            Text("Albums", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        }
        items(state.albums, key = { "album:${it.id}" }) { album ->
            MusicRow(
                title = album.name,
                subtitle = album.artistName,
                coverUrl = album.coverUrl,
                imageLoader = imageLoader,
                onClick = { onOpenAlbum(album.id) },
                trailing = {
                    FavoriteToggleButton(
                        favorite = album.favorite,
                        itemName = album.name,
                        onToggle = { onToggleAlbumFavorite(album.id) },
                    )
                },
            )
        }
    }

    if (state.tracks.isNotEmpty()) {
        item {
            Text("Tracks", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        }
        items(state.tracks, key = { "track:${it.id}" }) { track ->
            FavoriteTrackRow(
                track = track,
                onOpenAlbum = onOpenAlbum,
                onToggleFavorite = { onToggleTrackFavorite(track.id) },
            )
        }
    }
}

/** One favourited-track row. See [AlbumDetailScreen]'s `TrackRow` doc comment for why the
 * clickable-to-open-album area and [FavoriteToggleButton] are siblings, not nested. A track
 * with no [MusicFavoriteTrackUi.albumId] has nowhere to navigate to, so — like
 * [MusicSearchScreen]'s identical `SearchTrackRow` — its clickable area is dropped entirely
 * rather than left as a dead tap target; the favourite toggle still works regardless, since
 * toggling never depended on the album id. */
@Composable
private fun FavoriteTrackRow(
    track: MusicFavoriteTrackUi,
    onOpenAlbum: (String) -> Unit,
    onToggleFavorite: () -> Unit,
) {
    val albumId = track.albumId
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val infoModifier =
            Modifier.weight(1f).let { base -> if (albumId != null) base.clickable(onClick = { onOpenAlbum(albumId) }) else base }
        Row(modifier = infoModifier, verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(track.title, style = MaterialTheme.typography.titleSmall)
                track.artistNames?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
            Text(formatDuration(track.durationSeconds), style = MaterialTheme.typography.bodySmall)
        }
        FavoriteToggleButton(favorite = track.favorite, itemName = track.title, onToggle = onToggleFavorite)
    }
}
