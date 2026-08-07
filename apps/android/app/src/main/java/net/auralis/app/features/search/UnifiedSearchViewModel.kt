package net.auralis.app.features.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.model.LibraryItem
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.settings.ServerConfigRepository
import net.auralis.app.features.music.JELLYFIN_NOT_CONFIGURED_CODE
import net.auralis.app.features.music.MusicAlbumUi
import net.auralis.app.features.music.MusicArtistUi
import net.auralis.app.features.music.MusicRepository
import net.auralis.app.features.music.MusicSearchResult
import net.auralis.app.features.music.MusicSearchTrackUi
import net.auralis.app.features.music.musicErrorMessage
import net.auralis.app.features.music.toSearchUi
import net.auralis.app.features.music.toUi

/** How long [UnifiedSearchViewModel.onQueryChange] waits, after the most recent keystroke,
 * before firing the whole fan-out (one call per book/podcast library, plus one Jellyfin
 * search). Mirrors [net.auralis.app.features.music.MUSIC_SEARCH_DEBOUNCE_MS] — the only other
 * debounced-as-you-type search in this app — rather than inventing a new number: web's
 * `SearchPage.tsx` does not debounce its own library/Jellyfin fan-out at all (it relies on
 * react-query's request de-duplication instead, which this app's plain `ApiClient` has no
 * equivalent of), so there is no web value to match here; the existing Android convention is
 * the more relevant one to follow. */
internal const val UNIFIED_SEARCH_DEBOUNCE_MS = 400L

/** One book (or, more precisely, one Audiobookshelf library item scoped to a `book` library) on
 * [UnifiedSearchScreen]. There is no book-detail route anywhere in this app yet (checked
 * `AuralisNavHost.kt`'s `Routes` object — only [net.auralis.app.navigation.Routes.podcastDetail]
 * exists among library-item detail routes), so a row of this shape renders inert: see
 * [UnifiedSearchScreen]'s own doc comment. */
data class SearchBookUi(val id: String, val title: String, val subtitle: String?, val coverUrl: String?)

/** One podcast show on [UnifiedSearchScreen] — unlike [SearchBookUi], this kind *does* have a
 * detail route ([net.auralis.app.navigation.Routes.podcastDetail]), so it navigates. */
data class SearchPodcastUi(val id: String, val title: String, val coverUrl: String?)

/** One series on [UnifiedSearchScreen]. No `/series/:id` route exists on Android yet (12c-1's
 * series/author pages are a web-only wave so far), so this renders inert. */
data class SearchSeriesUi(val id: String, val name: String)

/** One author on [UnifiedSearchScreen]. See [SearchSeriesUi]'s doc comment — same reasoning,
 * no `/author/:id` route exists. */
data class SearchAuthorUi(val id: String, val name: String)

sealed interface UnifiedSearchResultsUiState {
    /** Nothing has been typed (or the field was cleared) — an inviting empty state, not "no
     * results", since no search has actually run yet. */
    data object Idle : UnifiedSearchResultsUiState

    /** The debounce has elapsed and the fan-out is in flight. */
    data object Searching : UnifiedSearchResultsUiState

    /**
     * A settled search. Every list defaults to empty so a caller only names what it has, and
     * [isEmpty] covers "nothing anywhere", mirroring
     * [net.auralis.app.features.music.MusicSearchResultsUiState.Results]'s identical shape.
     *
     * The library side (books/series/authors/podcasts) and the music side degrade
     * independently — a Jellyfin outage must never blank the book results a user with no music
     * server at all is entitled to see, and vice versa. [libraryError]/[musicError] are which
     * side (if either) failed outright; [musicUnconfigured] is the calm "no Jellyfin connected"
     * case, deliberately distinct from an actual failure — the same distinction
     * [net.auralis.app.features.music.MusicSearchResultsUiState.Unconfigured] already makes for
     * the plain music-only search screen.
     */
    data class Results(
        val books: List<SearchBookUi> = emptyList(),
        val series: List<SearchSeriesUi> = emptyList(),
        val authors: List<SearchAuthorUi> = emptyList(),
        val podcasts: List<SearchPodcastUi> = emptyList(),
        val artists: List<MusicArtistUi> = emptyList(),
        val albums: List<MusicAlbumUi> = emptyList(),
        val tracks: List<MusicSearchTrackUi> = emptyList(),
        val libraryError: String? = null,
        val musicError: String? = null,
        val musicUnconfigured: Boolean = false,
    ) : UnifiedSearchResultsUiState {
        val isEmpty: Boolean
            get() =
                books.isEmpty() && series.isEmpty() && authors.isEmpty() && podcasts.isEmpty() &&
                    artists.isEmpty() && albums.isEmpty() && tracks.isEmpty()
    }
}

data class UnifiedSearchUiState(
    /** The live text field contents — updated synchronously on every keystroke, independent of
     * [resultsState], which only moves once the debounce settles. See
     * [net.auralis.app.features.music.MusicSearchUiState.query]'s identical doc comment. */
    val query: String = "",
    val filters: SearchFilterState = DEFAULT_SEARCH_FILTER_STATE,
    val resultsState: UnifiedSearchResultsUiState = UnifiedSearchResultsUiState.Idle,
)

