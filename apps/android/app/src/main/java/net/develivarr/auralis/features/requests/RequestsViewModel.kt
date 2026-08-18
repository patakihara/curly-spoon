package net.develivarr.auralis.features.requests

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.model.BookRequest
import net.develivarr.auralis.data.model.Release
import net.develivarr.auralis.data.model.SearchError
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException

/** The state of a `GET /requests/search` call for the currently submitted term. */
sealed interface SearchUiState {
    data object Idle : SearchUiState

    data object Loading : SearchUiState

    /** [errors] renders alongside [releases], never in place of them — see `RequestsScreen`. */
    data class Results(val releases: List<Release>, val errors: List<SearchError>) : SearchUiState

    data class Failed(val message: String) : SearchUiState
}

/** The state of requesting one specific [Release], keyed by its `guid` in [RequestsUiState]. */
sealed interface ReleaseRequestState {
    data object Idle : ReleaseRequestState

    data object Pending : ReleaseRequestState

    data object Requested : ReleaseRequestState

    data class Failed(val message: String) : ReleaseRequestState
}

/** The state of "request anyway" — queuing the submitted title with no release attached. */
sealed interface TitleRequestState {
    data object Idle : TitleRequestState

    data object Pending : TitleRequestState

    data object Requested : TitleRequestState

    data class Failed(val message: String) : TitleRequestState
}

/** The state of the `GET /requests` list fetch. */
sealed interface RequestListUiState {
    data object Loading : RequestListUiState

    data class Loaded(val requests: List<BookRequest>) : RequestListUiState

    data class Failed(val message: String) : RequestListUiState
}

/** The state of a retry or delete action on one specific request, keyed by its `id`. */
sealed interface RequestActionState {
    data object Idle : RequestActionState

    data object Pending : RequestActionState

    data class Failed(val message: String) : RequestActionState
}

data class RequestsUiState(
    val searchTerm: String = "",
    val searchAuthor: String = "",
    val submittedTerm: String = "",
    val submittedAuthor: String = "",
    val searchState: SearchUiState = SearchUiState.Idle,
    val releaseRequestStates: Map<String, ReleaseRequestState> = emptyMap(),
    val titleRequestState: TitleRequestState = TitleRequestState.Idle,
    val requestListState: RequestListUiState = RequestListUiState.Loading,
    val requestActionStates: Map<String, RequestActionState> = emptyMap(),
) {
    /**
     * "Request anyway" is offered whenever the submitted term is non-blank and the search came
     * back with zero releases — regardless of whether that's because nothing matched, every
     * indexer returned an error, or the search request itself failed outright (`Failed`). It is
     * deliberately indifferent to *why* there are no releases: a user whose indexer is down is
     * exactly the user who most needs to queue the request anyway rather than being turned away.
     * See `apps/web/src/features/requests/AskForBookPanel.tsx`'s header comment and
     * `requestAnyway.ts`'s `shouldOfferRequestAnyway` for the reference this mirrors — including
     * the `Failed` case, which React Query's `data` staying `undefined` reduces to the same "zero
     * releases" condition on the web side.
     */
    val offerRequestAnyway: Boolean
        get() {
            val state = searchState
            return submittedTerm.isNotBlank() &&
                (state is SearchUiState.Failed || (state is SearchUiState.Results && state.releases.isEmpty()))
        }
}

/**
 * Backs [RequestsScreen]: searching AudiobookBay/indexer releases for a title, and turning a
 * result (or, when nothing matched, the typed title alone) into a `BookRequest`. Search only
 * runs on explicit [submitSearch], not per keystroke — see `ApiClient.searchReleases`, which
 * fans out to real indexers per call.
 *
 * Wave 15d-1-books — [initialSearchTerm]/[initialSearchAuthor], both `null` for every pre-wave
 * caller, seed [RequestsUiState.searchTerm]/[RequestsUiState.searchAuthor] so [RequestsScreen]
 * can open pre-filled from an external (unowned) recommended-book card's title/author, exactly
 * mirroring [net.develivarr.auralis.features.musicrequests.MusicRequestsViewModel]'s
 * `initialSearchTerm` for the music side of this same wave family (15d). Deliberately does
 * **not** call [submitSearch] itself — pre-filling is not auto-searching, same call
 * `MusicRequestsViewModel` already made; the user still presses the search action explicitly. */
