package net.develivarr.auralis.features.music

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
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import coil.ImageLoader
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.features.player.PlayerUiState
import net.develivarr.auralis.features.player.PlayerViewModel
import net.develivarr.auralis.navigation.Routes
import net.develivarr.auralis.util.formatDuration

/**
 * One album's tracks, in track order (`music/album/{albumId}`). Reached from
 * [MusicLibraryScreen]'s albums list or [ArtistDetailScreen]'s album list.
 *
 * Tapping a track plays it and every track after it, in order, through [playerViewModel] — the
 * same shared controller every other playback surface in this app uses (see
 * [net.develivarr.auralis.navigation.AuralisNavHost]'s own doc comment on why it's constructed once, at
 * the nav host's scope), so the persistent mini player and lock-screen/notification metadata
 * work for a music track exactly as they already do for a book or episode. Failures surface the
 * same way [net.develivarr.auralis.features.podcasts.PodcastDetailScreen] already does: a snackbar
 * driven by [PlayerUiState.Error], not a state this screen invents its own handling for.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlbumDetailScreen(
    container: AppContainer,
    playerViewModel: PlayerViewModel,
    navController: NavHostController,
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
    val playerUiState by playerViewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    // The item ids the currently-open AddToPlaylistSheet should add — null means the sheet is
    // closed. A single track's id for a track row's own action, or every loaded track's id for
    // the album header's "Add album to playlist" action; see AlbumDetailContent's own
    // onAddTrackToPlaylist/onAddAlbumToPlaylist callbacks below.
    var addToPlaylistItemIds by remember { mutableStateOf<List<String>?>(null) }

    LaunchedEffect(albumId) { viewModel.load() }

    LaunchedEffect(playerUiState) {
        val state = playerUiState
        if (state is PlayerUiState.Error) {
            snackbarHostState.showSnackbar(state.message)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text((uiState as? AlbumDetailUiState.Loaded)?.albumName ?: "Album") },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                    albumId = albumId,
                    onLoadMore = viewModel::loadMoreTracks,
                    onTrackClick = { track ->
                        playerViewModel.playQueue(
                            buildQueue = { viewModel.buildQueueFrom(track) },
                            fetchRemaining = { onPage -> viewModel.appendRemainingToQueue(onPage) },
                        )
                    },
                    onToggleAlbumFavorite = viewModel::toggleAlbumFavorite,
                    onToggleTrackFavorite = viewModel::toggleTrackFavorite,
                    onAddTrackToPlaylist = { track -> addToPlaylistItemIds = listOf(track.id) },
                    onAddAlbumToPlaylist = { addToPlaylistItemIds = state.tracks.map { it.id } },
                    onPlayNext = { track ->
                        coroutineScope.launch {
                            enqueueTrackViaMediaController(
                                playerViewModel = playerViewModel,
                                musicRepository = container.musicRepository,
                                track =
                                    EnqueueableTrack(
                                        itemId = track.id,
                                        title = track.title,
                                        artist = track.artistNames,
                                        albumOrPlaylistName = state.albumName,
                                        artworkUrl = state.coverUrl,
                                    ),
                                position = TrackMenuAction.PLAY_NEXT,
                                onMessage = { message -> snackbarHostState.showSnackbar(message) },
                            )
                        }
                    },
                    onPlayLast = { track ->
                        coroutineScope.launch {
                            enqueueTrackViaMediaController(
                                playerViewModel = playerViewModel,
                                musicRepository = container.musicRepository,
                                track =
                                    EnqueueableTrack(
                                        itemId = track.id,
                                        title = track.title,
                                        artist = track.artistNames,
                                        albumOrPlaylistName = state.albumName,
                                        artworkUrl = state.coverUrl,
                                    ),
                                position = TrackMenuAction.PLAY_LAST,
                                onMessage = { message -> snackbarHostState.showSnackbar(message) },
                            )
                        }
                    },
                    onGoToAlbum = { id -> navController.navigate(Routes.musicAlbumDetail(id)) },
                    onGoToArtist = { id -> navController.navigate(Routes.musicArtistDetail(id)) },
                )
        }
    }

    val sheetItemIds = addToPlaylistItemIds
    if (sheetItemIds != null) {
        AddToPlaylistSheet(
            container = container,
            itemIds = sheetItemIds,
            onDismiss = { addToPlaylistItemIds = null },
            onResult = { message -> coroutineScope.launch { snackbarHostState.showSnackbar(message) } },
        )
    }
}

@Composable
private fun AlbumDetailContent(
    modifier: Modifier,
    imageLoader: ImageLoader,
    state: AlbumDetailUiState.Loaded,
    onLoadMore: () -> Unit,
    albumId: String,
    onTrackClick: (MusicTrackUi) -> Unit,
    onToggleAlbumFavorite: () -> Unit,
    onToggleTrackFavorite: (String) -> Unit,
    onAddTrackToPlaylist: (MusicTrackUi) -> Unit,
    onAddAlbumToPlaylist: () -> Unit,
    onPlayNext: (MusicTrackUi) -> Unit,
    onPlayLast: (MusicTrackUi) -> Unit,
    onGoToAlbum: (String) -> Unit,
    onGoToArtist: (String) -> Unit,
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
                Column(modifier = Modifier.padding(start = 16.dp).weight(1f)) {
                    Text(state.albumName, style = MaterialTheme.typography.titleLarge)
                    state.artistName?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                }
                FavoriteToggleButton(
                    favorite = state.albumFavorite,
                    itemName = state.albumName,
                    onToggle = onToggleAlbumFavorite,
                )
            }
            // Disabled for a genuinely empty album — there is nothing to seed a playlist with.
            TextButton(onClick = onAddAlbumToPlaylist, enabled = state.tracks.isNotEmpty()) {
                Text("Add album to playlist")
            }
            if (state.tracks.isEmpty()) {
                Text("No tracks found for this album.", modifier = Modifier.padding(top = 24.dp))
            }
        }

        items(state.tracks, key = { it.id }) { track ->
            TrackRow(
                track,
                menuContext = TrackMenuContext(albumId = albumId, artistId = state.albumArtistId),
                onClick = { onTrackClick(track) },
                onToggleFavorite = { onToggleTrackFavorite(track.id) },
                onAddToPlaylist = { onAddTrackToPlaylist(track) },
                onPlayNext = { onPlayNext(track) },
                onPlayLast = { onPlayLast(track) },
                onGoToAlbum = onGoToAlbum,
                onGoToArtist = onGoToArtist,
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

/**
 * One track row. The clickable-to-play area (position + title + duration) is a
 * `Modifier.weight(1f)`-scoped inner [Row], deliberately kept as a *sibling* of
 * [FavoriteToggleButton] rather than wrapping the whole row (button included) in one outer
 * `clickable` — nesting the button's own tap target inside another `clickable`'s would make
 * "does the button's tap also fire the row's `onClick`" depend on Compose's pointer-event-
 * consumption behaviour between nested `clickable`s, which nothing else in this app's existing
 * screens exercises (grepped: no other screen nests a `Button`/`TextButton` inside a `clickable`
 * row). Kept as siblings instead, which has no such ambiguity — the favourite tap can never
 * reach `onClick` because it is never inside its modifier's subtree to begin with.
 */
@Composable
private fun TrackRow(
    track: MusicTrackUi,
    menuContext: TrackMenuContext,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
    onAddToPlaylist: () -> Unit,
    onPlayNext: () -> Unit,
    onPlayLast: () -> Unit,
    onGoToAlbum: (String) -> Unit,
    onGoToArtist: (String) -> Unit,
) {
    val menuState = rememberTrackContextMenuState()
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
            onGoToArtist = onGoToArtist,
            rowModifier = Modifier.weight(1f),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
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
        TextButton(onClick = onAddToPlaylist) { Text("Add") }
        FavoriteToggleButton(
            favorite = track.favorite,
            itemName = track.title,
            onToggle = onToggleFavorite,
        )
    }
}
