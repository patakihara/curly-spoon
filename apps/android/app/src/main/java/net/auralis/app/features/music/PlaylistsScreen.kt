package net.auralis.app.features.music

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import net.auralis.app.AppContainer
import net.auralis.app.navigation.Routes

/**
 * Every playlist in the connected Jellyfin library (`music/playlists`), plus a create-playlist
 * action. Reached from [MusicLibraryScreen]'s top bar, the same way [FavoritesScreen] and
 * [MusicSearchScreen] are. Tapping a row opens [PlaylistDetailScreen]; the top bar's "New"
 * action opens [CreatePlaylistDialog].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistsScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: PlaylistsViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { PlaylistsViewModel(container.musicRepository, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var showCreateDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.load() }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is PlaylistEvent.Created -> {
                    showCreateDialog = false
                    navController.navigate(Routes.playlistDetail(event.playlistId))
                }
                is PlaylistEvent.Failed -> snackbarHostState.showSnackbar(event.message)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Playlists") },
                actions = {
                    TextButton(onClick = { showCreateDialog = true }) { Text("New") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        when (val state = uiState) {
            is PlaylistsUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            // Calm, deliberately not an error and deliberately no retry button — see
            // MusicLibraryScreen's identical treatment of this same state for why.
            is PlaylistsUiState.Unconfigured ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Text("No Jellyfin server connected yet.")
                }
            is PlaylistsUiState.Failed ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = viewModel::retry, modifier = Modifier.padding(top = 8.dp)) {
                            Text("Retry")
                        }
                    }
                }
            is PlaylistsUiState.Loaded ->
                if (state.items.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                        Text("No playlists yet — tap \"New\" to create one.")
                    }
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
                        items(state.items, key = { it.id }) { playlist ->
                            MusicRow(
                                title = playlist.name,
                                subtitle = playlist.trackCount?.let { "$it tracks" },
                                coverUrl = playlist.coverUrl,
                                imageLoader = container.imageLoader,
                                onClick = { navController.navigate(Routes.playlistDetail(playlist.id)) },
                            )
                        }
                        if (state.hasMore) {
                            item {
                                Box(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (state.loadingMore) {
                                        CircularProgressIndicator()
                                    } else {
                                        Button(onClick = viewModel::loadMore) { Text("Load more") }
                                    }
                                }
                            }
                        }
                    }
                }
        }

        if (showCreateDialog) {
            val creating = (uiState as? PlaylistsUiState.Loaded)?.creating ?: false
            CreatePlaylistDialog(
                creating = creating,
                onDismiss = { showCreateDialog = false },
                onConfirm = viewModel::createPlaylist,
            )
        }
    }
}

/** A single-field name prompt shared by [PlaylistsScreen] (always creates an empty playlist,
 * per [JellyfinCreatePlaylistBody]'s doc comment: `itemIds` is optional) and
 * [AddToPlaylistSheet]'s own "New playlist" option (which seeds the new playlist with the
 * sheet's own item ids in the same call — see that file's `AddToPlaylistViewModel
 * .createAndAdd`). `internal`, not `private`, for that second caller. [creating] disables both
 * the text field and the confirm button while the create call is in flight, so a double-tap
 * can't fire two creates. */
@Composable
internal fun CreatePlaylistDialog(
    creating: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!creating) onDismiss() },
        title = { Text("New playlist") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                singleLine = true,
                enabled = !creating,
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(name) }, enabled = !creating && name.isNotBlank()) {
                Text("Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !creating) { Text("Cancel") }
        },
    )
}
