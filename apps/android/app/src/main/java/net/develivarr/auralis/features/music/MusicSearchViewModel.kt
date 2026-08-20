package net.develivarr.auralis.features.music

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.model.JellyfinTrack
import net.develivarr.auralis.data.settings.ServerConfigRepository

/** How long [MusicSearchViewModel.onQueryChange] waits, after the most recent keystroke, before
 * actually issuing a search — this app's only debounced-as-you-type search (podcast directory
 * search and audiobook request search both require an explicit submit button instead; see
 * `PodcastsViewModel.submitSearch`'s own doc comment), so there is no existing constant to reuse
 * or convention to match beyond "a few hundred milliseconds", the range most search-as-you-type
 * UIs use to feel instant without firing on every keystroke. */
internal const val MUSIC_SEARCH_DEBOUNCE_MS = 400L

/** One track row on [MusicSearchScreen]. Distinct from [MusicTrackUi] (an album's own,
 * queue-buildable track list): a search result carries no track-list context to build a
 * playback queue from, so tapping one navigates to [albumId]'s album detail page instead of
 * playing directly — see [MusicSearchScreen]'s own doc comment for why. [albumId] is nullable
 * because a Jellyfin track item is not guaranteed to carry a parent album id; such a row is
 * rendered non-interactive rather than as a dead click target that silently does nothing.
 * [coverUrl] defaults to `null` only for a caller with no server base URL to resolve against
 * (e.g. a test building this type directly) — both real call sites, [MusicSearchScreen]'s own
 * `SearchTrackRow` (16e-search-A-3) and `UnifiedSearchScreen.kt`'s own track row
 * (16e-search-A-2), now pass a real one and render a cover-art tile. */
data class MusicSearchTrackUi(
    val id: String,
    val title: String,
    val artistNames: String?,
    val albumId: String?,
    val coverUrl: String? = null,
)

/** `internal`, not `private`: [net.develivarr.auralis.features.search.UnifiedSearchViewModel] (wave
 * 12b-A1) reuses this exact mapping for its own music-track search results, since a track
 * search hit is the identical shape regardless of which screen's query produced it.
 * [baseUrl] defaults to `null` only so a caller with no server base URL to resolve against (a
 * test constructing a [MusicSearchTrackUi] directly) can omit it — [MusicSearchViewModel]'s own
 * `performSearch` (16e-search-A-3) passes the real one it already resolves for the artist/album
 * results on the same search, the same fix that closed 16e-search-A-2's `UnifiedSearchViewModel`
 * call site. Before 16e-search-A-3 this screen's own call site passed no `baseUrl` at all, which
 * is *why* [MusicSearchScreen]'s track rows never had cover art — not merely a missing tile, but
 * a `coverUrl` that was always `null` on the wire into it. */
internal fun JellyfinTrack.toSearchUi(baseUrl: String? = null): MusicSearchTrackUi =
    MusicSearchTrackUi(
        id = id,
        title = name,
        coverUrl = jellyfinItemArtworkUrl(baseUrl, id),
        artistNames = artistNames.joinToString(", ").takeIf { it.isNotBlank() },
        albumId = albumId,
    )

/**
 * The state of the currently submitted (debounced) search term — five distinct cases, none of
 * them rendered as an error except [Failed]. [Unconfigured] mirrors the calm, no-retry-button
 * treatment [ArtistDetailViewModel]/[AlbumDetailViewModel] already give a
 * [JELLYFIN_NOT_CONFIGURED_CODE] result: "no server connected" is not a search failure, it is a
 * precondition this screen has nothing to search against. A settled search with no matches is
 * deliberately *not* its own sealed case — it is [Results] with every list empty
 * ([Results.isEmpty]), the same shape [ArtistsSectionUiState.Loaded]/[AlbumsSectionUiState
 * .Loaded] already use for "loaded, but nothing in it" — so "no matches" and "matches found" stay
 * one state with a rendering branch, not two states a caller could get out of sync.
 */
