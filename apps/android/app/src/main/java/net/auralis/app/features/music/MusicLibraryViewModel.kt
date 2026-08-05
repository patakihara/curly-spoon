package net.auralis.app.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.settings.ServerConfigRepository

/** Whether a Jellyfin server is reachable at all — checked once, on screen entry, via
 * [MusicRepository.availability]. See that method's own doc comment for why this is a
 * standing precondition rather than a per-request outcome. */
sealed interface MusicAvailabilityUiState {
    data object Loading : MusicAvailabilityUiState

    data object Available : MusicAvailabilityUiState

    /** Nothing is wrong — there is just no Jellyfin server connected yet. Rendered as a calm
     * empty state, never as an error, and never with a retry button: retrying an unconfigured
     * server cannot succeed until the user connects one from the web app (see
     * [musicErrorMessage]'s doc comment for why this app builds no connect form itself). */
    data object Unconfigured : MusicAvailabilityUiState

    data class Failed(val message: String) : MusicAvailabilityUiState
}

/** The artists section's own load state — independent of [AlbumsSectionUiState], the same way
 * `MyPodcastsUiState`/`DirectorySearchUiState` are independent sections of one
 * `PodcastsUiState`. */
sealed interface ArtistsSectionUiState {
    data object Loading : ArtistsSectionUiState

    data class Failed(val message: String) : ArtistsSectionUiState

    data class Loaded(
        val items: List<MusicArtistUi>,
        val total: Int,
        /** True while a [MusicLibraryViewModel.loadMoreArtists] page fetch is in flight — the
         * list already in [items] stays on screen underneath a small inline spinner rather
         * than being replaced by a full-screen [Loading]. */
        val loadingMore: Boolean = false,
    ) : ArtistsSectionUiState {
        val hasMore: Boolean get() = hasMoreMusicPages(items.size, total)
    }
}

/** The albums section's own load state. See [ArtistsSectionUiState]'s doc comment. */
sealed interface AlbumsSectionUiState {
    data object Loading : AlbumsSectionUiState

    data class Failed(val message: String) : AlbumsSectionUiState

    data class Loaded(
        val items: List<MusicAlbumUi>,
        val total: Int,
        val loadingMore: Boolean = false,
    ) : AlbumsSectionUiState {
        val hasMore: Boolean get() = hasMoreMusicPages(items.size, total)
    }
}

data class MusicLibraryUiState(
    val availability: MusicAvailabilityUiState = MusicAvailabilityUiState.Loading,
    val artistsState: ArtistsSectionUiState = ArtistsSectionUiState.Loading,
    val albumsState: AlbumsSectionUiState = AlbumsSectionUiState.Loading,
)

/**
 * Backs [MusicLibraryScreen]: the top-level music browse entry point — every artist and every
 * album in the connected Jellyfin library, each its own paginated section within one screen.
 * Mirrors `apps/web/src/features/music/MusicHomePage.tsx`'s two-list shape, folded into
 * [MusicLibraryUiState]'s two independent sub-states the same way `PodcastsUiState` folds its
 * "My podcasts" and "search" sections together.
 *
 * [MusicRepository.availability] is checked exactly once, in [load] — a standing precondition
 * for the whole screen, not something re-checked per section or per page (see that method's own
 * doc comment). Only once it reports [net.auralis.app.features.music.MusicAvailability.Available]
 * do the artists and albums pages get fetched at all; [MusicAvailabilityUiState.Unconfigured]
 * short-circuits both sections into "nothing to load" rather than issuing a request that would
 * fail anyway.
 */
