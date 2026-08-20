package net.develivarr.auralis.features.search

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
import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.model.MusicCandidate
import net.develivarr.auralis.data.model.ProviderEntry
import net.develivarr.auralis.data.model.Release
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.settings.ServerConfigRepository
import net.develivarr.auralis.features.music.JELLYFIN_NOT_CONFIGURED_CODE
import net.develivarr.auralis.features.music.MusicAlbumUi
import net.develivarr.auralis.features.music.MusicArtistUi
import net.develivarr.auralis.features.music.MusicRepository
import net.develivarr.auralis.features.music.MusicSearchResult
import net.develivarr.auralis.features.music.MusicSearchTrackUi
import net.develivarr.auralis.features.music.musicErrorMessage
import net.develivarr.auralis.features.music.toSearchUi
import net.develivarr.auralis.features.music.toUi
import net.develivarr.auralis.features.musicrequests.CandidateRequestState
import net.develivarr.auralis.features.requests.ReleaseRequestState
import net.develivarr.auralis.features.requests.TitleRequestState

/** How long [UnifiedSearchViewModel.onQueryChange] waits, after the most recent keystroke,
 * before firing the whole fan-out (one call per book/podcast library, plus one Jellyfin
 * search). Mirrors [net.develivarr.auralis.features.music.MUSIC_SEARCH_DEBOUNCE_MS] — the only other
 * debounced-as-you-type search in this app — rather than inventing a new number: web's
 * `SearchPage.tsx` does not debounce its own library/Jellyfin fan-out at all (it relies on
 * react-query's request de-duplication instead, which this app's plain `ApiClient` has no
 * equivalent of), so there is no web value to match here; the existing Android convention is
 * the more relevant one to follow. */
internal const val UNIFIED_SEARCH_DEBOUNCE_MS = 400L

/** The wire code `apps/server/src/httpErrors.ts` sends for `NotConfiguredError` (Audiobookshelf
 * unconfigured) — the exact ABS-side counterpart to [net.develivarr.auralis.features.music
 * .JELLYFIN_NOT_CONFIGURED_CODE]. [fetchLibraryResults] catches it the same calm way
 * [fetchMusicResults] already catches Jellyfin's. */
internal const val LIBRARY_NOT_CONFIGURED_CODE = "not_configured"

/** One book (or, more precisely, one Audiobookshelf library item scoped to a `book` library) on
 * [UnifiedSearchScreen]. [net.develivarr.auralis.navigation.Routes.bookDetail] exists as of
 * `16e-book-A`, so this row navigates like [SearchPodcastUi] does — see
 * [UnifiedSearchScreen]'s own doc comment. */
data class SearchBookUi(val id: String, val title: String, val subtitle: String?, val coverUrl: String?)

/** One podcast show on [UnifiedSearchScreen] — unlike [SearchBookUi], this kind *does* have a
 * detail route ([net.develivarr.auralis.navigation.Routes.podcastDetail]), so it navigates. */
data class SearchPodcastUi(val id: String, val title: String, val coverUrl: String?)

/** One series on [UnifiedSearchScreen]. No `/series/:id` route exists on Android yet (12c-1's
 * series/author pages are a web-only wave so far), so this renders inert. */
data class SearchSeriesUi(val id: String, val name: String)

/** One author on [UnifiedSearchScreen]. See [SearchSeriesUi]'s doc comment — same reasoning,
 * no `/author/:id` route exists. */
data class SearchAuthorUi(val id: String, val name: String)

/**
 * The Search view's "available to request" books group (`docs/ROADMAP.md` §12b/12b-A2) — a
 * separate, independently-loading side channel from [UnifiedSearchResultsUiState]. See
 * [UnifiedSearchViewModel]'s own doc comment for why this has to be a *sibling* fetch rather
 * than a slice of [UnifiedSearchResultsUiState.Results]: the book-request search fans out to
 * real indexers and can take several seconds, and gating the (fast) library results on it
 * finishing would be exactly the coupling this class exists to avoid.
 */
sealed interface RequestableBooksUiState {
    /** Nothing has been typed, or the server has no usable indexer+download-client pair —
     * [net.develivarr.auralis.features.search.canRequestBooks] said no, so there is nothing to show
     * and no request search was even issued. */
    data object Idle : RequestableBooksUiState

    data object Loading : RequestableBooksUiState

