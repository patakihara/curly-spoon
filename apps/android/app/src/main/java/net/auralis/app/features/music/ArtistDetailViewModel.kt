package net.auralis.app.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.auralis.app.data.settings.ServerConfigRepository

/** Upstream error code for "no Jellyfin server connected" — see `MusicRepository.availability`'s
 * doc comment on [MusicAvailability.Unconfigured]. [ArtistDetailViewModel]/[AlbumDetailViewModel]
 * never call `availability()` themselves (unlike [MusicLibraryViewModel]'s screen-entry check —
 * see that class's own doc comment on why it's checked once, there): a detail screen's own first
 * page fetch already answers "is Jellyfin usable" for free, so this constant is what lets that
 * fetch's own [ArtistsPageResult.Failed]/[AlbumsPageResult.Failed]/[TracksPageResult.Failed]
 * still land on the calm, no-retry-button empty state rather than the scarier error one. */
internal const val JELLYFIN_NOT_CONFIGURED_CODE = "jellyfin_not_configured"

sealed interface ArtistDetailUiState {
    data object Loading : ArtistDetailUiState

    /** See [JELLYFIN_NOT_CONFIGURED_CODE]'s doc comment. */
    data object Unconfigured : ArtistDetailUiState

    data class Failed(val message: String) : ArtistDetailUiState

    data class Loaded(
        /** Derived from the first loaded album's own `artistName`, not a dedicated
         * single-artist fetch — there is no `GET /jellyfin/artists/:id` route for this app to
         * call (`apps/server/src/routes/jellyfin.ts` only exposes list routes). Mirrors
         * `apps/web/src/features/music/MusicAlbumPage.tsx`'s identical fallback for an album's
         * own name/artist, which has the same "no single-item route" gap. Falls back to
         * "Artist" if the artist has no albums to derive a name from. */
        val artistName: String,
        val albums: List<MusicAlbumUi>,
        val total: Int,
        val loadingMore: Boolean = false,
    ) : ArtistDetailUiState {
        val hasMore: Boolean get() = hasMoreMusicPages(albums.size, total)
    }
}

/**
 * Backs [ArtistDetailScreen]: one artist's albums, paginated. The Jellyfin-music sibling of
 * [net.auralis.app.features.podcasts.PodcastDetailViewModel], scoped down to a single list
 * (an artist has albums; a podcast has episodes) rather than a metadata-plus-list shape,
 * since there is no per-artist metadata beyond the name itself for this app to show yet
 * (no overview/bio field is surfaced by [net.auralis.app.data.model.JellyfinArtist] on this
 * screen — [MusicRepository]'s `JellyfinArtist.overview` exists but nothing here reads it,
 * matching this wave's scope: browse only, no artist-bio treatment asked for).
 */
class ArtistDetailViewModel(
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
    private val artistId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow<ArtistDetailUiState>(ArtistDetailUiState.Loading)
    val uiState: StateFlow<ArtistDetailUiState> = _uiState.asStateFlow()

    private var cachedBaseUrl: String? = null

    fun load() {
        _uiState.value = ArtistDetailUiState.Loading
        viewModelScope.launch {
            cachedBaseUrl = serverConfigRepository.getBaseUrl()
            when (val result = musicRepository.albums(artistId = artistId, startIndex = 0, limit = MUSIC_PAGE_SIZE)) {
                is AlbumsPageResult.Loaded -> {
                    val albums = result.items.map { it.toUi(cachedBaseUrl) }
                    _uiState.value =
                        ArtistDetailUiState.Loaded(
                            artistName = albums.firstOrNull()?.artistName ?: "Artist",
                            albums = albums,
                            total = result.total,
                        )
                }
                is AlbumsPageResult.Failed ->
                    _uiState.value =
                        if (result.code == JELLYFIN_NOT_CONFIGURED_CODE) {
                            ArtistDetailUiState.Unconfigured
                        } else {
                            ArtistDetailUiState.Failed(musicErrorMessage(result.code))
                        }
            }
        }
    }

    /** See [MusicLibraryViewModel.loadMoreArtists] — identical shape and identical
     * failed-load-more degrade (keep the list, stop the spinner, let "Load more" retry). */
    fun loadMoreAlbums() {
        val current = _uiState.value as? ArtistDetailUiState.Loaded ?: return
        if (current.loadingMore || !current.hasMore) return
        _uiState.value = current.copy(loadingMore = true)
        viewModelScope.launch {
            when (
                val result =
                    musicRepository.albums(artistId = artistId, startIndex = current.albums.size, limit = MUSIC_PAGE_SIZE)
            ) {
                is AlbumsPageResult.Loaded ->
                    _uiState.value =
                        current.copy(
                            albums = current.albums + result.items.map { it.toUi(cachedBaseUrl) },
                            total = result.total,
                            loadingMore = false,
                        )
                is AlbumsPageResult.Failed -> _uiState.value = current.copy(loadingMore = false)
            }
        }
    }
}
