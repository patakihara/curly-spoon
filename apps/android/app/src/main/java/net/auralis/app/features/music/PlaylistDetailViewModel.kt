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
import net.auralis.app.playback.ResolvedPlayback

/** [PlaylistDetailScreen]'s own state — one playlist's tracks, in stored playlist order,
 * paginated. The Jellyfin-music sibling of [AlbumDetailUiState] one level down (an album has
 * tracks; here, a playlist has track *occurrences* — see [MusicPlaylistEntryUi]'s own doc
 * comment for why that distinction matters for removal). */
sealed interface PlaylistDetailUiState {
    data object Loading : PlaylistDetailUiState

    /** See [JELLYFIN_NOT_CONFIGURED_CODE]'s doc comment on [ArtistDetailViewModel]. */
    data object Unconfigured : PlaylistDetailUiState

    data class Failed(val message: String) : PlaylistDetailUiState

    data class Loaded(
        /** Derived from a single-item [MusicRepository.playlists] fetch (`id = playlistId`) —
         * there is no dedicated `GET /jellyfin/playlists/:id` route, the same gap
         * [AlbumDetailUiState.Loaded.albumName]'s doc comment describes for albums, with the
         * identical "sequential, degrade to a placeholder on failure" treatment (see
         * [PlaylistDetailViewModel.fetchPlaylistName]). */
        val playlistName: String,
        val entries: List<MusicPlaylistEntryUi>,
        val total: Int,
        val loadingMore: Boolean = false,
    ) : PlaylistDetailUiState {
        val hasMore: Boolean get() = hasMoreMusicPages(entries.size, total)
    }
}

/** One-off events [PlaylistDetailScreen] reacts to but that don't belong in
 * [PlaylistDetailUiState] — a failed removal rolls back optimistically *and* needs a snackbar,
 * the same two-part guarantee [AlbumDetailViewModel.toggleFavorite]'s doc comment gives for a
 * failed favourite toggle, except a removal has no "flip back" value to reconcile against, so
 * the rollback lives in [PlaylistDetailViewModel.removeTrack] itself and this flow only carries
 * the message half. See [PlaylistEvent]'s own doc comment for why this is a `SharedFlow`, not
 * state. */
sealed interface PlaylistDetailEvent {
    data class RemoveFailed(val message: String) : PlaylistDetailEvent
}

/**
 * Backs [PlaylistDetailScreen]: one playlist's tracks, in stored order, paginated. Calls no
 * [MusicRepository.availability] precheck of its own — see [ArtistDetailViewModel]'s own doc
 * comment for why a detail screen's first page fetch already answers that question for free.
 *
 * [buildQueueFrom] mirrors [AlbumDetailViewModel.buildQueueFrom] exactly, reusing
 * [albumPlaybackQueue] unmodified: a playlist queue needs nothing an album queue doesn't
 * already provide (a list of tracks, their stream URLs, an album/artwork pair applied to every
 * queued item, and each track's own artist with a queue-level fallback) — see that function's
 * own doc comment for the artist fallback rule. [playlistName] fills the "album name" slot.
 */
