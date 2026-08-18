package net.develivarr.auralis.features.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.model.Library
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.settings.ServerConfigRepository
import net.develivarr.auralis.features.music.jellyfinItemArtworkUrl

private const val QUICK_PICK_COUNT = 8
private const val FAVORITE_ALBUMS_LIMIT = 20

sealed interface ForYouUiState {
    data object Loading : ForYouUiState

    /**
     * [allCarousels] is never re-filtered by fetching — [visibleCarousels]/[quickPicks] are
     * plain computed properties over [allCarousels] and [filter], so
     * [ForYouViewModel.selectFilter] only ever needs to update [filter] and this state updates
     * without a network round trip, mirroring web's `useMemo`-derived `visibleCarousels`/
     * `quickPicks` in `HomePage.tsx`.
     */
    data class Loaded(val allCarousels: List<FeedCarousel>, val filter: String = DEFAULT_FOR_YOU_FILTER) :
        ForYouUiState {
        val visibleCarousels: List<FeedCarousel> get() = filterCarousels(allCarousels, filter)
        val quickPicks: List<FeedItem> get() = buildQuickPicks(visibleCarousels, QUICK_PICK_COUNT)
    }

    data class Error(val message: String) : ForYouUiState
}

/** One source's fetch outcome: the carousels it produced (possibly none), and whether the fetch
 * itself failed rather than genuinely having nothing. [ForYouViewModel.load] only reports
 * [ForYouUiState.Error] when every source [failed] — one bad source degrades to "that carousel
 * doesn't appear", matching web's `HomePage.tsx` doc comment. */
private data class SourceResult(val carousels: List<FeedCarousel>, val failed: Boolean)

private val EMPTY_OK = SourceResult(emptyList(), failed = false)

/**
 * Loads the "For you" screen's feed (docs/ROADMAP.md §12d): the first book library's and first
 * podcast library's home shelves (Audiobookshelf), plus Jellyfin's favourite albums, stitched
 * into one uniform [FeedCarousel] list by the pure functions in `ForYouFeed.kt`.
 *
 * The three sources are fetched as **independent** `async` children, each with its own
 * `try`/`catch` *inside* the child rather than around the enclosing [coroutineScope] — a failing
 * `async` child cancels its parent and its siblings, so a catch on the outside would silently
 * lose the other sources' results too. This is the same fan-out shape
 * [net.develivarr.auralis.features.search.UnifiedSearchViewModel] uses for its own library/music
 * split. [ApiClient.execute] only ever throws [ApiException], so each catch is total.
 *
 * Cover URLs are resolved from [ServerConfigRepository.getBaseUrl] once per [load] call, not
 * per-composition — mirrors [HomeViewModel]'s own doc comment on why (it suspends, and the
 * value never changes for this ViewModel's lifetime). A `null` base URL (no server configured)
 * short-circuits straight to [ForYouUiState.Error] before any fetch, matching [HomeViewModel]'s
 * existing behaviour for the same condition.
 */