sealed interface MusicSearchResultsUiState {
    /** Nothing has been typed (or the field was cleared) — an inviting empty state, not "no
     * results", since no search has actually run yet. */
    data object Idle : MusicSearchResultsUiState

    /** The debounce has elapsed and a request is in flight. */
    data object Searching : MusicSearchResultsUiState

    /** See this interface's own doc comment on [JELLYFIN_NOT_CONFIGURED_CODE]. */
    data object Unconfigured : MusicSearchResultsUiState

    data class Failed(val message: String) : MusicSearchResultsUiState

    data class Results(
        val artists: List<MusicArtistUi>,
        val albums: List<MusicAlbumUi>,
        val tracks: List<MusicSearchTrackUi>,
    ) : MusicSearchResultsUiState {
        val isEmpty: Boolean get() = artists.isEmpty() && albums.isEmpty() && tracks.isEmpty()
    }
}

data class MusicSearchUiState(
    /** The live text field contents — updated synchronously on every keystroke, independent of
     * [resultsState], which only moves once the debounce settles. Keeping these separate (rather
     * than deriving the field's displayed value from whatever term last searched) is what lets
     * the field never stutter or jump while the user is still typing. */
    val query: String = "",
    val resultsState: MusicSearchResultsUiState = MusicSearchResultsUiState.Idle,
)

/**
 * Backs [MusicSearchScreen]: a debounced search across the connected Jellyfin library's artists,
 * albums and tracks in one call ([MusicRepository.search]). The music slice of what
 * `apps/web/src/features/search/SearchPage.tsx` does for every media type at once, and — like
 * [ArtistDetailViewModel]/[AlbumDetailViewModel] — calls no `availability()` precheck of its
 * own; the search call's own [MusicSearchResult.Failed] carrying [JELLYFIN_NOT_CONFIGURED_CODE]
 * already answers "is Jellyfin usable" for free, the same reasoning those two classes' own doc
 * comments give.
 *
 * [onQueryChange] is the only entry point: it updates the visible field text immediately, then
 * cancels any pending or in-flight search and starts a fresh one behind [MUSIC_SEARCH_DEBOUNCE_MS]
 * of `delay()`. That cancel-then-relaunch, together with [searchSequence] below, is what gives
 * this class both of its correctness properties at once, the same way `PodcastsViewModel
 * .submitSearch`'s own `searchJob` gives the first one for an explicit-submit search: rapid
 * typing never sends more than the one request the text eventually settles on (nothing before
 * that survives to fire — cancellation during `delay()` is a plain suspension-point throw, and
 * a genuine one), and a slower, already in-flight response for an earlier term never becomes the
 * lasting result either.
 *
 * That second guarantee is *not* something coroutine cancellation alone provides here, and the
 * reason is worth stating precisely. [MusicRepository] reaches a *blocking* OkHttp call inside
 * `withContext(Dispatchers.IO)`, so a request that has already started always runs to completion
 * regardless of `cancel()`; only the resumption back onto Main is subject to cancellation, and
 * that resumption's timing relative to `cancel()` is not something this class controls or can
 * rely on. [performSearch] therefore never lets a network result reach `_uiState` on trust: it
 * compares the sequence number captured when *that* search was launched against [searchSequence]
 * immediately before writing, and drops the result if a newer `onQueryChange`/[retry] has since
 * moved on. That comparison is a plain, single-threaded-at-the-write-site field read with no
 * dependency on cancellation timing, so it holds in every interleaving, not just the common one.
 */
