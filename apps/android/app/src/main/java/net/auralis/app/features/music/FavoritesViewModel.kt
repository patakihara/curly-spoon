package net.auralis.app.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.model.JellyfinTrack
import net.auralis.app.data.settings.ServerConfigRepository
import kotlin.math.roundToLong

/** One favourited track row on [FavoritesScreen] — distinct from [MusicTrackUi] (an album's own
 * track, which carries a disc/track [MusicTrackUi.position] this screen has no use for) and
 * [MusicSearchTrackUi] (a search hit, which carries no [favorite] state). Tapping one opens its
 * album, same as [MusicSearchScreen]'s identical track rows — this screen has no standalone
 * single-track player entry point either, matching
 * `apps/web/src/features/music/MusicFavoritesPage.tsx`'s identical choice. */
data class MusicFavoriteTrackUi(
    val id: String,
    val title: String,
    val artistNames: String?,
    val albumId: String?,
    val durationSeconds: Long,
    val favorite: Boolean,
)

private fun JellyfinTrack.toFavoriteTrackUi(): MusicFavoriteTrackUi =
    MusicFavoriteTrackUi(
        id = id,
        title = name,
        artistNames = artistNames.joinToString(", ").takeIf { it.isNotBlank() },
        albumId = albumId,
        durationSeconds = (durationSeconds ?: 0.0).roundToLong(),
        favorite = favorite,
    )

/**
 * Favourited artists, albums and tracks (`music/favorites`) — three independent listings, not
 * one merged one: Jellyfin has no single "all my favourites" endpoint, only three separate
 * `favoritesOnly` filters on `/jellyfin/artists|albums|tracks` (see [MusicRepository.artists]/
 * [MusicRepository.albums]/[MusicRepository.tracks]' own `favoritesOnly` parameter), and merging
 * them would need to invent a display order across three unrelated item kinds Jellyfin itself
 * doesn't provide — the same reasoning `apps/web/src/features/music/MusicFavoritesPage.tsx`'s own
 * doc comment gives for its identical three-section shape, which this class mirrors.
 *
 * Unlike [MusicLibraryViewModel], there is no pagination here: a favourites list is expected to
 * be far smaller than a full library browse, and the web reference implementation doesn't
 * paginate this view either — one [MUSIC_PAGE_SIZE]-sized page per section is enough for this
 * wave. [MusicRepository.availability] is still checked first, same reasoning as
 * [MusicLibraryViewModel.load]'s own doc comment: a standing precondition, not a per-request
 * outcome.
 */