class PlaylistDetailViewModel(
    private val musicRepository: MusicRepository,
    private val playlistId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow<PlaylistDetailUiState>(PlaylistDetailUiState.Loading)
    val uiState: StateFlow<PlaylistDetailUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<PlaylistDetailEvent>(extraBufferCapacity = 1)
    val events: SharedFlow<PlaylistDetailEvent> = _events.asSharedFlow()

    fun load() {
        _uiState.value = PlaylistDetailUiState.Loading
        viewModelScope.launch {
            when (
                val result = musicRepository.playlistItems(playlistId, startIndex = 0, limit = MUSIC_PAGE_SIZE)
            ) {
                is PlaylistItemsPageResult.Loaded ->
                    _uiState.value =
                        PlaylistDetailUiState.Loaded(
                            playlistName = fetchPlaylistName(),
                            entries = result.items.map { it.toUi() },
                            total = result.total,
                        )
                is PlaylistItemsPageResult.Failed ->
                    _uiState.value =
                        if (result.code == JELLYFIN_NOT_CONFIGURED_CODE) {
                            PlaylistDetailUiState.Unconfigured
                        } else {
                            PlaylistDetailUiState.Failed(musicErrorMessage(result.code))
                        }
            }
        }
    }

    /** See [AlbumDetailViewModel.fetchAlbumFavorite]'s doc comment for the identical
     * "sequential, single-item `id` filter, degrade rather than block the page" reasoning this
     * reuses verbatim for a playlist's own name instead of an album's favourite state. */
    private suspend fun fetchPlaylistName(): String =
        when (val result = musicRepository.playlists(id = playlistId, limit = 1)) {
            is PlaylistsPageResult.Loaded -> result.items.firstOrNull()?.name ?: "Playlist"
            is PlaylistsPageResult.Failed -> "Playlist"
        }

    /** See [AlbumDetailViewModel.loadMoreTracks] — identical shape and identical
     * failed-load-more degrade. */
    fun loadMore() {
        val current = _uiState.value as? PlaylistDetailUiState.Loaded ?: return
        if (current.loadingMore || !current.hasMore) return
        _uiState.value = current.copy(loadingMore = true)
        viewModelScope.launch {
            when (
                val result =
                    musicRepository.playlistItems(playlistId, startIndex = current.entries.size, limit = MUSIC_PAGE_SIZE)
            ) {
                is PlaylistItemsPageResult.Loaded ->
                    _uiState.value =
                        current.copy(
                            entries = current.entries + result.items.map { it.toUi() },
                            total = result.total,
                            loadingMore = false,
                        )
                is PlaylistItemsPageResult.Failed -> _uiState.value = current.copy(loadingMore = false)
            }
        }
    }

    // One counter per playlist-entry id — bumped on every removal attempt of that entry, read
    // back by [removeTrack]'s own coroutine to tell "nothing newer has touched this entry since
    // I started" from "a later action has already taken over". Same correctness argument as
    // [AlbumDetailViewModel.favoriteGeneration]/`toggleFavorite`, applied to a one-way removal
    // instead of a two-way toggle: there is no "current value" to flip, only "was it removed by
    // this call or superseded by a later one for the same entry" (a rapid double-tap of the
    // same row's remove action, which the UI doesn't currently debounce against).
    private val removeGeneration = mutableMapOf<String, Int>()

    /**
     * Removes [entry] from this playlist. Optimistic: [entry] disappears from [uiState]
     * immediately, before the network call, on the caller's own thread (`viewModelScope` is
     * confined to `Dispatchers.Main`, so there is no window for a second removal of the same
     * entry to race this one's own generation capture). On failure, the removal is rolled back
     * — [entry] is re-inserted relative to the entry that preceded it (see `precedingId` below)
     * — **and** [PlaylistDetailEvent.RemoveFailed] is emitted so [PlaylistDetailScreen] can show
     * a snackbar; a silent revert would leave the user believing the removal landed.
     * [removeGeneration] guards both the success path (where there is nothing left to do, since
     * the optimistic removal already stuck) and the failure path against a stale write, the same
     * way [AlbumDetailViewModel.toggleFavorite]'s own generation check does for its two write
     * sites.
     */
    fun removeTrack(entry: MusicPlaylistEntryUi) {
        val current = _uiState.value as? PlaylistDetailUiState.Loaded ?: return
        val index = current.entries.indexOfFirst { it.playlistItemId == entry.playlistItemId }
        if (index == -1) return
        // Captured instead of relying on `index` at rollback time: a numeric index goes stale if
        // loadMore() appends a page, or another entry is removed, while this removal is still in
        // flight — restoring at a now-wrong numeric position would misplace the row. A neighbour
        // relationship survives both, because it's re-resolved against the list as it stands at
        // rollback time rather than replayed against a snapshot. Null means entry was first.
        val precedingId = current.entries.getOrNull(index - 1)?.playlistItemId
        val myGeneration = (removeGeneration[entry.playlistItemId] ?: 0) + 1
        removeGeneration[entry.playlistItemId] = myGeneration
        _uiState.value =
            current.copy(
                entries = current.entries.filterNot { it.playlistItemId == entry.playlistItemId },
                total = current.total - 1,
            )
        viewModelScope.launch {
            when (val result = musicRepository.removeFromPlaylist(playlistId, listOf(entry.playlistItemId))) {
                is PlaylistMutationResult.Success -> Unit // optimistic removal already applied
                is PlaylistMutationResult.Failed -> {
                    if (removeGeneration[entry.playlistItemId] != myGeneration) return@launch
                    val state = _uiState.value as? PlaylistDetailUiState.Loaded ?: return@launch
                    // Re-derive the insertion point from precedingId's *current* position rather
                    // than the stale `index` captured above. If the preceding entry is itself gone
                    // by now (e.g. also removed while this call was in flight), append instead of
                    // guessing — still correct on count, just no longer position-stable, same as
                    // the case being fixed.
                    val restoreAt =
                        precedingId?.let { id ->
                            val precedingIndex = state.entries.indexOfFirst { it.playlistItemId == id }
                            if (precedingIndex == -1) state.entries.size else precedingIndex + 1
                        } ?: 0
                    val restored =
                        state.entries.toMutableList().apply { add(restoreAt.coerceIn(0, size), entry) }
                    _uiState.value = state.copy(entries = restored, total = state.total + 1)
                    _events.emit(PlaylistDetailEvent.RemoveFailed(musicErrorMessage(result.code)))
                }
            }
        }
    }

    /**
     * Builds the queue [net.auralis.app.features.player.PlayerViewModel.playQueue] should play
     * for a tap on [entry]: that entry and every entry after it in the currently loaded page, in
     * playlist order. See this class's own doc comment for why [albumPlaybackQueue] is reused
     * unmodified. Degrades to an empty list — never throws — when [uiState] isn't
     * [PlaylistDetailUiState.Loaded] or [entry] is no longer present, matching
     * [AlbumDetailViewModel.buildQueueFrom]'s identical degrade.
     */
    suspend fun buildQueueFrom(entry: MusicPlaylistEntryUi): List<ResolvedPlayback> {
        val state = _uiState.value as? PlaylistDetailUiState.Loaded ?: return emptyList()
        val startIndex = state.entries.indexOfFirst { it.playlistItemId == entry.playlistItemId }
        if (startIndex == -1) return emptyList()
        val queueEntries = state.entries.subList(startIndex, state.entries.size)
        val tracks = queueEntries.map { it.toTrackUi() }
        val streamUrls = tracks.associate { it.id to musicRepository.trackStreamUrl(it.id) }
        return albumPlaybackQueue(
            tracks = tracks,
            streamUrls = streamUrls,
            artistName = null,
            albumName = state.playlistName,
            artworkUrl = null,
        )
    }

    /**
     * The playlist counterpart to [AlbumDetailViewModel.appendRemainingToQueue] — see that
     * method's own doc comment for the full "fetch in the background, after playback of the
     * loaded page has already started" reasoning, which this reuses unmodified via
     * [appendRemainingQueuePages]. [MusicRepository.playlistItems] pages in stored playlist
     * order, the same order [buildQueueFrom] already slices [PlaylistDetailUiState.Loaded.entries]
     * in, so a page fetched here continues that same order rather than restarting it.
     */
    suspend fun appendRemainingToQueue(onPage: suspend (List<ResolvedPlayback>) -> Unit) {
        val state = _uiState.value as? PlaylistDetailUiState.Loaded ?: return
        appendRemainingQueuePages(
            loadedCount = state.entries.size,
            total = state.total,
            fetchPage = { startIndex, limit ->
                when (val result = musicRepository.playlistItems(playlistId, startIndex = startIndex, limit = limit)) {
                    is PlaylistItemsPageResult.Loaded -> result.items.map { it.toUi().toTrackUi() }
                    is PlaylistItemsPageResult.Failed -> null
                }
            },
            toResolved = { pageTracks ->
                val streamUrls = pageTracks.associate { it.id to musicRepository.trackStreamUrl(it.id) }
                albumPlaybackQueue(
                    tracks = pageTracks,
                    streamUrls = streamUrls,
                    artistName = null,
                    albumName = state.playlistName,
                    artworkUrl = null,
                )
            },
            onPage = onPage,
        )
    }
}

/** Adapts one playlist entry to the shape [albumPlaybackQueue] expects — see
 * [PlaylistDetailViewModel]'s own doc comment for why that function is reused rather than
 * duplicated for playlists. [MusicTrackUi.position] is blank: a playlist has no disc/track
 * numbering of its own, unlike an album (see [MusicTrackUi.position]'s doc comment on
 * [AlbumDetailScreen]'s track rows, which this queue path never renders anyway).
 * [MusicPlaylistEntryUi.artistNames] carries straight through to [MusicTrackUi.artistNames] —
 * both are already the same "joined per-track `artistNames`, or null" shape, and a playlist is
 * exactly the case ([albumPlaybackQueue]'s own doc comment) where per-track artist matters most:
 * `buildQueueFrom`/`appendRemainingToQueue` below both pass `artistName = null` for the
 * queue-level fallback, since a playlist has no single header artist of its own, so a track with
 * no `artistNames` of its own degrades to a blank artist line rather than a wrong one. */
private fun MusicPlaylistEntryUi.toTrackUi(): MusicTrackUi =
    MusicTrackUi(
        id = trackId,
        title = title,
        position = "",
        durationSeconds = durationSeconds,
        artistNames = artistNames,
    )
