package net.auralis.app.features.music

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
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
import coil.ImageLoader
import coil.compose.AsyncImage
import net.auralis.app.AppContainer
import net.auralis.app.util.formatDuration

/**
 * One album's tracks, in track order (`music/album/{albumId}`). Reached from
 * [MusicLibraryScreen]'s albums list or [ArtistDetailScreen]'s album list. Track rows are
 * deliberately non-interactive — no play button, no tap handler — playback is a later wave;
 * see [AlbumDetailViewModel]'s own doc comment.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlbumDetailScreen(
    container: AppContainer,
    albumId: String,
) {
    val viewModel: AlbumDetailViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        AlbumDetailViewModel(container.musicRepository, container.serverConfigRepository, albumId)
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(albumId) { viewModel.load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text((uiState as? AlbumDetailUiState.Loaded)?.albumName ?: "Album") },
            )
        },
    ) { innerPadding ->
        when (val state = uiState) {
            is AlbumDetailUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            // Calm, deliberately not an error and deliberately no retry button — see
            // MusicLibraryScreen's identical treatment of this same state for why.
            is AlbumDetailUiState.Unconfigured ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Text("No Jellyfin server connected yet.")
                }
            is AlbumDetailUiState.Failed ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = viewModel::load, modifier = Modifier.padding(top = 8.dp)) {
                            Text("Retry")
                        }
                    }
                }
            is AlbumDetailUiState.Loaded ->
                AlbumDetailContent(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    imageLoader = container.imageLoader,
                    state = state,
                    onLoadMore = viewModel::loadMoreTracks,
                )
        }
    }
}

@Composable
private fun AlbumDetailContent(
    modifier: Modifier,
    imageLoader: ImageLoader,
    state: AlbumDetailUiState.Loaded,
    onLoadMore: () -> Unit,
) {
    LazyColumn(modifier = modifier.padding(16.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(
                    model = state.coverUrl,
                    contentDescription = null,
                    imageLoader = imageLoader,
                    modifier = Modifier.size(96.dp),
                )
                Column(modifier = Modifier.padding(start = 16.dp)) {
                    Text(state.albumName, style = MaterialTheme.typography.titleLarge)
                    state.artistName?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                }
            }
            if (state.tracks.isEmpty()) {
                Text("No tracks found for this album.", modifier = Modifier.padding(top = 24.dp))
            }
        }

        items(state.tracks, key = { it.id }) { track ->
            TrackRow(track)
        }

        if (state.hasMore) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                    if (state.loadingMore) {
                        CircularProgressIndicator()
                    } else {
                        Button(onClick = onLoadMore) { Text("Load more") }
                    }
                }
            }
        }
    }
}

@Composable
private fun TrackRow(track: MusicTrackUi) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            track.position,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(end = 16.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(track.title, style = MaterialTheme.typography.titleSmall)
        }
        Text(formatDuration(track.durationSeconds), style = MaterialTheme.typography.bodySmall)
    }
}
