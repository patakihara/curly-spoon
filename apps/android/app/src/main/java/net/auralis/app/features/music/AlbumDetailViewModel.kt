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
}

/**
 * Pure mapping from a slice of an album's tracks to the [ResolvedPlayback] queue Media3 plays —
 * kept free of `ViewModel`/network types so it's directly unit-testable, per this project's
 * "prefer a pure function over asserting through a ViewModel" house style. [streamUrls] is a
 * pre-fetched `id -> url` map rather than a suspend lookup here, for the same reason; a track
 * missing its own entry is dropped ([mapNotNull]) rather than played with a blank URI — total,
 * matching every other queue/browse builder in this app degrading rather than throwing.
 *
 * [artistName]/[albumName]/[artworkUrl] are the *album's* own values, applied to every track in
 * the queue — there is no separate per-track artist/artwork concept here, matching
 * [AlbumDetailUiState.Loaded]'s own header fields and
 * `apps/web/src/features/music/MusicAlbumPage.tsx`'s identical choice to display the page-level
 * artist/cover for whichever track is playing, not a per-track one Jellyfin's `/tracks` response
 * doesn't reliably carry
 * anyway (a compilation album's tracks can each have their own `artistNames`, but this app has no
 * UI yet that would make a per-track artist visible, so there's nothing to lose by not reading
 * it). `mediaId` is prefixed `track:` — distinct from [net.auralis.app.playback.BrowseIds]'s
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
            artist = artistName,
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
    )

private fun trackPosition(
    discNumber: Int?,
    trackNumber: Int?,
): String {
    if (trackNumber == null) return ""
    return if (discNumber != null && discNumber > 1) "$discNumber.$trackNumber" else trackNumber.toString()
}