class MusicSearchViewModel(
    private val musicRepository: MusicRepository,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MusicSearchUiState())
    val uiState: StateFlow<MusicSearchUiState> = _uiState.asStateFlow()

    // Cancelled and replaced on every onQueryChange (and by retry) — see this class's own doc
    // comment for why this single field is what makes the debounce guarantee hold. It is *not*
    // what makes the stale-response guarantee hold — see [searchSequence] for that one.
    private var searchJob: Job? = null

    // Bumped every time a new "live" search is issued — by a debounced onQueryChange, by retry,
    // or by onQueryChange clearing the field back to Idle. [performSearch] captures the value at
    // launch and compares it against this field immediately before writing to `_uiState`, so a
    // network response for a since-superseded query can never land: the comparison is a plain
    // field read at the write site, so it holds regardless of how two searches' resumptions
    // actually interleave, unlike relying on `searchJob.cancel()` alone (see the class doc
    // comment for why that alone is not enough here).
    private var searchSequence: Int = 0

    /** Called on every keystroke. Updates the visible field text unconditionally, then either
     * settles [MusicSearchResultsUiState] back to [MusicSearchResultsUiState.Idle] (an empty or
     * blank field — no request to debounce) or schedules a debounced search for the trimmed
     * term. */
    fun onQueryChange(newQuery: String) {
        _uiState.value = _uiState.value.copy(query = newQuery)
        searchJob?.cancel()
        val term = newQuery.trim()
        if (term.isEmpty()) {
            // Supersedes any still-in-flight search even though nothing new is being issued —
            // otherwise a response for the just-abandoned term could still land after the field
            // has already gone Idle.
            searchSequence++
            _uiState.value = _uiState.value.copy(resultsState = MusicSearchResultsUiState.Idle)
            return
        }
        _uiState.value = _uiState.value.copy(resultsState = MusicSearchResultsUiState.Searching)
        val sequence = ++searchSequence
        searchJob =
            viewModelScope.launch {
                delay(MUSIC_SEARCH_DEBOUNCE_MS)
                performSearch(term, sequence)
            }
    }

    /** Re-issues the current field's search after a [MusicSearchResultsUiState.Failed] result —
     * wired to [MusicSearchScreen]'s "Retry" button. Skips the debounce delay entirely: a retry
     * is one explicit, already-deliberate user action, not typing, so there is nothing left to
     * coalesce against. A no-op if the field is blank — the retry button is never shown outside
     * [MusicSearchResultsUiState.Failed], which itself is unreachable from a blank field (see
     * [onQueryChange]), so this guard is defensive, not a reachable UI path on its own. */
    fun retry() {
        val term = _uiState.value.query.trim()
        if (term.isEmpty()) return
        searchJob?.cancel()
        _uiState.value = _uiState.value.copy(resultsState = MusicSearchResultsUiState.Searching)
        val sequence = ++searchSequence
        searchJob = viewModelScope.launch { performSearch(term, sequence) }
    }

    private suspend fun performSearch(
        term: String,
        sequence: Int,
    ) {
        val baseUrl = serverConfigRepository.getBaseUrl()
        val result = musicRepository.search(term)
        // See [searchSequence]'s own comment: this is what actually stops a stale, already
        // in-flight response from overwriting a newer search's result — cancelling [searchJob]
        // cannot, since the network call behind it is blocking and always runs to completion.
        if (sequence != searchSequence) return
        when (result) {
            is MusicSearchResult.Loaded ->
                _uiState.value =
                    _uiState.value.copy(
                        resultsState =
                            MusicSearchResultsUiState.Results(
                                artists = result.artists.map { it.toUi(baseUrl) },
                                albums = result.albums.map { it.toUi(baseUrl) },
                                tracks = result.tracks.map { it.toSearchUi(baseUrl) },
                            ),
                    )
            is MusicSearchResult.Failed ->
                _uiState.value =
                    _uiState.value.copy(
                        resultsState =
                            if (result.code == JELLYFIN_NOT_CONFIGURED_CODE) {
                                MusicSearchResultsUiState.Unconfigured
                            } else {
                                MusicSearchResultsUiState.Failed(musicErrorMessage(result.code))
                            },
                    )
        }
    }
}
