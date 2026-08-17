package net.develivarr.auralis.features.musicrequests

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.model.MusicCandidate
import net.develivarr.auralis.data.model.MusicRequest
import net.develivarr.auralis.data.model.MusicSearchError
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException

/** The state of a `GET /music-requests/search` call for the currently submitted term. */
sealed interface MusicSearchUiState {
    data object Idle : MusicSearchUiState

    data object Loading : MusicSearchUiState

    /** [errors] renders alongside [candidates], never in place of them — same reasoning as
     * `RequestsViewModel`'s `SearchUiState.Results`. */
    data class Results(val candidates: List<MusicCandidate>, val errors: List<MusicSearchError>) : MusicSearchUiState

    data class Failed(val message: String) : MusicSearchUiState
}

/**
 * The state of requesting one specific [MusicCandidate], keyed by its `guid` in
 * [MusicRequestsUiState]. Unlike the book pipeline's `ReleaseRequestState`, there is no
 * "request anyway" counterpart here — `POST /music-requests` requires a candidate (see
 * `CreateMusicRequestBody`'s doc comment), so a candidate row is the only way to request.
 */
sealed interface CandidateRequestState {
    data object Idle : CandidateRequestState

    data object Pending : CandidateRequestState

    data object Requested : CandidateRequestState

    data class Failed(val message: String) : CandidateRequestState
}

/** The state of the `GET /music-requests` list fetch. */
sealed interface MusicRequestListUiState {
    data object Loading : MusicRequestListUiState

    data class Loaded(val requests: List<MusicRequest>) : MusicRequestListUiState

    data class Failed(val message: String) : MusicRequestListUiState
}

/** The state of a retry or delete action on one specific request, keyed by its `id`. */
sealed interface MusicRequestActionState {
    data object Idle : MusicRequestActionState

    data object Pending : MusicRequestActionState

    data class Failed(val message: String) : MusicRequestActionState
}

data class MusicRequestsUiState(
    val searchTerm: String = "",
    val submittedTerm: String = "",
    val searchState: MusicSearchUiState = MusicSearchUiState.Idle,
    val candidateRequestStates: Map<String, CandidateRequestState> = emptyMap(),
    val requestListState: MusicRequestListUiState = MusicRequestListUiState.Loading,
    val requestActionStates: Map<String, MusicRequestActionState> = emptyMap(),
)

/**
 * Backs [MusicRequestsScreen]: searching the configured music provider (slskd) for a track
 * and turning a result into a `MusicRequest`. Mirrors `features/requests/RequestsViewModel`,
 * the book-request equivalent this wave is modelled on — same search-cancellation, same
 * per-id pending-state maps for the request list's retry/delete actions. The one structural
 * difference is deliberate: there is no "request anyway" path (see [CandidateRequestState]'s
 * doc comment), so this class has no `TitleRequestState` counterpart at all.
 *
 * Wave 15d — [initialSearchTerm], `null` for every pre-15d caller, seeds
 * [MusicRequestsUiState.searchTerm] so [MusicRequestsScreen] can open with an artist name
 * already typed (an external "not in your library" recommendation's tap target). It only sets
 * the initial state; nothing here calls [submitSearch] automatically — see
 * [MusicRequestsScreen]'s own doc comment for why that's a deliberate choice, not an oversight.
 */