/**
 * Backs [UnifiedSearchScreen]: the Android counterpart to
 * `apps/web/src/features/search/SearchPage.tsx`'s library half (docs/ROADMAP.md §12b/12b-A1).
 * There is no unified search endpoint on the BFF, so this class fans out client-side exactly as
 * web does — one `GET /libraries/{id}/search` per book/podcast library plus one
 * `GET /jellyfin/search` — and groups the results itself.
 *
 * The debounce-and-supersede design is identical to
 * [net.auralis.app.features.music.MusicSearchViewModel], including *why* coroutine cancellation
 * alone cannot guarantee a stale response never overwrites a newer one: every request this
 * class issues eventually reaches [ApiClient]'s own blocking OkHttp call inside
 * `withContext(Dispatchers.IO)`, so a request already in flight always runs to completion
 * regardless of `cancel()`. [searchSequence] is what actually closes that gap — see
 * [performSearch]'s own comment.
 *
 * The two fan-out halves ([fetchLibraryResults]/[fetchMusicResults]) run concurrently via
 * `async` and are awaited together, so neither one's latency gates the other; each degrades
 * independently into its own slice of [UnifiedSearchResultsUiState.Results] rather than failing
 * the whole search. Within the library half, each library's own `searchLibrary` call is *also*
 * independent — one library failing (a transient upstream hiccup) drops only that library's
 * contribution, not every book/podcast result across the whole account.
 */