class ForYouViewModel(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<ForYouUiState>(ForYouUiState.Loading)
    val uiState: StateFlow<ForYouUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        val baseUrl = serverConfigRepository.getBaseUrl()
        if (baseUrl == null) {
            _uiState.value = ForYouUiState.Error("No Auralis server configured")
            return
        }

        // Sibling of (not a child inside) the coroutineScope below, mirroring
        // UnifiedSearchViewModel's providersDeferred: one small, cheap, shared precondition
        // (which library is the book/podcast library) for two otherwise fully independent
        // fetches. fetchLibrariesSafely swallows its own ApiException, so this can never fail
        // uncaught and never cancels a sibling.
        val librariesDeferred = viewModelScope.async { fetchLibrariesSafely() }

        coroutineScope {
            val booksDeferred =
                async { fetchAbsCarousel(librariesDeferred.await(), "book", baseUrl, ForYouContentType.BOOKS) }
            val podcastsDeferred =
                async {
                    fetchAbsCarousel(librariesDeferred.await(), "podcast", baseUrl, ForYouContentType.PODCASTS)
                }
            val musicDeferred = async { fetchMusicCarousel(baseUrl) }

            val books = booksDeferred.await()
            val podcasts = podcastsDeferred.await()
            val music = musicDeferred.await()

            _uiState.value =
                if (books.failed && podcasts.failed && music.failed) {
                    ForYouUiState.Error("Couldn't load your library.")
                } else {
                    ForYouUiState.Loaded(allCarousels = books.carousels + podcasts.carousels + music.carousels)
                }
        }
    }

    /** Wired to the screen's filter chip row. A no-op against [ForYouUiState.Loading]/
     * [ForYouUiState.Error] — a caller only ever presses a chip that's actually on screen, which
     * only renders once state is [ForYouUiState.Loaded]. */
    fun selectFilter(value: String) {
        val current = _uiState.value
        if (current !is ForYouUiState.Loaded) return
        _uiState.value = current.copy(filter = selectForYouFilter(current.filter, value))
    }

    private suspend fun fetchLibrariesSafely(): List<Library>? =
        try {
            apiClient.libraries()
        } catch (e: ApiException) {
            null
        }

    /** The book/podcast half of the fan-out. `null` [libraries] means the libraries call itself
     * failed (propagated as [SourceResult.failed]); an empty match (no library of [mediaType])
     * is not a failure, it's a server that genuinely has none. */
    private suspend fun fetchAbsCarousel(
        libraries: List<Library>?,
        mediaType: String,
        baseUrl: String,
        contentType: ForYouContentType,
    ): SourceResult {
        if (libraries == null) return SourceResult(emptyList(), failed = true)
        val library = libraries.firstOrNull { it.mediaType == mediaType } ?: return EMPTY_OK
        val homeCarousels =
            try {
                apiClient
                    .libraryHome(library.id)
                    .filter { it.items.isNotEmpty() }
                    .map { shelfToCarousel(it, contentType) { itemId -> mediaCoverUrl(baseUrl, itemId) } }
            } catch (e: ApiException) {
                // The home shelves call itself failed — nothing to append recommended shelves
                // to, and this source as a whole is failed. Distinct from the recommended-only
                // failure below, which must NOT flip this source to failed (see
                // fetchRecommendedCarousels's doc comment).
                return SourceResult(emptyList(), failed = true)
            }
        val recommendedCarousels = fetchRecommendedCarousels(library.id, baseUrl, contentType)
        return SourceResult(homeCarousels + recommendedCarousels, failed = false)
    }

    /**
     * Wave 13d's addition: `GET /libraries/{id}/recommended`, appended **after** [library]'s
     * home carousels rather than replacing them (`docs/ROADMAP.md` §13 — reversible, degrades to
     * today's behaviour on a cold-start user). A failure here degrades to "no recommended
     * carousel" rather than propagating as [SourceResult.failed] — the existing home shelves
     * must render even if this call fails or times out, so this function never throws and its
     * caller never treats it as the source's own failure. A cold-start `{"shelves":[]}` maps to
     * an empty list here, which [ForYouCarouselRow] already renders as nothing (see its own doc
     * comment) — the required "visual no-op", with no special-casing needed in this file.
     *
     * Wave 15d-1-books: uses [recommendedShelfToCarousel], **not** [shelfToCarousel] — this
     * route's items are [net.develivarr.auralis.data.model.RecommendedLibraryItem] (carrying
     * `availability`), a different type from [ApiClient.libraryHome]'s [Shelf]/[LibraryItem].
     */
    private suspend fun fetchRecommendedCarousels(
        libraryId: String,
        baseUrl: String,
        contentType: ForYouContentType,
    ): List<FeedCarousel> =
        try {
            apiClient
                .libraryRecommended(libraryId)
                .filter { it.items.isNotEmpty() }
                .map { recommendedShelfToCarousel(it, contentType) { itemId -> mediaCoverUrl(baseUrl, itemId) } }
        } catch (e: ApiException) {
            emptyList()
        }

    /** The Jellyfin half of the fan-out — one carousel ("Your albums") of favourite albums, or
     * none if there aren't any. `favoritesOnly = true` is also re-checked client-side, matching
     * web's `HomePage.tsx` defensive double filter. */
    private suspend fun fetchMusicCarousel(baseUrl: String): SourceResult =
        try {
            val albums = apiClient.jellyfinAlbums(favoritesOnly = true, limit = FAVORITE_ALBUMS_LIMIT).items.filter { it.favorite }
            if (albums.isEmpty()) {
                EMPTY_OK
            } else {
                SourceResult(
                    carousels =
                        listOf(
                            albumsToCarousel("music-favorite-albums", "Your albums", albums) { albumId ->
                                jellyfinItemArtworkUrl(baseUrl, albumId)
                            },
                        ),
                    failed = false,
                )
            }
        } catch (e: ApiException) {
            SourceResult(emptyList(), failed = true)
        }
}

/** Same shape as [net.develivarr.auralis.playback.BrowseTree]'s `toBrowseBook`/[HomeViewModel]'s own
 * `toUi` — the Audiobookshelf cover route, resized. */
private fun mediaCoverUrl(
    baseUrl: String,
    itemId: String,
): String = "${baseUrl.trimEnd('/')}/api/v1/media/$itemId/cover?width=200"
