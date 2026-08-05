package net.auralis.app.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.auralis.app.data.model.JellyfinTrack
import net.auralis.app.data.settings.ServerConfigRepository
import net.auralis.app.playback.ResolvedPlayback
import kotlin.math.roundToLong

/**
 * Jellyfin's `ItemSortBy` value for "disc number, then track number" — passed through verbatim
 * by [net.auralis.app.data.network.ApiClient.jellyfinTracks]'s own `sortBy` parameter (see
 * `MusicRepository.tracks`'s doc comment: "parameter meaning" links straight to that client
 * method, which never interprets `sortBy` itself). Requested explicitly here rather than left
 * at the BFF's default `SortName` (which `apps/web/src/api/queries.ts`'s
 * `useJellyfinTracksQuery` currently does) — `SortName` sorts tracks alphabetically by title,
 * not by where they sit on the album, so it doesn't satisfy this screen's own "tracks, in
 * order" requirement. Named track/disc-number fields already exist on [JellyfinTrack] for
 * exactly this; asking Jellyfin to do the ordering is one query parameter, not client-side
 * sorting this class would otherwise have to duplicate per page.
 */
private const val TRACK_ORDER_SORT_BY = "ParentIndexNumber,IndexNumber"

/** One track row on [AlbumDetailScreen]. [position] mirrors
 * `apps/web/src/features/music/MusicAlbumPage.tsx`'s `trackPosition`: "N" for a single-disc
 * album, "D.N" once a second disc is present, blank if Jellyfin never populated a track number
 * at all. */
data class MusicTrackUi(
    val id: String,
    val title: String,
    val position: String,
    val durationSeconds: Long,
    /** Defaults `false` so [AlbumPlaybackQueueTest]'s pre-existing constructions (queueing
     * logic, which never touches favourite state) don't all need updating for a field they
     * don't exercise — same reasoning as [net.auralis.app.data.model.JellyfinArtist.favorite]'s
     * doc comment. */
    val favorite: Boolean = false,
    /** This track's own `Jellyfin.artistNames`, pre-joined (", "-separated) the same way
     * [MusicPlaylistEntryUi.artistNames]/`MusicSearchTrackUi.artistNames` already join theirs —
     * `null` when Jellyfin never populated it for this track. Fixes a real bug: every queued
     * track used to carry the *album's* artist regardless of its own, so a compilation or
     * various-artists album credited the wrong person on the lock screen for every track but
     * one. See [albumPlaybackQueue]'s own doc comment for the fallback rule this feeds. Defaults
     * `null` for the same "don't touch every pre-existing test construction" reason [favorite]
     * does. */
    val artistNames: String? = null,
)

sealed interface AlbumDetailUiState {
    data object Loading : AlbumDetailUiState

    /** See [JELLYFIN_NOT_CONFIGURED_CODE]'s doc comment on [ArtistDetailViewModel]. */
    data object Unconfigured : AlbumDetailUiState

    data class Failed(val message: String) : AlbumDetailUiState

    data class Loaded(
        /** Derived from the first loaded track's own `albumName`/`artistNames` — there is no
         * `GET /jellyfin/albums/:id` route for this app to call, same gap
         * [ArtistDetailUiState.Loaded.artistName]'s doc comment describes, and the same
         * fallback `apps/web/src/features/music/MusicAlbumPage.tsx` already uses. */
        val albumName: String,
        val artistName: String?,
        val coverUrl: String?,
        val tracks: List<MusicTrackUi>,
        val total: Int,
        val loadingMore: Boolean = false,
        /** The *album's* own favourite state — distinct from any track's — fetched separately
         * in [AlbumDetailViewModel.load] via [MusicRepository.albums]' single-item `id` filter,
         * since `/jellyfin/tracks` carries no favourite flag for the album container itself.
         * Defaults `false` (never left unset) so a failed fetch of this one extra field degrades
         * to "not favourited" rather than blocking the rest of the page — see [load]'s own
         * comment on that fetch. */
        val albumFavorite: Boolean = false,
    ) : AlbumDetailUiState {
        val hasMore: Boolean get() = hasMoreMusicPages(tracks.size, total)
    }
}