class UnifiedSearchViewModel(
    private val apiClient: ApiClient,
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(UnifiedSearchUiState())
    val uiState: StateFlow<UnifiedSearchUiState> = _uiState.asStateFlow()

    // Cancelled and replaced on every onQueryChange. Mirrors MusicSearchViewModel.searchJob —
    // see that class's doc comment for why this alone doesn't guarantee staleness-freedom.
    private var searchJob: Job? = null

    // Bumped on every new "live" search (a debounced onQueryChange, or onQueryChange clearing
    // the field). performSearch captures the value at launch and compares it against this field
    // immediately before writing to _uiState, so a fan-out response for a since-superseded
    // query can never land — a plain field read at the write site, holding regardless of how
    // two searches' many concurrent requests actually interleave.
    private var searchSequence: Int = 0

    /** Called on every keystroke. Updates the visible field text unconditionally, then either
     * settles [UnifiedSearchResultsUiState] back to [UnifiedSearchResultsUiState.Idle] (an empty
     * or blank field) or schedules a debounced fan-out for the trimmed term. */
    fun onQueryChange(newQuery: String) {
        _uiState.value = _uiState.value.copy(query = newQuery)
        searchJob?.cancel()
        val term = newQuery.trim()
        if (term.isEmpty()) {
            // Supersedes any still-in-flight fan-out even though nothing new is being issued —
            // otherwise a response for the just-abandoned term could still land after the field
            // has already gone Idle.
            searchSequence++
            _uiState.value = _uiState.value.copy(resultsState = UnifiedSearchResultsUiState.Idle)
            return
        }
        _uiState.value = _uiState.value.copy(resultsState = UnifiedSearchResultsUiState.Searching)
        val sequence = ++searchSequence
        searchJob =
            viewModelScope.launch {
                delay(UNIFIED_SEARCH_DEBOUNCE_MS)
                performSearch(term, sequence)
            }
    }

    /** Wired to [UnifiedSearchScreen]'s primary chip row. */
    fun selectPrimaryFilter(value: String) {
        _uiState.value = _uiState.value.copy(filters = selectPrimaryFilter(_uiState.value.filters, value))
    }

    /** Wired to [UnifiedSearchScreen]'s secondary chip row. */
    fun selectSecondaryFilter(value: String) {
        _uiState.value = _uiState.value.copy(filters = selectSecondaryFilter(_uiState.value.filters, value))
    }

    private suspend fun performSearch(
        term: String,
        sequence: Int,
    ) {
        val baseUrl = serverConfigRepository.getBaseUrl()
        coroutineScope {
            val libraryDeferred = async { fetchLibraryResults(term, baseUrl) }
            val musicDeferred = async { fetchMusicResults(term, baseUrl) }
            val library = libraryDeferred.await()
            val music = musicDeferred.await()
            // See searchSequence's own comment: this is what actually stops a stale,
            // already-in-flight fan-out from overwriting a newer search's result.
            if (sequence != searchSequence) return@coroutineScope
            _uiState.value =
                _uiState.value.copy(
                    resultsState =
                        UnifiedSearchResultsUiState.Results(
                            books = library.books,
                            series = library.series,
                            authors = library.authors,
                            podcasts = library.podcasts,
                            artists = music.artists,
                            albums = music.albums,
                            tracks = music.tracks,
                            libraryError = library.error,
                            musicError = music.error,
                            musicUnconfigured = music.unconfigured,
                        ),
                )
        }
    }

    private data class LibraryFanOutResult(
        val books: List<SearchBookUi> = emptyList(),
        val series: List<SearchSeriesUi> = emptyList(),
        val authors: List<SearchAuthorUi> = emptyList(),
        val podcasts: List<SearchPodcastUi> = emptyList(),
        /** Non-null only when the whole library side failed outright — `GET /libraries` itself
         * erroring. A single library's own `searchLibrary` call failing is *not* this: it just
         * drops that library's contribution (see [fetchLibraryResults]'s own comment), leaving
         * this null so the other libraries' real results still render normally. */
        val error: String? = null,
    )

    /** Books and podcasts share one Audiobookshelf-backed fan-out: `GET /libraries` gives the
     * full library list, filtered here to `mediaType in {"book", "podcast"}` (the same two
     * values `apps/server/src/testSupport/fakes/fixtures/libraries.json` uses), then one
     * `GET /libraries/{id}/search` per matching library, run concurrently and merged. */
    private suspend fun fetchLibraryResults(
        term: String,
        baseUrl: String?,
    ): LibraryFanOutResult {
        val libraries =
            try {
                apiClient.libraries().filter { it.mediaType == "book" || it.mediaType == "podcast" }
            } catch (e: ApiException) {
                return LibraryFanOutResult(error = e.message)
            }
        if (libraries.isEmpty()) return LibraryFanOutResult()

        val perLibrary =
            coroutineScope {
                libraries
                    .map { library ->
                        async {
                            try {
                                apiClient.searchLibrary(library.id, term)
                            } catch (e: ApiException) {
                                // One library's own hiccup drops only its contribution — see
                                // this method's doc comment and LibraryFanOutResult.error's.
                                null
                            }
                        }
                    }.map { it.await() }
                    .filterNotNull()
            }

        val books = mutableListOf<SearchBookUi>()
        val podcasts = mutableListOf<SearchPodcastUi>()
        val series = mutableListOf<SearchSeriesUi>()
        val authors = mutableListOf<SearchAuthorUi>()
        for (results in perLibrary) {
            books += results.books.map { it.toBookUi(baseUrl) }
            podcasts += results.podcasts.map { it.toPodcastUi(baseUrl) }
            series += results.series.map { SearchSeriesUi(id = it.id, name = it.name) }
            authors += results.authors.map { SearchAuthorUi(id = it.id, name = it.name) }
        }
        return LibraryFanOutResult(books = books, series = series, authors = authors, podcasts = podcasts)
    }

    private data class MusicFanOutResult(
        val artists: List<MusicArtistUi> = emptyList(),
        val albums: List<MusicAlbumUi> = emptyList(),
        val tracks: List<MusicSearchTrackUi> = emptyList(),
        val error: String? = null,
        val unconfigured: Boolean = false,
    )

    /** `GET /jellyfin/search` via [MusicRepository.search] — the same call
     * [net.auralis.app.features.music.MusicSearchViewModel] makes, reusing its result mapping
     * ([toUi]/[toSearchUi]) so a track/artist/album row looks identical regardless of which
     * search screen produced it. */
    private suspend fun fetchMusicResults(
        term: String,
        baseUrl: String?,
    ): MusicFanOutResult =
        when (val result = musicRepository.search(term)) {
            is MusicSearchResult.Loaded ->
                MusicFanOutResult(
                    artists = result.artists.map { it.toUi(baseUrl) },
                    albums = result.albums.map { it.toUi(baseUrl) },
                    tracks = result.tracks.map { it.toSearchUi() },
                )
            is MusicSearchResult.Failed ->
                if (result.code == JELLYFIN_NOT_CONFIGURED_CODE) {
                    // Calm, not an error — no Jellyfin connected is a precondition, not a
                    // search failure. See UnifiedSearchResultsUiState.Results' own doc comment.
                    MusicFanOutResult(unconfigured = true)
                } else {
                    MusicFanOutResult(error = musicErrorMessage(result.code))
                }
        }
}

/** The same `{baseUrl}/api/v1/media/{id}/cover` URL shape
 * [net.auralis.app.features.home.HomeViewModel] already builds for shelf items — there is no
 * shared helper for it in this codebase yet (that class's own `toUi` builds it inline), so this
 * mirrors it rather than inventing a different URL shape for the same endpoint. */
private fun LibraryItem.coverUrl(baseUrl: String?): String? =
    baseUrl?.let { "${it.trimEnd('/')}/api/v1/media/$id/cover?width=200" }

private fun LibraryItem.toBookUi(baseUrl: String?): SearchBookUi =
    SearchBookUi(
        id = id,
        title = media.title,
        subtitle = media.author ?: media.authors?.joinToString(", ") { it.name }?.takeIf { it.isNotBlank() },
        coverUrl = coverUrl(baseUrl),
    )

private fun LibraryItem.toPodcastUi(baseUrl: String?): SearchPodcastUi =
    SearchPodcastUi(id = id, title = media.title, coverUrl = coverUrl(baseUrl))