    /**
     * A settled request search. [error] is non-null only when the search call itself failed
     * (not when it simply found nothing) — mirrors [UnifiedSearchResultsUiState.Results]'
     * `libraryError`/`musicError` fields rather than a separate `Failed` variant, so a search
     * failure and "offer to request the typed title anyway" can coexist: see
     * [offerRequestAnyway]'s own doc comment.
     */
    data class Loaded(
        val releases: List<Release> = emptyList(),
        val error: String? = null,
        val releaseStates: Map<String, ReleaseRequestState> = emptyMap(),
        val titleRequestState: TitleRequestState = TitleRequestState.Idle,
    ) : RequestableBooksUiState {
        /** Offered whenever the search came back with zero releases — deliberately
         * indifferent to *why* (nothing matched, or [error] is set because every indexer
         * errored): a user whose indexer is down is exactly the user who most needs to queue
         * the request anyway rather than being turned away. Mirrors
         * `RequestsUiState.offerRequestAnyway` / `apps/web/src/features/requests/
         * requestAnyway.ts`'s `shouldOfferRequestAnyway`. */
        val offerRequestAnyway: Boolean
            get() = releases.isEmpty()
    }
}

/** The Search view's "available to request" music group. See [RequestableBooksUiState]'s
 * doc comment for why this is its own independent side channel — the music-request search is
 * a real Soulseek search that can take on the order of seventeen seconds. There is no
 * "request anyway" counterpart here: see [UnifiedSearchViewModel.requestCandidate]'s doc
 * comment for why a music candidate has nothing to fall back to. */
sealed interface RequestableMusicUiState {
    /** Nothing has been typed, or no enabled+configured music provider exists. */
    data object Idle : RequestableMusicUiState

    data object Loading : RequestableMusicUiState

    /** [error] is non-null only when the search call itself failed — see
     * [RequestableBooksUiState.Loaded]'s identical doc comment. */
    data class Loaded(
        val candidates: List<MusicCandidate> = emptyList(),
        val error: String? = null,
        val candidateStates: Map<String, CandidateRequestState> = emptyMap(),
        /** Set only when [UnifiedSearchViewModel.requestCandidate] created the request
         * successfully but the automatic post-create grab failed. The row still shows
         * Requested — the request genuinely exists in the pipeline — with this as a separate,
         * additional note; collapsing it into [CandidateRequestState.Failed] would be a false
         * negative, the same "no optimistic flip" rule violated from the other direction. */
        val grabWarnings: Map<String, String> = emptyMap(),
    ) : RequestableMusicUiState
}

sealed interface UnifiedSearchResultsUiState {
    /** Nothing has been typed (or the field was cleared) — an inviting empty state, not "no
     * results", since no search has actually run yet. */
    data object Idle : UnifiedSearchResultsUiState

    /** The debounce has elapsed and the fan-out is in flight. */
    data object Searching : UnifiedSearchResultsUiState

    /**
     * A settled search. Every list defaults to empty so a caller only names what it has, and
     * [isEmpty] covers "nothing anywhere", mirroring
     * [net.develivarr.auralis.features.music.MusicSearchResultsUiState.Results]'s identical shape.
     *
     * The library side (books/series/authors/podcasts) and the music side degrade
     * independently — a Jellyfin outage must never blank the book results a user with no music
     * server at all is entitled to see, and vice versa. [libraryError]/[musicError] are which
     * side (if either) failed outright; [musicUnconfigured] is the calm "no Jellyfin connected"
     * case, deliberately distinct from an actual failure — the same distinction
     * [net.develivarr.auralis.features.music.MusicSearchResultsUiState.Unconfigured] already makes for
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
     * [net.develivarr.auralis.features.music.MusicSearchUiState.query]'s identical doc comment. */
    val query: String = "",
    val filters: SearchFilterState = DEFAULT_SEARCH_FILTER_STATE,
    val resultsState: UnifiedSearchResultsUiState = UnifiedSearchResultsUiState.Idle,
    /** Independent of [resultsState] on purpose — see [RequestableBooksUiState]'s own doc
     * comment for why the two must never be coupled into one settle point. */
    val requestableBooksState: RequestableBooksUiState = RequestableBooksUiState.Idle,
    val requestableMusicState: RequestableMusicUiState = RequestableMusicUiState.Idle,
    /**
     * Whether Audiobookshelf is connected — the status line's message 1 (`docs/design/screens/
     * SEARCH.md` §6.4). Unlike web, which knows `absConfigured` before any query is typed (an
     * upfront react-query fetch), this is only *learned* the first time [performSearch] actually
     * settles a search — the same "derive it from the search flow, don't invent a second
     * pattern" shape [UnifiedSearchResultsUiState.Results.musicUnconfigured] already has. It
     * lives on this top-level state, not inside [resultsState], specifically so it *survives*
     * [onQueryChange] resetting [resultsState] back to [UnifiedSearchResultsUiState.Idle] when
     * the field is cleared — without that, "Connect Audiobookshelf…" would silently flip back to
     * "Start typing…" the moment a user backspaced their query, which §6.4's ordering (message 1
     * outranks message 2) rules out.
     */
    val libraryUnconfigured: Boolean = false,
)