/**
 * Backs [AlbumDetailScreen]: one album's tracks, in track order, paginated. The Jellyfin-music
 * sibling of [ArtistDetailViewModel] one level down — an artist has albums, an album has
 * tracks — and, like that class, calls no `availability()` precheck of its own; see
 * [ArtistDetailViewModel]'s own doc comment for why a detail screen's first page fetch already
 * answers that question for free.
 *
 * [buildQueueFrom] is the one playback-adjacent method here: it turns a tapped [MusicTrackUi]
 * into the [ResolvedPlayback] queue [net.auralis.app.features.player.PlayerViewModel.playQueue]
 * hands to Media3, using [MusicRepository.trackStreamUrl] — a pure URL builder, not a fetch, so
 * unlike an audiobook/podcast item a Jellyfin track needs no server-side "play session" round
 * trip before it's playable. See [albumPlaybackQueue]'s own doc comment for the actual queue
 * construction, kept as a pure function so it's testable without a `ViewModel`/`MockWebServer`.
 */
class AlbumDetailViewModel(
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
    private val albumId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow<AlbumDetailUiState>(AlbumDetailUiState.Loading)
    val uiState: StateFlow<AlbumDetailUiState> = _uiState.asStateFlow()

    private var cachedBaseUrl: String? = null

    fun load() {
        _uiState.value = AlbumDetailUiState.Loading
        viewModelScope.launch {
            cachedBaseUrl = serverConfigRepository.getBaseUrl()
            when (
                val result =
                    musicRepository.tracks(
                        albumId = albumId,
                        startIndex = 0,
                        limit = MUSIC_PAGE_SIZE,
                        sortBy = TRACK_ORDER_SORT_BY,
                    )
            ) {
                is TracksPageResult.Loaded -> {
                    val tracks = result.items.map { it.toTrackUi() }
                    val firstTrack = result.items.firstOrNull()
                    _uiState.value =
                        AlbumDetailUiState.Loaded(
                            albumName = firstTrack?.albumName ?: "Album",
                            artistName = firstTrack?.artistNames?.joinToString(", ")?.takeIf { it.isNotBlank() },
                            // Uses this ViewModel's own `albumId` (known from navigation), not a
                            // track's own `albumId` field — that way artwork still resolves even
                            // for a genuinely empty album, where there is no first track to read
                            // one from.
                            coverUrl = jellyfinItemArtworkUrl(cachedBaseUrl, albumId),
                            tracks = tracks,
                            total = result.total,
                            albumFavorite = fetchAlbumFavorite(),
                        )
                }
                is TracksPageResult.Failed ->
                    _uiState.value =
                        if (result.code == JELLYFIN_NOT_CONFIGURED_CODE) {
                            AlbumDetailUiState.Unconfigured
                        } else {
                            AlbumDetailUiState.Failed(musicErrorMessage(result.code))
                        }
            }
        }
    }

    /**
     * A second, sequential fetch of just this album's own favourite state, via
     * [MusicRepository.albums]' single-item `id` filter — the same "list filtered to one id"
     * shape `apps/web/src/api/queries.ts`'s `useJellyfinAlbumQuery` already uses for its own
     * header favourite toggle, since there is no dedicated single-album route (see
     * [ArtistDetailUiState.Loaded.artistName]'s doc comment on the same gap). Deliberately
     * sequential, run *after* the tracks page above has already landed in `_uiState` rather than
     * concurrently with it: `MockWebServer`'s default dispatcher hands out enqueued responses in
     * request-arrival order, not enqueue order, so two genuinely concurrent requests from this
     * method race unpredictably in a test — see `MusicSearchViewModelTest`'s
     * "a stale response for a superseded query" test for where that bit this project before.
     * Sequential avoids the whole class of bug for one extra field that isn't on the critical
     * path to showing the album's tracks. Degrades to `false` on any failure — a favourite-state
     * fetch failing must never block the rest of the page from loading.
     */
    private suspend fun fetchAlbumFavorite(): Boolean =
        when (val result = musicRepository.albums(id = albumId, limit = 1)) {
            is AlbumsPageResult.Loaded -> result.items.firstOrNull()?.favorite ?: false
            is AlbumsPageResult.Failed -> false
        }

    /** See [MusicLibraryViewModel.loadMoreArtists] — identical shape and identical
     * failed-load-more degrade. */
    fun loadMoreTracks() {
        val current = _uiState.value as? AlbumDetailUiState.Loaded ?: return
        if (current.loadingMore || !current.hasMore) return
        _uiState.value = current.copy(loadingMore = true)
        viewModelScope.launch {
            when (
                val result =
                    musicRepository.tracks(
                        albumId = albumId,
                        startIndex = current.tracks.size,
                        limit = MUSIC_PAGE_SIZE,
                        sortBy = TRACK_ORDER_SORT_BY,
                    )
            ) {
                is TracksPageResult.Loaded ->
                    _uiState.value =
                        current.copy(
                            tracks = current.tracks + result.items.map { it.toTrackUi() },
                            total = result.total,
                            loadingMore = false,
                        )
                is TracksPageResult.Failed -> _uiState.value = current.copy(loadingMore = false)
            }
        }
    }

    // One counter per item id (a track id, or this screen's own `albumId`) — bumped on every
    // toggle of that item, read back by [toggleFavorite]'s own coroutine to tell "nothing newer
    // has touched this item since I started" from "a later toggle has already taken over". See
    // [toggleFavorite]'s doc comment for the full correctness argument; this field only exists
    // because that argument needs somewhere to keep its bookkeeping.
    private val favoriteGeneration = mutableMapOf<String, Int>()

    /** Toggles favourite state for one of this album's tracks, by [trackId]. See
     * [toggleFavorite]'s doc comment for the optimistic-update/rollback guarantee this gives. */
    fun toggleTrackFavorite(trackId: String) {
        val current = _uiState.value as? AlbumDetailUiState.Loaded ?: return
        val track = current.tracks.firstOrNull { it.id == trackId } ?: return
        toggleFavorite(trackId, track.favorite) { favorite ->
            val state = _uiState.value as? AlbumDetailUiState.Loaded ?: return@toggleFavorite
            _uiState.value =
                state.copy(tracks = state.tracks.map { if (it.id == trackId) it.copy(favorite = favorite) else it })
        }
    }

    /** Toggles favourite state for the album itself (this screen's own `albumId`, its header
     * toggle — distinct from any one track's, see [AlbumDetailUiState.Loaded.albumFavorite]'s
     * doc comment). See [toggleFavorite]'s doc comment for the guarantee this gives. */
    fun toggleAlbumFavorite() {
        val current = _uiState.value as? AlbumDetailUiState.Loaded ?: return
        toggleFavorite(albumId, current.albumFavorite) { favorite ->
            val state = _uiState.value as? AlbumDetailUiState.Loaded ?: return@toggleFavorite
            _uiState.value = state.copy(albumFavorite = favorite)
        }
    }

    /**
     * Flips [itemId]'s favourite state from [currentFavorite] immediately (optimistic —
     * [applyFavorite] is called synchronously, before any suspension, so the UI updates on the
     * same frame as the tap), then calls [MusicRepository.setFavorite] and reconciles: on
     * success, [applyFavorite] is called again with the *server's* resulting state (normally the
     * same value, but see [net.auralis.app.data.model.JellyfinFavoriteResponse]'s doc comment for
     * why that isn't assumed); on failure, [applyFavorite] is called a second time with
     * [currentFavorite] to roll back.
     *
     * The rollback is only safe because of [favoriteGeneration]. Two overlapping toggles of the
     * *same* [itemId] (a double-tap, or a track row's toggle racing the album header's toggle of
     * the same underlying item id, though no call site here does that) would otherwise corrupt
     * each other: an earlier toggle's slow failure must not rewrite state a newer toggle has
     * already moved past — exactly the bug `apps/web/src/features/music/FavoriteToggle.tsx`'s own
     * mutation shipped once and a review caught (two overlapping mutations each snapshotting
     * state and rolling back unconditionally, so a first request failing after a second had
     * already written clobbered the second). This method captures its own generation number
     * before touching the map again, so a second call for the same [itemId] bumps the counter out
     * from under the first — both the success and the failure branches below re-check
     * [favoriteGeneration] immediately before writing and drop a stale write rather than apply
     * it, the same "capture a sequence number at launch, compare it at the write site" guarantee
     * [MusicSearchViewModel]'s own `searchSequence` field gives for a stale search response (see
     * that field's doc comment for why a plain field read at the write site holds regardless of
     * how two coroutines' resumptions actually interleave — the identical argument applies here).
     * The capture-and-bump above happens synchronously on the caller's thread (`viewModelScope`
     * is confined to `Dispatchers.Main`), so there is no window where two toggles could both read
     * the same "current" generation.
     */
    private fun toggleFavorite(
        itemId: String,
        currentFavorite: Boolean,
        applyFavorite: (Boolean) -> Unit,
    ) {
        val myGeneration = (favoriteGeneration[itemId] ?: 0) + 1
        favoriteGeneration[itemId] = myGeneration
        val optimisticFavorite = !currentFavorite
        applyFavorite(optimisticFavorite)
        viewModelScope.launch {
            when (val result = musicRepository.setFavorite(itemId, optimisticFavorite)) {
                is FavoriteToggleResult.Updated -> {
                    if (favoriteGeneration[itemId] != myGeneration) return@launch
                    applyFavorite(result.favorite)
                }
                is FavoriteToggleResult.Failed -> {
                    if (favoriteGeneration[itemId] != myGeneration) return@launch
                    applyFavorite(currentFavorite)
                }
            }
        }
    }

    /**
     * Builds the queue [net.auralis.app.features.player.PlayerViewModel.playQueue] should play
     * for a tap on [track]: that track and every track after it in the currently loaded page, in
     * track order — matching `apps/web/src/features/music/queue.ts`'s "click a row, play the
     * loaded page from there onward" behaviour, translated onto Media3's own native multi-item
     * queue instead of the single-file `startOffset` timeline the web player's
     * `HTMLMediaElement` needs (see that file's own doc comment for why the web side does it
     * differently). Not itself the pure part — [albumPlaybackQueue] is — because it has two
     * unavoidably impure jobs: reading current [uiState] and resolving each track's stream URL
     * through [musicRepository] (a suspend call, though [MusicRepository.trackStreamUrl] itself
     * never awaits a network response — see that method's own doc comment).
     *
     * Degrades to an empty list — never throws — when [uiState] isn't [AlbumDetailUiState.Loaded]
     * or [track] is no longer present (it left the loaded page between when its row was rendered
     * and tapped, e.g. mid [loadMoreTracks]); [PlayerViewModel.playQueue] already treats an empty
     * queue as "nothing to play" rather than starting playback with no items.
     */
    suspend fun buildQueueFrom(track: MusicTrackUi): List<ResolvedPlayback> {
        val state = _uiState.value as? AlbumDetailUiState.Loaded ?: return emptyList()
        val startIndex = state.tracks.indexOfFirst { it.id == track.id }
        if (startIndex == -1) return emptyList()
        val queueTracks = state.tracks.subList(startIndex, state.tracks.size)
        val streamUrls = queueTracks.associate { it.id to musicRepository.trackStreamUrl(it.id) }
        return albumPlaybackQueue(
            tracks = queueTracks,
            streamUrls = streamUrls,
            artistName = state.artistName,
            albumName = state.albumName,
            artworkUrl = state.coverUrl,
        )
    }

    /**
     * Fetches and hands over every track of this album beyond the page [buildQueueFrom] already
     * queued, one page at a time, via [appendRemainingQueuePages] — the cross-page half of
     * "play album" this wave adds. `PlayerViewModel.playQueue` calls this only *after* its
     * initial [buildQueueFrom] queue is already playing (see that method's own doc comment), so
     * a 60-track album starts on its first tapped track immediately and the remaining tracks
     * arrive into the live Media3 queue in the background rather than delaying playback start.
     *
     * Reads [uiState] once, at the moment this is called, to fix `loadedCount`/`total`/the
     * album's own artist-name/album-name/artwork — a page fetched here uses this snapshot even
     * if [loadMoreTracks] or a fresh [load] changes [uiState] afterwards, matching
     * [buildQueueFrom]'s own "queue frozen at tap time" behaviour rather than trying to track a
     * moving target. Degrades to nothing — never throws — when [uiState] isn't
     * [AlbumDetailUiState.Loaded], the same "no crash, no partial queue" degrade
     * [buildQueueFrom] already gives for a state that isn't loaded.
     */
    suspend fun appendRemainingToQueue(onPage: suspend (List<ResolvedPlayback>) -> Unit) {
        val state = _uiState.value as? AlbumDetailUiState.Loaded ?: return
        appendRemainingQueuePages(
            loadedCount = state.tracks.size,
            total = state.total,
            fetchPage = { startIndex, limit ->
                when (
                    val result =
                        musicRepository.tracks(
                            albumId = albumId,
                            startIndex = startIndex,
                            limit = limit,
                            sortBy = TRACK_ORDER_SORT_BY,
                        )
                ) {
                    is TracksPageResult.Loaded -> result.items.map { it.toTrackUi() }
                    is TracksPageResult.Failed -> null
                }
            },
            toResolved = { pageTracks ->
                val streamUrls = pageTracks.associate { it.id to musicRepository.trackStreamUrl(it.id) }
                albumPlaybackQueue(
                    tracks = pageTracks,
                    streamUrls = streamUrls,
                    artistName = state.artistName,
                    albumName = state.albumName,
                    artworkUrl = state.coverUrl,
                )
            },
            onPage = onPage,
        )
    }
}

