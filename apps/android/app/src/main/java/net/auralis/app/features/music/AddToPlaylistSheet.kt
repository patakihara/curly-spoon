package net.auralis.app.features.music

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import net.auralis.app.AppContainer

/**
 * "Add to playlist" — a [ModalBottomSheet] listing every playlist in the connected library plus
 * a "New playlist" option, opened from [AlbumDetailScreen]'s track rows (one track id) and
 * album header (every loaded track's id). [itemIds] is the fixed set of item ids this instance
 * of the sheet will add wherever the user taps; the sheet itself never re-derives it.
 *
 * [onResult] is called once, with a short confirmation or error string, so the caller can show
 * it as a snackbar the same way [AlbumDetailScreen] already shows [PlayerUiState.Error] — this
 * sheet has no snackbar host of its own, since a [ModalBottomSheet] is dismissed (removed from
 * composition) before a snackbar hosted *inside* it would have time to be seen. [onDismiss]
 * closes the sheet, called automatically on a successful add/create (see the `events` collector
 * below) and by [ModalBottomSheet]'s own scrim-tap/back-gesture dismissal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToPlaylistSheet(
    container: AppContainer,
    itemIds: List<String>,
    onDismiss: () -> Unit,
    onResult: (String) -> Unit,
) {
    val viewModel: AddToPlaylistViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { AddToPlaylistViewModel(container.musicRepository, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    var showCreateDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.load() }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is AddToPlaylistEvent.Added -> {
                    onResult("Added to ${event.playlistName}")
                    showCreateDialog = false
                    onDismiss()
                }
                is AddToPlaylistEvent.Failed -> onResult(event.message)
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        when (val state = uiState) {
            is AddToPlaylistUiState.Loading ->
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            is AddToPlaylistUiState.Failed ->
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            is AddToPlaylistUiState.Loaded ->
                LazyColumn(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                    item {
                        Text(
                            "Add to playlist",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    item {
                        TextButton(
                            onClick = { showCreateDialog = true },
                            enabled = !state.busy,
                            modifier = Modifier.padding(horizontal = 8.dp),
                        ) {
                            Text("New playlist")
                        }
                    }
                    if (state.playlists.isEmpty()) {
                        item {
                            Text(
                                "No playlists yet.",
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }
                    } else {
                        items(state.playlists, key = { it.id }) { playlist ->
                            MusicRow(
                                title = playlist.name,
                                subtitle = playlist.trackCount?.let { "$it tracks" },
                                coverUrl = playlist.coverUrl,
                                imageLoader = container.imageLoader,
                                onClick = {
                                    if (!state.busy) viewModel.addToExisting(playlist.id, playlist.name, itemIds)
                                },
                            )
                        }
                    }
                }
        }
    }

    if (showCreateDialog) {
        val creating = (uiState as? AddToPlaylistUiState.Loaded)?.busy ?: false
        CreatePlaylistDialog(
            creating = creating,
            onDismiss = { showCreateDialog = false },
            onConfirm = { name -> viewModel.createAndAdd(name, itemIds) },
        )
    }
}
