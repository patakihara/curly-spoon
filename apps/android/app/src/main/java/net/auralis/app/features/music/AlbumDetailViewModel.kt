package net.auralis.app.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.auralis.app.data.model.JellyfinTrack
import net.auralis.app.data.settings.ServerConfigRepository
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
 * Playback is explicitly out of scope for this wave — track rows exist to be seen, not
 * tapped. Wiring Jellyfin into Media3 is a later wave; see `MusicRepository.trackStreamUrl`'s
 * own doc comment for the stream-URL builder this screen deliberately does not call yet.
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