/**
 * Pure mapping from a slice of an album's tracks to the [ResolvedPlayback] queue Media3 plays —
 * kept free of `ViewModel`/network types so it's directly unit-testable, per this project's
 * "prefer a pure function over asserting through a ViewModel" house style. [streamUrls] is a
 * pre-fetched `id -> url` map rather than a suspend lookup here, for the same reason; a track
 * missing its own entry is dropped ([mapNotNull]) rather than played with a blank URI — total,
 * matching every other queue/browse builder in this app degrading rather than throwing.
 *
 * [albumName]/[artworkUrl] are the *album's* (or playlist's) own values, applied to every track
 * in the queue — there is no per-track album/artwork concept, matching
 * [AlbumDetailUiState.Loaded]'s own header fields and
 * `apps/web/src/features/music/MusicAlbumPage.tsx`'s identical choice to display the page-level
 * cover for whichever track is playing. **Artist is different**: each queued item's `artist`
 * prefers [MusicTrackUi.artistNames] — the track's own Jellyfin `artistNames`, already joined —
 * and only falls back to the queue-level [artistName] when a track carries none of its own. A
 * compilation or various-artists album (or a multi-artist playlist) has tracks whose own artist
 * genuinely differs from the album/playlist header; crediting every track to the header artist
 * was a real bug (every lock-screen/notification/Android-Auto row for that track was wrong), not
 * a deliberate simplification — see [MusicTrackUi.artistNames]'s own doc comment. An empty
 * per-track artist is treated as worse than a slightly-too-broad one, hence the fallback rather
 * than leaving the line blank. `mediaId` is prefixed `track:` — distinct from
 * [net.auralis.app.playback.BrowseIds]'s
 * `book:`/`episode:` schemes, matching [net.auralis.app.playback.PlaybackItemResolver]'s own
 * `episodeMediaId` — even though nothing resolves a `track:` id back to a track today (Android
 * Auto browsing of music is a later wave), so collisions with a book/episode id already playing
 * are impossible by construction rather than by accident.
 */
fun albumPlaybackQueue(
    tracks: List<MusicTrackUi>,
    streamUrls: Map<String, String>,
    artistName: String?,
    albumName: String,
    artworkUrl: String?,
): List<ResolvedPlayback> =
    tracks.mapNotNull { track ->
        val streamUrl = streamUrls[track.id] ?: return@mapNotNull null
        ResolvedPlayback(
            mediaId = "track:${track.id}",
            uri = streamUrl,
            title = track.title,
            artist = track.artistNames ?: artistName,
            subtitle = albumName,
            artworkUrl = artworkUrl,
            startPositionMs = 0L,
        )
    }

private fun JellyfinTrack.toTrackUi(): MusicTrackUi =
    MusicTrackUi(
        id = id,
        title = name,
        position = trackPosition(discNumber, trackNumber),
        durationSeconds = (durationSeconds ?: 0.0).roundToLong(),
        favorite = favorite,
        artistNames = artistNames.joinToString(", ").takeIf { it.isNotBlank() },
    )

private fun trackPosition(
    discNumber: Int?,
    trackNumber: Int?,
): String {
    if (trackNumber == null) return ""
    return if (discNumber != null && discNumber > 1) "$discNumber.$trackNumber" else trackNumber.toString()
}