class MusicLibraryViewModel(
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MusicLibraryUiState())
    val uiState: StateFlow<MusicLibraryUiState> = _uiState.asStateFlow()

    private var cachedBaseUrl: String? = null

    /** Loads (or reloads, e.g. on retry) everything this screen shows: availability, then —
     * only if available — the first page of artists and the first page of albums. */
    fun load() {
        _uiState.value = MusicLibraryUiState()
        viewModelScope.launch {
            cachedBaseUrl = serverConfigRepository.getBaseUrl()
            when (val availability = musicRepository.availability()) {
                is MusicAvailability.Available -> {
                    _uiState.value = _uiState.value.copy(availability = MusicAvailabilityUiState.Available)
                    loadFirstArtistsPage()
                    loadFirstAlbumsPage()
                }
                // Neither section's own state is touched here — [MusicLibraryScreen] only
                // renders them once `availability` is `Available`, so leaving them at their
                // initial `Loading` (never resolved, never rendered) is correct: no artists/
                // albums request is made at all, matching this method's own doc comment on
                // why `Unconfigured` short-circuits both sections.
                is MusicAvailability.Unconfigured ->
                    _uiState.value = _uiState.value.copy(availability = MusicAvailabilityUiState.Unconfigured)
                is MusicAvailability.Failed ->
                    _uiState.value =
                        _uiState.value.copy(
                            availability = MusicAvailabilityUiState.Failed(musicErrorMessage(availability.code)),
                        )
            }
        }
    }

    private suspend fun loadFirstArtistsPage() {
        when (val result = musicRepository.artists(startIndex = 0, limit = MUSIC_PAGE_SIZE)) {
            is ArtistsPageResult.Loaded ->
                _uiState.value =
                    _uiState.value.copy(
                        artistsState =
                            ArtistsSectionUiState.Loaded(
                                items = result.items.map { it.toUi(cachedBaseUrl) },
                                total = result.total,
                            ),
                    )
            is ArtistsPageResult.Failed ->
                _uiState.value =
                    _uiState.value.copy(artistsState = ArtistsSectionUiState.Failed(musicErrorMessage(result.code)))
        }
    }

    private suspend fun loadFirstAlbumsPage() {
        when (val result = musicRepository.albums(startIndex = 0, limit = MUSIC_PAGE_SIZE)) {
            is AlbumsPageResult.Loaded ->
                _uiState.value =
                    _uiState.value.copy(
                        albumsState =
                            AlbumsSectionUiState.Loaded(
                                items = result.items.map { it.toUi(cachedBaseUrl) },
                                total = result.total,
                            ),
                    )
            is AlbumsPageResult.Failed ->
                _uiState.value =
                    _uiState.value.copy(albumsState = AlbumsSectionUiState.Failed(musicErrorMessage(result.code)))
        }
    }

    /** Re-issues the artists section's first-page load after [ArtistsSectionUiState.Failed] —
     * [loadMoreArtists] cannot do this itself: it starts from `_uiState.value.artistsState as?
     * ArtistsSectionUiState.Loaded ?: return`, so on a `Failed` first page it is a silent no-op
     * (no request, no spinner, no state change) rather than a retry. Wired to
     * [MusicLibraryScreen]'s "Retry" button in the artists section's `Failed` branch; the
     * `Loaded`-section "Load more" row keeps using [loadMoreArtists], unchanged. */
    fun retryArtists() {
        _uiState.value = _uiState.value.copy(artistsState = ArtistsSectionUiState.Loading)
        viewModelScope.launch { loadFirstArtistsPage() }
    }

    /** See [retryArtists] — identical shape, for the albums section. */
    fun retryAlbums() {
        _uiState.value = _uiState.value.copy(albumsState = AlbumsSectionUiState.Loading)
        viewModelScope.launch { loadFirstAlbumsPage() }
    }

    /** Fetches the next page of artists and appends it. A no-op if the current state isn't a
     * [ArtistsSectionUiState.Loaded] with more pages left, or if a page fetch is already in
     * flight — both defensive guards against a double-tap, not reachable UI paths on their own
     * ([MusicLibraryScreen] only shows a "Load more" row when [ArtistsSectionUiState.Loaded
     * .hasMore] is true and [ArtistsSectionUiState.Loaded.loadingMore] is false). */
    fun loadMoreArtists() {
        val current = _uiState.value.artistsState as? ArtistsSectionUiState.Loaded ?: return
        if (current.loadingMore || !current.hasMore) return
        _uiState.value = _uiState.value.copy(artistsState = current.copy(loadingMore = true))
        viewModelScope.launch {
            when (val result = musicRepository.artists(startIndex = current.items.size, limit = MUSIC_PAGE_SIZE)) {
                is ArtistsPageResult.Loaded ->
                    _uiState.value =
                        _uiState.value.copy(
                            artistsState =
                                ArtistsSectionUiState.Loaded(
                                    items = current.items + result.items.map { it.toUi(cachedBaseUrl) },
                                    total = result.total,
                                ),
                        )
                // A failed load-more keeps the already-loaded items on screen and just stops the
                // spinner, rather than replacing a populated list with a full-screen error — the
                // user can tap "Load more" again, which retries this same call.
                is ArtistsPageResult.Failed ->
                    _uiState.value = _uiState.value.copy(artistsState = current.copy(loadingMore = false))
            }
        }
    }

    /** See [loadMoreArtists] — identical shape, for the albums section. */
    fun loadMoreAlbums() {
        val current = _uiState.value.albumsState as? AlbumsSectionUiState.Loaded ?: return
        if (current.loadingMore || !current.hasMore) return
        _uiState.value = _uiState.value.copy(albumsState = current.copy(loadingMore = true))
        viewModelScope.launch {
            when (val result = musicRepository.albums(startIndex = current.items.size, limit = MUSIC_PAGE_SIZE)) {
                is AlbumsPageResult.Loaded ->
                    _uiState.value =
                        _uiState.value.copy(
                            albumsState =
                                AlbumsSectionUiState.Loaded(
                                    items = current.items + result.items.map { it.toUi(cachedBaseUrl) },
                                    total = result.total,
                                ),
                        )
                is AlbumsPageResult.Failed ->
                    _uiState.value = _uiState.value.copy(albumsState = current.copy(loadingMore = false))
            }
        }
    }
}
