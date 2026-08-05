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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import coil.ImageLoader
import net.auralis.app.AppContainer
import net.auralis.app.navigation.Routes

/**
 * Search across the connected Jellyfin library's artists, albums and tracks
 * (`music/search`). Reached from [MusicLibraryScreen]'s top bar. Results are grouped into up to
 * three sections, in that order, each omitted entirely when empty — mirroring
 * `apps/web/src/features/search/SearchPage.tsx`'s own section ordering and its identical
 * "omit an empty section rather than show it with nothing in it" choice.
 *
 * An artist or album result navigates to its own detail screen, same as everywhere else in this
 * app's music browsing. A **track** result does not play directly: unlike an [AlbumDetailScreen]
 * track row, a search hit carries no sibling track list to build a playback queue from, so
 * tapping it opens its album instead, where a full, orderable queue already exists — the same
 * choice `apps/web/src/features/search/SearchPage.tsx` makes for the same reason. A track
 * with no [MusicSearchTrackUi.albumId] has nowhere to navigate to, so [SearchTrackRow] renders it
 * non-interactive rather than as a dead tap target.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicSearchScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: MusicSearchViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { MusicSearchViewModel(container.musicRepository, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Search music") }) },
    ) { innerPadding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
            item {
                OutlinedTextField(
                    value = uiState.query,
                    onValueChange = viewModel::onQueryChange,
                    label = { Text("Artists, albums, or tracks") },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                )
            }
            searchResultsSection(
                state = uiState.resultsState,
                imageLoader = container.imageLoader,
                onOpenArtist = { artistId -> navController.navigate(Routes.musicArtistDetail(artistId)) },
                onOpenAlbum = { albumId -> navController.navigate(Routes.musicAlbumDetail(albumId)) },
                onRetry = viewModel::retry,
            )
        }
    }
}

private fun LazyListScope.searchResultsSection(
    state: MusicSearchResultsUiState,
    imageLoader: ImageLoader,
    onOpenArtist: (String) -> Unit,
    onOpenAlbum: (String) -> Unit,
    onRetry: () -> Unit,
) {
    when (state) {
        // Inviting, not "no results" — no search has actually run yet.
        is MusicSearchResultsUiState.Idle ->
            item {
                Text(
                    "Search your Jellyfin library for artists, albums, and tracks.",
                    modifier = Modifier.padding(top = 24.dp),
                )
            }
        is MusicSearchResultsUiState.Searching ->
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        // Calm, deliberately not an error and deliberately no retry button — see
        // MusicLibraryScreen's identical treatment of this same state for why.
        is MusicSearchResultsUiState.Unconfigured ->
            item {
                Text("No Jellyfin server connected yet.", modifier = Modifier.padding(top = 24.dp))
            }
        is MusicSearchResultsUiState.Failed ->
            item {
                Column(modifier = Modifier.padding(top = 24.dp)) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry, modifier = Modifier.padding(top = 4.dp)) { Text("Retry") }
                }
            }
        is MusicSearchResultsUiState.Results ->
            if (state.isEmpty) {
                item { Text("No matches found.", modifier = Modifier.padding(top = 24.dp)) }
            } else {
                if (state.artists.isNotEmpty()) {
                    item {
                        Text(
                            "Artists",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                    items(state.artists, key = { "artist:${it.id}" }) { artist ->
                        MusicRow(
                            title = artist.name,
                            subtitle = null,
                            coverUrl = artist.coverUrl,
                            imageLoader = imageLoader,
                            onClick = { onOpenArtist(artist.id) },
                        )
                    }
                }
                if (state.albums.isNotEmpty()) {
                    item {
                        Text(
                            "Albums",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                    items(state.albums, key = { "album:${it.id}" }) { album ->
                        MusicRow(
                            title = album.name,
                            subtitle = album.artistName,
                            coverUrl = album.coverUrl,
                            imageLoader = imageLoader,
                            onClick = { onOpenAlbum(album.id) },
                        )
                    }
                }
                if (state.tracks.isNotEmpty()) {
                    item {
                        Text(
                            "Tracks",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                    items(state.tracks, key = { "track:${it.id}" }) { track ->
                        SearchTrackRow(track = track, onOpenAlbum = onOpenAlbum)
                    }
                }
            }
    }
}

/** One track search result — visually a plain row, like [MusicRow]'s artist/album rows, not a
 * [Button]: this is a list item, not an action. Non-interactive — no `clickable` modifier
 * applied at all, not merely a no-op click handler — when [MusicSearchTrackUi.albumId] is null,
 * per this file's own doc comment on why a track result with nowhere to navigate must not read
 * as tappable. */
@Composable
private fun SearchTrackRow(
    track: MusicSearchTrackUi,
    onOpenAlbum: (String) -> Unit,
) {
    val albumId = track.albumId
    val rowModifier =
        Modifier.fillMaxWidth().let { base ->
            if (albumId != null) base.clickable(onClick = { onOpenAlbum(albumId) }) else base
        }.padding(vertical = 8.dp)
    Row(modifier = rowModifier, verticalAlignment = Alignment.CenterVertically) {
        Column {
            Text(track.title, style = MaterialTheme.typography.titleSmall)
            track.artistNames?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