class RequestsViewModel(
    private val apiClient: ApiClient,
    initialSearchTerm: String? = null,
    initialSearchAuthor: String? = null,
) : ViewModel() {
    private val _uiState =
        MutableStateFlow(
            RequestsUiState(
                searchTerm = initialSearchTerm.orEmpty(),
                searchAuthor = initialSearchAuthor.orEmpty(),
            ),
        )
    val uiState: StateFlow<RequestsUiState> = _uiState.asStateFlow()

    // Cancelled and replaced on every submitSearch — without this, a slow earlier search's
    // response can land after a faster later one and overwrite it, since nothing else keys the
    // response to the search that produced it (unlike the web reference, where React Query's
    // query key does this structurally).
    private var searchJob: Job? = null

    fun onSearchTermChange(term: String) {
        _uiState.value = _uiState.value.copy(searchTerm = term)
    }

    fun onSearchAuthorChange(author: String) {
        _uiState.value = _uiState.value.copy(searchAuthor = author)
    }

    fun submitSearch() {
        val term = _uiState.value.searchTerm.trim()
        val author = _uiState.value.searchAuthor.trim()
        _uiState.value =
            _uiState.value.copy(
                submittedTerm = term,
                submittedAuthor = author,
                searchState = SearchUiState.Loading,
                // A fresh search invalidates any earlier "request anyway" outcome — it belonged
                // to the previous submitted term, not this one.
                titleRequestState = TitleRequestState.Idle,
            )
        searchJob?.cancel()
        searchJob =
            viewModelScope.launch {
                try {
                    val result = apiClient.searchReleases(term, author.ifBlank { null })
                    _uiState.value =
                        _uiState.value.copy(
                            searchState = SearchUiState.Results(result.releases, result.errors),
                        )
                } catch (e: ApiException) {
                    _uiState.value = _uiState.value.copy(searchState = SearchUiState.Failed(e.message))
                }
            }
    }

    fun requestRelease(release: Release) {
        _uiState.value =
            _uiState.value.copy(
                releaseRequestStates = _uiState.value.releaseRequestStates + (release.guid to ReleaseRequestState.Pending),
            )
        viewModelScope.launch {
            // The submitted author, not the live field — keeps the request consistent with
            // whatever search actually produced this release, even if the user has since typed
            // something else into the field.
            val submittedAuthor = _uiState.value.submittedAuthor
            try {
                apiClient.createRequest(release.title, submittedAuthor.ifBlank { null }, release)
                _uiState.value =
                    _uiState.value.copy(
                        releaseRequestStates = _uiState.value.releaseRequestStates + (release.guid to ReleaseRequestState.Requested),
                    )
            } catch (e: ApiException) {
                _uiState.value =
                    _uiState.value.copy(
                        releaseRequestStates =
                            _uiState.value.releaseRequestStates + (release.guid to ReleaseRequestState.Failed(e.message)),
                    )
            }
        }
    }

    fun requestAnyway() {
        _uiState.value = _uiState.value.copy(titleRequestState = TitleRequestState.Pending)
        viewModelScope.launch {
            val state = _uiState.value
            try {
                apiClient.createRequest(state.submittedTerm, state.submittedAuthor.ifBlank { null }, release = null)
                _uiState.value = _uiState.value.copy(titleRequestState = TitleRequestState.Requested)
            } catch (e: ApiException) {
                _uiState.value = _uiState.value.copy(titleRequestState = TitleRequestState.Failed(e.message))
            }
        }
    }

    /**
     * Loads the signed-in user's existing requests, newest first — mirrors
     * `apps/web/src/features/requests/RequestList.tsx`'s own `[...requests].sort((a, b) =>
     * b.createdAt - a.createdAt)`. Deliberately not called from `init {}`: this class is
     * constructed fresh in every `RequestsViewModelTest` test, several of which enqueue exactly
     * one `MockWebServer` response for `submitSearch()`/`requestRelease()` — an eager fetch here
     * would consume that response instead. Only [RequestsScreen]'s `LaunchedEffect` calls this.
     */
    fun loadRequests() {
        _uiState.value = _uiState.value.copy(requestListState = RequestListUiState.Loading)
        viewModelScope.launch {
            try {
                val requests = apiClient.listRequests().sortedByDescending { it.createdAt }
                _uiState.value = _uiState.value.copy(requestListState = RequestListUiState.Loaded(requests))
            } catch (e: ApiException) {
                _uiState.value = _uiState.value.copy(requestListState = RequestListUiState.Failed(e.message))
            }
        }
    }

    /**
     * Retries one failed request. On success, the request returned by the retry call replaces
     * its entry in the current list in place — every other request is left untouched — and the
     * per-id action state resets to [RequestActionState.Idle]; the updated status in the list row
     * is the only feedback, matching the web reference, which has no lingering "retried" banner
     * either.
     */
    fun retryRequest(id: String) {
        _uiState.value =
            _uiState.value.copy(
                requestActionStates = _uiState.value.requestActionStates + (id to RequestActionState.Pending),
            )
        viewModelScope.launch {
            try {
                val updated = apiClient.retryRequest(id)
                val currentListState = _uiState.value.requestListState
                val newListState =
                    if (currentListState is RequestListUiState.Loaded) {
                        RequestListUiState.Loaded(
                            currentListState.requests.map { if (it.id == id) updated else it },
                        )
                    } else {
                        currentListState
                    }
                _uiState.value =
                    _uiState.value.copy(
                        requestListState = newListState,
                        requestActionStates = _uiState.value.requestActionStates + (id to RequestActionState.Idle),
                    )
            } catch (e: ApiException) {
                _uiState.value =
                    _uiState.value.copy(
                        requestActionStates = _uiState.value.requestActionStates + (id to RequestActionState.Failed(e.message)),
                    )
            }
        }
    }

    /**
     * Deletes one request outright — always available, regardless of status. On success it is
     * removed from the list and its action-state entry is dropped entirely (there's nothing left
     * to key it to); on failure the list is untouched and the id's action state becomes
     * [RequestActionState.Failed].
     */
    fun deleteRequest(id: String) {
        _uiState.value =
            _uiState.value.copy(
                requestActionStates = _uiState.value.requestActionStates + (id to RequestActionState.Pending),
            )
        viewModelScope.launch {
            try {
                apiClient.deleteRequest(id)
                val currentListState = _uiState.value.requestListState
                val newListState =
                    if (currentListState is RequestListUiState.Loaded) {
                        RequestListUiState.Loaded(currentListState.requests.filterNot { it.id == id })
                    } else {
                        currentListState
                    }
                _uiState.value =
                    _uiState.value.copy(
                        requestListState = newListState,
                        requestActionStates = _uiState.value.requestActionStates - id,
                    )
            } catch (e: ApiException) {
                _uiState.value =
                    _uiState.value.copy(
                        requestActionStates = _uiState.value.requestActionStates + (id to RequestActionState.Failed(e.message)),
                    )
            }
        }
    }
}
