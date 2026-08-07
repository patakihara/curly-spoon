package net.auralis.app.features.music

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import net.auralis.app.AppContainer
import net.auralis.app.features.player.PlayerUiState
import net.auralis.app.features.player.PlayerViewModel
import net.auralis.app.navigation.Routes
import net.auralis.app.util.formatDuration

/**
 * One playlist's tracks, in stored order (`music/playlist/{playlistId}`). Reached from
 * [PlaylistsScreen]. Mirrors [AlbumDetailScreen]'s shape closely — see that screen's own doc
 * comment for the shared playback-error-as-snackbar treatment via [PlayerUiState.Error], which
 * this screen reuses unchanged.
 *
 * Tapping a track plays it and every track after it in this loaded page, through
 * [playerViewModel] — the same shared controller [AlbumDetailScreen] uses (see that screen's own
 * doc comment on why it's constructed once, at the nav host's scope). The header's own "Play"
 * button plays the whole playlist from its first track.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistDetailScreen(
    container: AppContainer,
    playerViewModel: PlayerViewModel,
    navController: NavHostController,
    playlistId: String,
) {
    val viewModel: PlaylistDetailViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { PlaylistDetailViewModel(container.musicRepository, playlistId) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    val playerUiState by playerViewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(playlistId) { viewModel.load() }

    LaunchedEffect(playerUiState) {
        val state = playerUiState
        if (state is PlayerUiState.Error) {
            snackbarHostState.showSnackbar(state.message)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is PlaylistDetailEvent.RemoveFailed -> snackbarHostState.showSnackbar(event.message)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text((uiState as? PlaylistDetailUiState.Loaded)?.playlistName ?: "Playlist") },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        when (val state = uiState) {
            is PlaylistDetailUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            // Calm, deliberately not an error and deliberately no retry button — see
            // MusicLibraryScreen's identical treatment of this same state for why.
            is PlaylistDetailUiState.Unconfigured ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Text("No Jellyfin server connected yet.")
                }
            is PlaylistDetailUiState.Failed ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = viewModel::load, modifier = Modifier.padding(top = 8.dp)) {
                            Text("Retry")
                        }
                    }
                }
            is PlaylistDetailUiState.Loaded ->
                PlaylistDetailContent(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    state = state,
                    onLoadMore = viewModel::loadMore,
                    onEntryClick = { entry ->
                        playerViewModel.playQueue(
                            buildQueue = { viewModel.buildQueueFrom(entry) },
                            fetchRemaining = { onPage -> viewModel.appendRemainingToQueue(onPage) },
                        )
                    },
                    onRemove = viewModel::removeTrack,
                    onPlayNext = { entry ->
                        coroutineScope.launch {
                            enqueueTrackViaMediaController(
                                playerViewModel = playerViewModel,
                                musicRepository = container.musicRepository,
                                track =
                                    EnqueueableTrack(
                                        itemId = entry.trackId,
                                        title = entry.title,
                                        artist = entry.artistNames,
                                        albumOrPlaylistName = state.playlistName,
                                        artworkUrl = null,
                                    ),
                                position = TrackMenuAction.PLAY_NEXT,
                                onMessage = { message -> snackbarHostState.showSnackbar(message) },
                            )
                        }
                    },
                    onPlayLast = { entry ->
                        coroutineScope.launch {
                            enqueueTrackViaMediaController(
                                playerViewModel = playerViewModel,
                                musicRepository = container.musicRepository,
                                track =
                                    EnqueueableTrack(
                                        itemId = entry.trackId,
                                        title = entry.title,
                                        artist = entry.artistNames,
                                        albumOrPlaylistName = state.playlistName,
                                        artworkUrl = null,
                                    ),
                                position = TrackMenuAction.PLAY_LAST,
                                onMessage = { message -> snackbarHostState.showSnackbar(message) },
                            )
                        }
                    },
                    onGoToAlbum = { id -> navController.navigate(Routes.musicAlbumDetail(id)) },
                )
        }
    }
}

@Composable
private fun PlaylistDetailContent(
    modifier: Modifier,
    state: PlaylistDetailUiState.Loaded,
    onLoadMore: () -> Unit,
    onEntryClick: (MusicPlaylistEntryUi) -> Unit,
    onRemove: (MusicPlaylistEntryUi) -> Unit,
    onPlayNext: (MusicPlaylistEntryUi) -> Unit,
    onPlayLast: (MusicPlaylistEntryUi) -> Unit,
    onGoToAlbum: (String) -> Unit,
) {
    LazyColumn(modifier = modifier.padding(16.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(state.playlistName, style = MaterialTheme.typography.titleLarge)
                    Text(
                        "${state.total} tracks",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                if (state.entries.isNotEmpty()) {
                    Button(onClick = { onEntryClick(state.entries.first()) }) { Text("Play") }
                }
            }
            if (state.entries.isEmpty()) {
                Text("No tracks in this playlist yet.", modifier = Modifier.padding(top = 24.dp))
            }
        }

        items(state.entries, key = { it.playlistItemId }) { entry ->
            PlaylistEntryRow(
                entry,
                onClick = { onEntryClick(entry) },
                onRemove = { onRemove(entry) },
                onPlayNext = { onPlayNext(entry) },
                onPlayLast = { onPlayLast(entry) },
                onGoToAlbum = onGoToAlbum,
            )
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

/** One playlist-track row. See [AlbumDetailScreen]'s `TrackRow` doc comment for why the
 * clickable-to-play area and the remove action are siblings, not nested. */
@Composable
private fun PlaylistEntryRow(
    entry: MusicPlaylistEntryUi,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    onPlayNext: () -> Unit,
    onPlayLast: () -> Unit,
    onGoToAlbum: (String) -> Unit,
) {
    val menuState = rememberTrackContextMenuState()
    // artistId is deliberately null -- see TrackMenuContext's own doc comment: a playlist entry's
    // JellyfinTrack never carries its own artistId, and there is no page-level artist to borrow
    // (unlike AlbumDetailScreen), so "Go to artist" is omitted rather than guessing.
    val menuContext = TrackMenuContext(albumId = entry.albumId, artistId = null)
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TrackContextMenu(
            state = menuState,
            context = menuContext,
            onClick = onClick,
            onPlayNext = onPlayNext,
            onPlayLast = onPlayLast,
            onGoToAlbum = onGoToAlbum,
            onGoToArtist = {},
            rowModifier = Modifier.weight(1f),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(entry.title, style = MaterialTheme.typography.titleSmall)
                    entry.artistNames?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
                Text(formatDuration(entry.durationSeconds), style = MaterialTheme.typography.bodySmall)
            }
        }
        TextButton(onClick = onRemove) { Text("Remove") }
    }
}
