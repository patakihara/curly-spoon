package net.auralis.app.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.settings.ServerConfigRepository

/** [AddToPlaylistSheet]'s own state — the playlist list it offers to add into. Unlike
 * [PlaylistsUiState] this is never paginated: the same reasoning [FavoritesViewModel]'s own doc
 * comment gives for skipping pagination on a favourites listing applies here too — one
 * [MUSIC_PAGE_SIZE]-sized page is enough for a picker sheet, and no availability precheck is
 * needed either, since the sheet only opens from a screen ([AlbumDetailScreen]) that has
 * already proven Jellyfin is reachable by rendering at all. */
sealed interface AddToPlaylistUiState {
    data object Loading : AddToPlaylistUiState

    data class Failed(val message: String) : AddToPlaylistUiState

    data class Loaded(
        val playlists: List<MusicPlaylistUi>,
        /** True while an add or a create-and-add is in flight — disables every row and the
         * "New playlist" action so a double-tap can't fire two mutations. */
        val busy: Boolean = false,
    ) : AddToPlaylistUiState
}

/** One-off events [AddToPlaylistSheet] reacts to — a successful add/create should show a
 * confirmation and close the sheet, a failed one should show a snackbar and leave the sheet
 * open so the user can retry a different playlist. Same `SharedFlow` shape as [PlaylistEvent] —
 * see that interface's own doc comment for why this isn't folded into [AddToPlaylistUiState]. */
sealed interface AddToPlaylistEvent {
    data class Added(val playlistName: String) : AddToPlaylistEvent

    data class Failed(val message: String) : AddToPlaylistEvent
}

/**
 * Backs [AddToPlaylistSheet]: lists the connected Jellyfin library's playlists and adds a fixed
 * set of item ids (one track, or a whole album) to whichever one the user picks — or to a new
 * playlist created on the spot. [itemIds] is supplied once, by the caller that opened the
 * sheet ([AlbumDetailScreen]'s track-row or album-header "Add to playlist" action), not read
 * from any repository call of its own.
 */
class AddToPlaylistViewModel(
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<AddToPlaylistUiState>(AddToPlaylistUiState.Loading)
    val uiState: StateFlow<AddToPlaylistUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<AddToPlaylistEvent>(extraBufferCapacity = 1)
    val events: SharedFlow<AddToPlaylistEvent> = _events.asSharedFlow()

    private var cachedBaseUrl: String? = null

    fun load() {
        _uiState.value = AddToPlaylistUiState.Loading
        viewModelScope.launch {
            cachedBaseUrl = serverConfigRepository.getBaseUrl()
            when (val result = musicRepository.playlists(startIndex = 0, limit = MUSIC_PAGE_SIZE)) {
                is PlaylistsPageResult.Loaded ->
                    _uiState.value = AddToPlaylistUiState.Loaded(result.items.map { it.toUi(cachedBaseUrl) })
                is PlaylistsPageResult.Failed ->
                    _uiState.value = AddToPlaylistUiState.Failed(musicErrorMessage(result.code))
            }
        }
    }

    /** Adds [itemIds] to the existing playlist [playlistId]/[playlistName]. */
    fun addToExisting(
        playlistId: String,
        playlistName: String,
        itemIds: List<String>,
    ) {
        val current = _uiState.value as? AddToPlaylistUiState.Loaded ?: return
        if (current.busy) return
        _uiState.value = current.copy(busy = true)
        viewModelScope.launch {
            when (val result = musicRepository.addToPlaylist(playlistId, itemIds)) {
                is PlaylistMutationResult.Success -> {
                    setBusy(false)
                    _events.emit(AddToPlaylistEvent.Added(playlistName))
                }
                is PlaylistMutationResult.Failed -> {
                    setBusy(false)
                    _events.emit(AddToPlaylistEvent.Failed(musicErrorMessage(result.code)))
                }
            }
        }
    }

    /** Creates a new playlist named [name], seeded directly with [itemIds] in the same call
     * (`POST /jellyfin/playlists`' own `itemIds` field — see [MusicRepository.createPlaylist]) —
     * cheaper than [PlaylistsViewModel.createPlaylist]'s own empty-playlist-then-add shape,
     * since this call site always has items to seed with. Blank/whitespace-only names are
     * dropped, same as [PlaylistsViewModel.createPlaylist]. */
    fun createAndAdd(
        name: String,
        itemIds: List<String>,
    ) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        val current = _uiState.value as? AddToPlaylistUiState.Loaded ?: return
        if (current.busy) return
        _uiState.value = current.copy(busy = true)
        viewModelScope.launch {
            when (val result = musicRepository.createPlaylist(trimmed, itemIds)) {
                is CreatePlaylistResult.Created -> {
                    setBusy(false)
                    _events.emit(AddToPlaylistEvent.Added(trimmed))
                }
                is CreatePlaylistResult.Failed -> {
                    setBusy(false)
                    _events.emit(AddToPlaylistEvent.Failed(musicErrorMessage(result.code)))
                }
            }
        }
    }

    private fun setBusy(busy: Boolean) {
        val state = _uiState.value as? AddToPlaylistUiState.Loaded ?: return
        _uiState.value = state.copy(busy = busy)
    }
}