/**
 * Backs [UnifiedSearchScreen]: the Android counterpart to
 * `apps/web/src/features/search/SearchPage.tsx`'s library half (docs/ROADMAP.md §12b/12b-A1).
 * There is no unified search endpoint on the BFF, so this class fans out client-side exactly as
 * web does — one `GET /libraries/{id}/search` per book/podcast library plus one
 * `GET /jellyfin/search` — and groups the results itself.
 *
 * The debounce-and-supersede design is identical to
 * [net.develivarr.auralis.features.music.MusicSearchViewModel], including *why* coroutine cancellation
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
 *
 * **12b-A2 adds a third and fourth fan-out** ([fetchRequestableBooks]/[fetchRequestableMusic]):
 * whether a non-library title could be *requested*, behind the same availability gates web's
 * `searchRequestability.ts` uses (`net.develivarr.auralis.features.search.canRequestBooks` /
 * `hasEnabledMusicProvider`). These are deliberately **not** folded into [performSearch]'s own
 * `coroutineScope` — a book-request search fans out to real indexers and a music-request search
 * is a real Soulseek search that can take on the order of seventeen seconds, and awaiting either
 * inside that block would hold up writing the (fast) library/music results too. They are
 * launched as siblings of that block instead, each tracked in its own `Job` so a superseding
 * search can cancel a stale one, and each writes [UnifiedSearchUiState.requestableBooksState]/
 * [UnifiedSearchUiState.requestableMusicState] independently, on its own schedule.
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

    // Cancelled and replaced alongside searchJob — see this class's own doc comment for why
    // these are separate jobs rather than children awaited inside performSearch's own
    // coroutineScope.
    private var requestableBooksJob: Job? = null
    private var requestableMusicJob: Job? = null

    // Bumped on every new "live" search (a debounced onQueryChange, or onQueryChange clearing
    // the field). performSearch captures the value at launch and compares it against this field
    // immediately before writing to _uiState, so a fan-out response for a since-superseded
    // query can never land — a plain field read at the write site, holding regardless of how
    // two searches' many concurrent requests actually interleave. The same field guards
    // fetchRequestableBooks/fetchRequestableMusic's writes too — one sequence number covers
    // every fan-out a single search fires. requestRelease/requestAnyway/requestCandidate capture
    // the value at the moment the user presses the row (not inside their own launch) and their
    // update* callbacks re-check it the same way, so a slow create/grab call resolving after the
    // user has already moved on to a new, already-settled search can never splice its guid into
    // that new search's state.
    private var searchSequence: Int = 0

    /** Called on every keystroke. Updates the visible field text unconditionally, then either
     * settles [UnifiedSearchResultsUiState] (and the two requestable states) back to their Idle
     * variants (an empty or blank field) or schedules a debounced fan-out for the trimmed term. */
    fun onQueryChange(newQuery: String) {
        _uiState.value = _uiState.value.copy(query = newQuery)
        searchJob?.cancel()
        requestableBooksJob?.cancel()
        requestableMusicJob?.cancel()
        val term = newQuery.trim()
        if (term.isEmpty()) {
            // Supersedes any still-in-flight fan-out even though nothing new is being issued —
            // otherwise a response for the just-abandoned term could still land after the field
            // has already gone Idle.
            searchSequence++
            _uiState.value =
                _uiState.value.copy(
                    resultsState = UnifiedSearchResultsUiState.Idle,
                    requestableBooksState = RequestableBooksUiState.Idle,
                    requestableMusicState = RequestableMusicUiState.Idle,
                )
            return
        }
        _uiState.value =
            _uiState.value.copy(
                resultsState = UnifiedSearchResultsUiState.Searching,
                requestableBooksState = RequestableBooksUiState.Loading,
                requestableMusicState = RequestableMusicUiState.Loading,
            )
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

        // Launched before (and as siblings of, not children awaited inside) the
        // coroutineScope below — see this class's own doc comment for why. Both share one
        // `providers()` call via this single Deferred rather than each fetching it
        // separately: it is one small, cheap, shared precondition for two otherwise fully
        // independent fetches, not something either "owns".
        val providersDeferred = viewModelScope.async { fetchProvidersSafely() }
        requestableBooksJob =
            viewModelScope.launch { fetchRequestableBooks(term, sequence, providersDeferred.await()) }
        requestableMusicJob =
            viewModelScope.launch { fetchRequestableMusic(term, sequence, providersDeferred.await()) }

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
                    // Written unconditionally on every settle, not only when true — see this
                    // field's own doc comment on UnifiedSearchUiState for why it must survive a
                    // subsequent cleared-query reset, and a corrected value (ABS reconnected
                    // mid-session) should still overwrite a stale one.
                    libraryUnconfigured = library.unconfigured,
                )
        }
    }

    /** Fails closed to an empty provider list — see [canRequestBooks]/[hasEnabledMusicProvider]'s
     * own doc comment on why that's the same "nothing requestable" degrade as web's
     * `providersQuery.data?.providers ?? []`, rather than a top-level error blocking both
     * requestable sections over what is usually a transient hiccup on an endpoint neither
     * section's own result actually needs to render. */
    private suspend fun fetchProvidersSafely(): List<ProviderEntry> =
        try {
            apiClient.providers()
        } catch (e: ApiException) {
            emptyList()
        }

    /**
     * The book half of 12b-A2's requestable fan-out. Gated on [canRequestBooks] — when the
     * server has no usable indexer+download-client pair, this settles straight to
     * [RequestableBooksUiState.Idle] without ever calling `searchReleases`, the same
     * "don't even ask" choice [fetchRequestableMusic] makes for its own gate.
     */
    private suspend fun fetchRequestableBooks(
        term: String,
        sequence: Int,
        providers: List<ProviderEntry>,
    ) {
        if (sequence != searchSequence) return
        if (!canRequestBooks(providers)) {
            _uiState.value = _uiState.value.copy(requestableBooksState = RequestableBooksUiState.Idle)
            return
        }
        try {
            val result = apiClient.searchReleases(term)
            if (sequence != searchSequence) return
            _uiState.value =
                _uiState.value.copy(requestableBooksState = RequestableBooksUiState.Loaded(releases = result.releases))
        } catch (e: ApiException) {
            if (sequence != searchSequence) return
            _uiState.value =
                _uiState.value.copy(
                    requestableBooksState = RequestableBooksUiState.Loaded(releases = emptyList(), error = e.message),
                )
        }
    }

    /** The music half of 12b-A2's requestable fan-out. See [fetchRequestableBooks]'s doc
     * comment — identical shape, gated on [hasEnabledMusicProvider] instead. */
    private suspend fun fetchRequestableMusic(
        term: String,
        sequence: Int,
        providers: List<ProviderEntry>,
    ) {
        if (sequence != searchSequence) return
        if (!hasEnabledMusicProvider(providers)) {
            _uiState.value = _uiState.value.copy(requestableMusicState = RequestableMusicUiState.Idle)
            return
        }
        try {
            val result = apiClient.searchMusicRequests(term)
            if (sequence != searchSequence) return
            _uiState.value =
                _uiState.value.copy(
                    requestableMusicState = RequestableMusicUiState.Loaded(candidates = result.candidates),
                )
        } catch (e: ApiException) {
            if (sequence != searchSequence) return
            _uiState.value =
                _uiState.value.copy(
                    requestableMusicState = RequestableMusicUiState.Loaded(candidates = emptyList(), error = e.message),
                )
        }
    }

    /**
     * Requests one specific [Release] from the "available to request" books section. Mirrors
     * `RequestsViewModel.requestRelease` — same per-guid Idle→Pending→Requested/Failed shape —
     * but keyed into [RequestableBooksUiState.Loaded.releaseStates] rather than a top-level map,
     * since this screen can show requestable rows for books *and* music at once. A no-op if
     * [RequestableBooksUiState] isn't [RequestableBooksUiState.Loaded] (there is nothing to
     * request against) — a caller only ever presses a row that is actually on screen, so this
     * degrades rather than throws for the same reason every other state-shape guard in this
     * file does.
     */
    fun requestRelease(release: Release) {
        val current = _uiState.value.requestableBooksState
        if (current !is RequestableBooksUiState.Loaded) return
        // Captured now, not re-read inside the launch below: guards this request's own eventual
        // write against a query the user has since changed — see searchSequence's own doc
        // comment. Without this, a slow createRequest resolving after a new search has already
        // settled to its own fresh Loaded state would splice this stale guid into it.
        val sequence = searchSequence
        _uiState.value =
            _uiState.value.copy(
                requestableBooksState =
                    current.copy(releaseStates = current.releaseStates + (release.guid to ReleaseRequestState.Pending)),
            )
        viewModelScope.launch {
            try {
                apiClient.createRequest(release.title, release = release)
                updateReleaseState(sequence, release.guid, ReleaseRequestState.Requested)
            } catch (e: ApiException) {
                updateReleaseState(sequence, release.guid, ReleaseRequestState.Failed(e.message))
            }
        }
    }

    private fun updateReleaseState(
        sequence: Int,
        guid: String,
        state: ReleaseRequestState,
    ) {
        if (sequence != searchSequence) return
        val current = _uiState.value.requestableBooksState
        if (current !is RequestableBooksUiState.Loaded) return
        _uiState.value =
            _uiState.value.copy(requestableBooksState = current.copy(releaseStates = current.releaseStates + (guid to state)))
    }

    /**
     * "Request anyway" — queues the current query term with no release attached, the same
     * `POST /requests` with `release: null` [RequestsViewModel.requestAnyway] uses. Offered
     * whenever [RequestableBooksUiState.Loaded.offerRequestAnyway] says so; see that
     * property's own doc comment for why it doesn't care whether releases came back empty
     * because nothing matched or because the search failed outright.
     */
    fun requestAnyway() {
        val current = _uiState.value.requestableBooksState
        if (current !is RequestableBooksUiState.Loaded) return
        // See requestRelease's identical comment on why this is captured now rather than
        // re-read inside the launch below.
        val sequence = searchSequence
        _uiState.value =
            _uiState.value.copy(requestableBooksState = current.copy(titleRequestState = TitleRequestState.Pending))
        val term = _uiState.value.query.trim()
        viewModelScope.launch {
            try {
                apiClient.createRequest(term)
                updateTitleRequestState(sequence, TitleRequestState.Requested)
            } catch (e: ApiException) {
                updateTitleRequestState(sequence, TitleRequestState.Failed(e.message))
            }
        }
    }

    private fun updateTitleRequestState(
        sequence: Int,
        state: TitleRequestState,
    ) {
        if (sequence != searchSequence) return
        val current = _uiState.value.requestableBooksState
        if (current !is RequestableBooksUiState.Loaded) return
        _uiState.value = _uiState.value.copy(requestableBooksState = current.copy(titleRequestState = state))
    }

    /**
     * Requests one [MusicCandidate] from the "available to request" music section. Starts the
     * slskd download immediately on success — mirrors
     * `apps/web/src/features/search/RequestableMusicSection.tsx`'s `handleRequest`, which
     * chains straight into a grab once the freshly created request lands `approved` (the
     * default auto-approval policy — `docs/HANDOVER.md`'s phase-6 decisions). No confirm step:
     * a search hit is one specific file held by one specific peer right now, and a confirm
     * dialog only gives that peer time to disconnect before the grab ever fires.
     *
     * If the create call itself fails, the row reports that failure and nothing was requested.
     * If create succeeds but the follow-up grab fails, the row still shows
     * [CandidateRequestState.Requested] — the request genuinely exists in the pipeline — with
     * [RequestableMusicUiState.Loaded.grabWarnings] carrying a separate, additional note.
     * Collapsing that into [CandidateRequestState.Failed] would be a false negative — this
     * class's own "no optimistic flip" rule violated from the other direction, since it would
     * claim the request never happened when it did.
     */
    fun requestCandidate(candidate: MusicCandidate) {
        val current = _uiState.value.requestableMusicState
        if (current !is RequestableMusicUiState.Loaded) return
        // See requestRelease's identical comment on why this is captured now rather than
        // re-read inside the launch below.
        val sequence = searchSequence
        _uiState.value =
            _uiState.value.copy(
                requestableMusicState =
                    current.copy(
                        candidateStates = current.candidateStates + (candidate.guid to CandidateRequestState.Pending),
                        grabWarnings = current.grabWarnings - candidate.guid,
                    ),
            )
        viewModelScope.launch {
            try {
                val created = apiClient.createMusicRequest(candidate)
                // The grab attempt happens *before* the row is flipped to Requested, not after —
                // both the create and the grab-or-warn have to have already happened by the time
                // any observer (a screen, or a test's own `first { ... Requested }`) can see
                // Requested at all. Writing Requested first and the grab outcome in a second,
                // later write left a real window — this class's own launch is a genuine
                // fire-and-forget on a real dispatcher, so a caller awaiting "Requested" could
                // observe it before the grab (a second, separate network round trip) had even
                // been attempted, exactly the race `docs/HANDOVER.md`'s "Android CI" section
                // warns about for a *different* leak but is the identical shape of bug here: an
                // observable state that promises more than has actually happened yet.
                var grabWarning: String? = null
                if (created.status == "approved") {
                    try {
                        apiClient.grabMusicRequest(created.id)
                    } catch (e: ApiException) {
                        grabWarning = "Requested, but the download could not be started."
                    }
                }
                updateCandidateState(sequence, candidate.guid, CandidateRequestState.Requested, grabWarning)
            } catch (e: ApiException) {
                updateCandidateState(sequence, candidate.guid, CandidateRequestState.Failed(e.message))
            }
        }
    }

    /** Writes [state] and, when non-null, [grabWarning] in the same [_uiState] update — see
     * [requestCandidate]'s own comment on why the two must never be observable as two separate
     * writes. */
    private fun updateCandidateState(
        sequence: Int,
        guid: String,
        state: CandidateRequestState,
        grabWarning: String? = null,
    ) {
        if (sequence != searchSequence) return
        val current = _uiState.value.requestableMusicState
        if (current !is RequestableMusicUiState.Loaded) return
        _uiState.value =
            _uiState.value.copy(
                requestableMusicState =
                    current.copy(
                        candidateStates = current.candidateStates + (guid to state),
                        grabWarnings =
                            if (grabWarning != null) {
                                current.grabWarnings + (guid to grabWarning)
                            } else {
                                current.grabWarnings
                            },
                    ),
            )
    }

    private data class LibraryFanOutResult(
        val books: List<SearchBookUi> = emptyList(),
        val series: List<SearchSeriesUi> = emptyList(),
        val authors: List<SearchAuthorUi> = emptyList(),
        val podcasts: List<SearchPodcastUi> = emptyList(),
        /** Non-null only when the whole library side failed outright — `GET /libraries` itself
         * erroring. A single library's own `searchLibrary` call failing is *not* this: it just
         * drops that library's contribution (see [fetchLibraryResults]'s own comment), leaving
         * this null so the other libraries' real results still render normally. Never set
         * together with [unconfigured] — see that field's own doc comment. */
        val error: String? = null,
        /** True when `GET /libraries` itself failed with [LIBRARY_NOT_CONFIGURED_CODE] —
         * Audiobookshelf has no stored credential at all, the calm precondition case, not a
         * failure. Mirrors [MusicFanOutResult.unconfigured]'s identical distinction on the music
         * side; when this is true, [error] is left null so the status line (§6.4) shows message
         * 1 rather than a generic failure. */
        val unconfigured: Boolean = false,
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
                return if (e.code == LIBRARY_NOT_CONFIGURED_CODE) {
                    // Calm, not an error — no Audiobookshelf connected is a precondition, not a
                    // search failure. See LibraryFanOutResult.unconfigured's own doc comment,
                    // and MusicFanOutResult's identical distinction on the music side just below.
                    LibraryFanOutResult(unconfigured = true)
                } else {
                    LibraryFanOutResult(error = e.message)
                }
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
     * [net.develivarr.auralis.features.music.MusicSearchViewModel] makes, reusing its result mapping
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
                    // 16e-search-A-2: pass baseUrl so track rows get cover art, matching the
                    // artist/album rows just above — MusicSearchScreen's own toSearchUi() call
                    // site is untouched and stays baseUrl-less by construction.
                    tracks = result.tracks.map { it.toSearchUi(baseUrl) },
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
 * [net.develivarr.auralis.features.home.HomeViewModel] already builds for shelf items — there is no
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