class FavoritesViewModel(
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<FavoritesUiState>(FavoritesUiState.Loading)
    val uiState: StateFlow<FavoritesUiState> = _uiState.asStateFlow()

    private var cachedBaseUrl: String? = null

    fun load() {
        _uiState.value = FavoritesUiState.Loading
        viewModelScope.launch {
            cachedBaseUrl = serverConfigRepository.getBaseUrl()
            when (val availability = musicRepository.availability()) {
                is MusicAvailability.Available -> loadFavorites()
                is MusicAvailability.Unconfigured -> _uiState.value = FavoritesUiState.Unconfigured
                is MusicAvailability.Failed ->
                    _uiState.value = FavoritesUiState.Failed(musicErrorMessage(availability.code))
            }
        }
    }

    /** Fetches all three sections sequentially, not concurrently — the same reasoning
     * [AlbumDetailViewModel.fetchAlbumFavorite]'s own doc comment gives for its identical
     * "sequential, not concurrent" choice: three genuinely concurrent requests from this method
     * would be exactly the race `MockWebServer`'s FIFO-by-arrival dispatcher trap needs a keyed
     * `Dispatcher` to test correctly, for no benefit here (this screen has no loading-spinner
     * requirement finer than "the whole thing is ready"). The first section to fail short-
     * circuits the rest — an already-known-failed screen has no reason to spend two more
     * requests before reporting it — and its code wins the whole screen's
     * [FavoritesUiState.Failed], matching `apps/web/src/features/music/MusicFavoritesPage.tsx`'s
     * own `anyError` check, which treats the three sections as a single loading unit rather than
     * three independently-retryable ones.
     */
    private suspend fun loadFavorites() {
        val artistsResult = musicRepository.artists(favoritesOnly = true, limit = MUSIC_PAGE_SIZE)
        val artists = artistsResult as? ArtistsPageResult.Loaded
        if (artists == null) {
            _uiState.value = FavoritesUiState.Failed(musicErrorMessage((artistsResult as ArtistsPageResult.Failed).code))
            return
        }
        val albumsResult = musicRepository.albums(favoritesOnly = true, limit = MUSIC_PAGE_SIZE)
        val albums = albumsResult as? AlbumsPageResult.Loaded
        if (albums == null) {
            _uiState.value = FavoritesUiState.Failed(musicErrorMessage((albumsResult as AlbumsPageResult.Failed).code))
            return
        }
        val tracksResult = musicRepository.tracks(favoritesOnly = true, limit = MUSIC_PAGE_SIZE)
        val tracks = tracksResult as? TracksPageResult.Loaded
        if (tracks == null) {
            _uiState.value = FavoritesUiState.Failed(musicErrorMessage((tracksResult as TracksPageResult.Failed).code))
            return
        }
        _uiState.value =
            FavoritesUiState.Loaded(
                artists = artists.items.map { it.toUi(cachedBaseUrl) },
                albums = albums.items.map { it.toUi(cachedBaseUrl) },
                tracks = tracks.items.map { it.toFavoriteTrackUi() },
            )
    }

    // See AlbumDetailViewModel.favoriteGeneration/toggleFavorite for the full correctness
    // argument this reuses verbatim, applied here to a favourites listing's own three item
    // kinds instead of a track list plus one album id.
    private val favoriteGeneration = mutableMapOf<String, Int>()

    /** Toggles one artist's favourite state in place — does *not* remove it from the loaded list
     * on unfavoriting, matching `apps/web/src/features/music/FavoriteToggle.tsx`'s own mutation
     * (a plain in-cache flip; the item only actually leaves the list once that query next
     * refetches). Removing it immediately here would need this list to re-derive itself from a
     * mutated copy mid-render, which is more machinery than this wave's favourites screen needs
     * for a state a user can already see has changed (the toggle's own label already reads
     * "Add … to favourites" once flipped). */
    fun toggleArtistFavorite(artistId: String) {
        val current = _uiState.value as? FavoritesUiState.Loaded ?: return
        val artist = current.artists.firstOrNull { it.id == artistId } ?: return
        toggleFavorite(artistId, artist.favorite) { favorite ->
            val state = _uiState.value as? FavoritesUiState.Loaded ?: return@toggleFavorite
            _uiState.value =
                state.copy(artists = state.artists.map { if (it.id == artistId) it.copy(favorite = favorite) else it })
        }
    }

    /** See [toggleArtistFavorite]'s doc comment — identical shape, for one album. */
    fun toggleAlbumFavorite(albumId: String) {
        val current = _uiState.value as? FavoritesUiState.Loaded ?: return
        val album = current.albums.firstOrNull { it.id == albumId } ?: return
        toggleFavorite(albumId, album.favorite) { favorite ->
            val state = _uiState.value as? FavoritesUiState.Loaded ?: return@toggleFavorite
            _uiState.value =
                state.copy(albums = state.albums.map { if (it.id == albumId) it.copy(favorite = favorite) else it })
        }
    }

    /** See [toggleArtistFavorite]'s doc comment — identical shape, for one track. */
    fun toggleTrackFavorite(trackId: String) {
        val current = _uiState.value as? FavoritesUiState.Loaded ?: return
        val track = current.tracks.firstOrNull { it.id == trackId } ?: return
        toggleFavorite(trackId, track.favorite) { favorite ->
            val state = _uiState.value as? FavoritesUiState.Loaded ?: return@toggleFavorite
            _uiState.value =
                state.copy(tracks = state.tracks.map { if (it.id == trackId) it.copy(favorite = favorite) else it })
        }
    }

    /** See [AlbumDetailViewModel.toggleFavorite]'s doc comment for the full optimistic-update/
     * rollback correctness argument this reuses verbatim. */
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
}

/** [FavoritesScreen]'s own state — four distinct cases, none rendered as an error except
 * [Failed]. See [MusicAvailabilityUiState]'s doc comment for the identical
 * "[Unconfigured] is calm, not an error" reasoning applied here. */
sealed interface FavoritesUiState {
    data object Loading : FavoritesUiState

    data object Unconfigured : FavoritesUiState

    data class Failed(val message: String) : FavoritesUiState

    data class Loaded(
        val artists: List<MusicArtistUi>,
        val albums: List<MusicAlbumUi>,
        val tracks: List<MusicFavoriteTrackUi>,
    ) : FavoritesUiState {
        val isEmpty: Boolean get() = artists.isEmpty() && albums.isEmpty() && tracks.isEmpty()
    }
}
