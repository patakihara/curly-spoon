package net.develivarr.auralis.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.settings.ServerConfigRepository

/** [PlaylistsScreen]'s own state — the top-level "every playlist in the connected Jellyfin
 * library" listing, paginated the same way [MusicLibraryViewModel]'s artists/albums sections
 * are (see [ArtistsSectionUiState]'s doc comment for the shared reasoning). */
sealed interface PlaylistsUiState {
    data object Loading : PlaylistsUiState

    /** See [MusicAvailabilityUiState.Unconfigured]'s doc comment — same calm, no-retry
     * treatment applied here. */
    data object Unconfigured : PlaylistsUiState

    data class Failed(val message: String) : PlaylistsUiState

    data class Loaded(
        val items: List<MusicPlaylistUi>,
        val total: Int,
        val loadingMore: Boolean = false,
        /** True while [PlaylistsViewModel.createPlaylist] is in flight — drives the create
         * dialog's own busy state so a double-tap of its confirm button can't fire two
         * creates. */
        val creating: Boolean = false,
    ) : PlaylistsUiState {
        val hasMore: Boolean get() = hasMoreMusicPages(items.size, total)
    }
}

/** One-off events [PlaylistsScreen] reacts to but that don't belong in [PlaylistsUiState]
 * itself — a successful create should navigate away once, not on every recomposition, and a
 * failed create should show a snackbar once, not persist as page state. Same
 * `MutableSharedFlow`/`extraBufferCapacity = 1` shape as [net.develivarr.auralis.features.home
 * .HomeViewModel.downloadEvents] — see that field's own doc comment for why. */
sealed interface PlaylistEvent {
    data class Created(val playlistId: String) : PlaylistEvent

    data class Failed(val message: String) : PlaylistEvent
}

/**
 * Backs [PlaylistsScreen]: every playlist in the connected Jellyfin library, paginated, plus a
 * create-playlist action. The Jellyfin-music sibling of [MusicLibraryViewModel]'s own
 * single-section shape — one paginated list behind one [MusicRepository.availability] precheck,
 * checked once on screen entry, same reasoning as that class's own doc comment.
 */
class PlaylistsViewModel(
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<PlaylistsUiState>(PlaylistsUiState.Loading)
    val uiState: StateFlow<PlaylistsUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<PlaylistEvent>(extraBufferCapacity = 1)
    val events: SharedFlow<PlaylistEvent> = _events.asSharedFlow()

    private var cachedBaseUrl: String? = null

    fun load() {
        _uiState.value = PlaylistsUiState.Loading
        viewModelScope.launch {
            cachedBaseUrl = serverConfigRepository.getBaseUrl()
            when (val availability = musicRepository.availability()) {
                is MusicAvailability.Available -> loadFirstPage()
                is MusicAvailability.Unconfigured -> _uiState.value = PlaylistsUiState.Unconfigured
                is MusicAvailability.Failed ->
                    _uiState.value = PlaylistsUiState.Failed(musicErrorMessage(availability.code))
            }
        }
    }

    private suspend fun loadFirstPage() {
        when (val result = musicRepository.playlists(startIndex = 0, limit = MUSIC_PAGE_SIZE)) {
            is PlaylistsPageResult.Loaded ->
                _uiState.value =
                    PlaylistsUiState.Loaded(items = result.items.map { it.toUi(cachedBaseUrl) }, total = result.total)
            is PlaylistsPageResult.Failed ->
                _uiState.value = PlaylistsUiState.Failed(musicErrorMessage(result.code))
        }
    }

    /** Re-issues the first-page load after [PlaylistsUiState.Failed]. See
     * [MusicLibraryViewModel.retryArtists]'s doc comment for why this can't just be
     * [loadMore] retried — there is no [PlaylistsUiState.Loaded] to resume from yet. */
    fun retry() {
        _uiState.value = PlaylistsUiState.Loading
        viewModelScope.launch { loadFirstPage() }
    }

    /** See [MusicLibraryViewModel.loadMoreArtists] — identical shape and identical
     * failed-load-more degrade. */
    fun loadMore() {
        val current = _uiState.value as? PlaylistsUiState.Loaded ?: return
        if (current.loadingMore || !current.hasMore) return
        _uiState.value = current.copy(loadingMore = true)
        viewModelScope.launch {
            when (
                val result = musicRepository.playlists(startIndex = current.items.size, limit = MUSIC_PAGE_SIZE)
            ) {
                is PlaylistsPageResult.Loaded ->
                    _uiState.value =
                        current.copy(
                            items = current.items + result.items.map { it.toUi(cachedBaseUrl) },
                            total = result.total,
                            loadingMore = false,
                        )
                is PlaylistsPageResult.Failed -> _uiState.value = current.copy(loadingMore = false)
            }
        }
    }

    /**
     * Creates a playlist named [name] (blank/whitespace-only names are dropped, matching the
     * BFF's own `name` validation in `jellyfinCreatePlaylistBodySchema`, which this pre-empts
     * rather than round-tripping a request that would just fail) and prepends it to the loaded
     * list on success — no reload needed, since the new playlist is empty and this call already
     * has everything a row needs ([MusicPlaylistUi.trackCount] `0`, cover derived from its own
     * id the same way [AlbumDetailViewModel.load]'s own `coverUrl` is). Emits
     * [PlaylistEvent.Created]/[PlaylistEvent.Failed] for [PlaylistsScreen] to react to once,
     * rather than folding either into [PlaylistsUiState] itself — see [PlaylistEvent]'s own doc
     * comment.
     */
    fun createPlaylist(name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        val current = _uiState.value as? PlaylistsUiState.Loaded ?: return
        if (current.creating) return
        _uiState.value = current.copy(creating = true)
        viewModelScope.launch {
            when (val result = musicRepository.createPlaylist(trimmed)) {
                is CreatePlaylistResult.Created -> {
                    val state = _uiState.value as? PlaylistsUiState.Loaded
                    if (state != null) {
                        val created =
                            MusicPlaylistUi(
                                id = result.id,
                                name = trimmed,
                                trackCount = 0,
                                coverUrl = jellyfinItemArtworkUrl(cachedBaseUrl, result.id),
                            )
                        _uiState.value =
                            state.copy(items = listOf(created) + state.items, total = state.total + 1, creating = false)
                    }
                    _events.emit(PlaylistEvent.Created(result.id))
                }
                is CreatePlaylistResult.Failed -> {
                    val state = _uiState.value as? PlaylistsUiState.Loaded
                    if (state != null) _uiState.value = state.copy(creating = false)
                    _events.emit(PlaylistEvent.Failed(musicErrorMessage(result.code)))
                }
            }
        }
    }
}