class MusicRequestsViewModel(
    private val apiClient: ApiClient,
    initialSearchTerm: String? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MusicRequestsUiState(searchTerm = initialSearchTerm.orEmpty()))
    val uiState: StateFlow<MusicRequestsUiState> = _uiState.asStateFlow()

    // Cancelled and replaced on every submitSearch — without this, a slow earlier search's
    // response can land after a faster later one and overwrite it. See
    // `RequestsViewModel.searchJob`'s identical comment.
    private var searchJob: Job? = null

    fun onSearchTermChange(term: String) {
        _uiState.value = _uiState.value.copy(searchTerm = term)
    }

    fun submitSearch() {
        val term = _uiState.value.searchTerm.trim()
        _uiState.value =
            _uiState.value.copy(
                submittedTerm = term,
                searchState = MusicSearchUiState.Loading,
            )
        searchJob?.cancel()
        searchJob =
            viewModelScope.launch {
                try {
                    val result = apiClient.searchMusicRequests(term)
                    _uiState.value =
                        _uiState.value.copy(
                            searchState = MusicSearchUiState.Results(result.candidates, result.errors),
                        )
                } catch (e: ApiException) {
                    _uiState.value = _uiState.value.copy(searchState = MusicSearchUiState.Failed(e.message))
                }
            }
    }

    fun requestCandidate(candidate: MusicCandidate) {
        _uiState.value =
            _uiState.value.copy(
                candidateRequestStates = _uiState.value.candidateRequestStates + (candidate.guid to CandidateRequestState.Pending),
            )
        viewModelScope.launch {
            try {
                apiClient.createMusicRequest(candidate)
                _uiState.value =
                    _uiState.value.copy(
                        candidateRequestStates =
                            _uiState.value.candidateRequestStates + (candidate.guid to CandidateRequestState.Requested),
                    )
            } catch (e: ApiException) {
                _uiState.value =
                    _uiState.value.copy(
                        candidateRequestStates =
                            _uiState.value.candidateRequestStates + (candidate.guid to CandidateRequestState.Failed(e.message)),
                    )
            }
        }
    }

    /**
     * Loads the signed-in user's existing music requests, newest first — mirrors
     * `RequestsViewModel.loadRequests`. Deliberately not called from `init {}` for the same
     * reason: several tests construct this class and enqueue exactly one `MockWebServer`
     * response for `submitSearch()`/`requestCandidate()`, and an eager fetch here would
     * consume it instead. Only [MusicRequestsScreen]'s `LaunchedEffect` calls this.
     */
    fun loadRequests() {
        _uiState.value = _uiState.value.copy(requestListState = MusicRequestListUiState.Loading)
        viewModelScope.launch {
            try {
                val requests = apiClient.listMusicRequests().sortedByDescending { it.createdAt }
                _uiState.value = _uiState.value.copy(requestListState = MusicRequestListUiState.Loaded(requests))
            } catch (e: ApiException) {
                _uiState.value = _uiState.value.copy(requestListState = MusicRequestListUiState.Failed(e.message))
            }
        }
    }

    /**
     * Retries one failed request. On success, the request returned by the retry call replaces
     * its entry in the current list in place; every other request is left untouched, and the
     * per-id action state resets to [MusicRequestActionState.Idle] — identical shape to
     * `RequestsViewModel.retryRequest`.
     */
    fun retryRequest(id: String) {
        _uiState.value =
            _uiState.value.copy(
                requestActionStates = _uiState.value.requestActionStates + (id to MusicRequestActionState.Pending),
            )
        viewModelScope.launch {
            try {
                val updated = apiClient.retryMusicRequest(id)
                val currentListState = _uiState.value.requestListState
                val newListState =
                    if (currentListState is MusicRequestListUiState.Loaded) {
                        MusicRequestListUiState.Loaded(
                            currentListState.requests.map { if (it.id == id) updated else it },
                        )
                    } else {
                        currentListState
                    }
                _uiState.value =
                    _uiState.value.copy(
                        requestListState = newListState,
                        requestActionStates = _uiState.value.requestActionStates + (id to MusicRequestActionState.Idle),
                    )
            } catch (e: ApiException) {
                _uiState.value =
                    _uiState.value.copy(
                        requestActionStates = _uiState.value.requestActionStates + (id to MusicRequestActionState.Failed(e.message)),
                    )
            }
        }
    }

    /**
     * Deletes one request outright — always available, regardless of status. On success it is
     * removed from the list and its action-state entry is dropped entirely; on failure the
     * list is untouched and the id's action state becomes [MusicRequestActionState.Failed].
     * Identical shape to `RequestsViewModel.deleteRequest`.
     */
    fun deleteRequest(id: String) {
        _uiState.value =
            _uiState.value.copy(
                requestActionStates = _uiState.value.requestActionStates + (id to MusicRequestActionState.Pending),
            )
        viewModelScope.launch {
            try {
                apiClient.deleteMusicRequest(id)
                val currentListState = _uiState.value.requestListState
                val newListState =
                    if (currentListState is MusicRequestListUiState.Loaded) {
                        MusicRequestListUiState.Loaded(currentListState.requests.filterNot { it.id == id })
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
                        requestActionStates = _uiState.value.requestActionStates + (id to MusicRequestActionState.Failed(e.message)),
                    )
            }
        }
    }
}
