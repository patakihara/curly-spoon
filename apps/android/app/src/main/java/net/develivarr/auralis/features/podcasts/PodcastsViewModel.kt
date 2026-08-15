package net.develivarr.auralis.features.podcasts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.model.Library
import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.model.PodcastDirectoryResult
import net.develivarr.auralis.data.model.PodcastFeedPreview
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.settings.ServerConfigRepository

/** One subscribed podcast, as shown in the "My podcasts" list. */
data class PodcastListEntry(
    val id: String,
    val title: String,
    val author: String?,
    val coverUrl: String?,
)

/** The state of loading the signed-in server's subscribed podcasts. */
sealed interface MyPodcastsUiState {
    data object Loading : MyPodcastsUiState

    data class Loaded(val podcasts: List<PodcastListEntry>) : MyPodcastsUiState

    /** No podcast-mediaType library exists on this server yet — distinct from [Failed]: there
     * is nothing wrong, just nothing to show and nowhere to subscribe into. */
    data object NoLibrary : MyPodcastsUiState

    data class Failed(val message: String) : MyPodcastsUiState
}

/** The state of a `GET /podcasts/search` call for the currently submitted term. */
sealed interface DirectorySearchUiState {
    data object Idle : DirectorySearchUiState

    data object Loading : DirectorySearchUiState

    data class Results(val results: List<PodcastDirectoryResult>) : DirectorySearchUiState

    data class Failed(val message: String) : DirectorySearchUiState
}

/** The state of previewing one RSS feed before subscribing — reached either from a directory
 * search result or a pasted RSS URL. See [PodcastsViewModel.startPreview]. */
sealed interface FeedPreviewUiState {
    data object Idle : FeedPreviewUiState

    data object Loading : FeedPreviewUiState

    data class Loaded(
        val preview: PodcastFeedPreview,
        val rssFeed: String,
        val directoryResult: PodcastDirectoryResult?,
    ) : FeedPreviewUiState

    data class Failed(val message: String) : FeedPreviewUiState
}

/** The state of subscribing to the currently-previewed feed. */
sealed interface SubscribeUiState {
    data object Idle : SubscribeUiState

    data object Pending : SubscribeUiState

    data object Subscribed : SubscribeUiState

    data class Failed(val message: String) : SubscribeUiState

    /** [buildSubscribeBody] couldn't build a request — no podcast library, or that library has
     * no folder configured. Distinct from [Failed]: nothing was attempted over the network. */
    data object CannotSubscribe : SubscribeUiState
}

data class PodcastsUiState(
    val searchTerm: String = "",
    val submittedTerm: String = "",
    val rssUrl: String = "",
    val myPodcastsState: MyPodcastsUiState = MyPodcastsUiState.Loading,
    val searchState: DirectorySearchUiState = DirectorySearchUiState.Idle,
    val previewState: FeedPreviewUiState = FeedPreviewUiState.Idle,
    val subscribeState: SubscribeUiState = SubscribeUiState.Idle,
)

/**
 * Backs [PodcastsScreen]: the subscribed-podcasts list, directory search, RSS feed preview and
 * subscribe. Mirrors `apps/web/src/features/podcasts/PodcastDiscoverPage.tsx`'s flow — search
 * only runs on explicit [submitSearch], never per keystroke, since it fans out to a real
 * upstream (the iTunes-backed directory) on every call, same reasoning as
 * `RequestsViewModel.submitSearch`.
 *
 * The podcast-mediaType [Library] is resolved once, in [loadMyPodcasts] (which already calls
 * `GET /libraries` to find it), and cached in [podcastLibrary] rather than re-fetched by
 * [subscribe] — a second `GET /libraries` call there would just be spending a network round
 * trip to re-derive something already in hand.
 */
class PodcastsViewModel(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PodcastsUiState())
    val uiState: StateFlow<PodcastsUiState> = _uiState.asStateFlow()

    private var podcastLibrary: Library? = null

    // Cancelled and replaced on every submitSearch — same reasoning as RequestsViewModel's
    // searchJob: without this, a slow earlier search's response can land after a faster later
    // one and overwrite it.
    private var searchJob: Job? = null

    fun onSearchTermChange(term: String) {
        _uiState.value = _uiState.value.copy(searchTerm = term)
    }

    fun onRssUrlChange(url: String) {
        _uiState.value = _uiState.value.copy(rssUrl = url)
    }

    /**
     * Loads the podcast-mediaType library's subscribed items. Audiobookshelf libraries are
     * typed per `mediaType`, so every item `GET /libraries/{id}/items` returns for a podcast
     * library is already a podcast — no client-side filtering needed, unlike a mixed catalog.
     */
    fun loadMyPodcasts() {
        _uiState.value = _uiState.value.copy(myPodcastsState = MyPodcastsUiState.Loading)
        viewModelScope.launch {
            try {
                val library = apiClient.libraries().find { it.mediaType == "podcast" }
                podcastLibrary = library
                if (library == null) {
                    _uiState.value = _uiState.value.copy(myPodcastsState = MyPodcastsUiState.NoLibrary)
                    return@launch
                }
                val items = apiClient.libraryItems(library.id).items
                val baseUrl = serverConfigRepository.getBaseUrl()
                _uiState.value =
                    _uiState.value.copy(
                        myPodcastsState = MyPodcastsUiState.Loaded(items.map { it.toListEntry(baseUrl) }),
                    )
            } catch (e: ApiException) {
                _uiState.value = _uiState.value.copy(myPodcastsState = MyPodcastsUiState.Failed(e.message))
            }
        }
    }

    fun submitSearch() {
        val term = _uiState.value.searchTerm.trim()
        if (term.isEmpty()) {
            _uiState.value =
                _uiState.value.copy(submittedTerm = term, searchState = DirectorySearchUiState.Idle)
            return
        }
        _uiState.value =
            _uiState.value.copy(submittedTerm = term, searchState = DirectorySearchUiState.Loading)
        searchJob?.cancel()
        searchJob =
            viewModelScope.launch {
                try {
                    val results = apiClient.searchPodcastDirectory(term)
                    _uiState.value = _uiState.value.copy(searchState = DirectorySearchUiState.Results(results))
                } catch (e: ApiException) {
                    _uiState.value = _uiState.value.copy(searchState = DirectorySearchUiState.Failed(e.message))
                }
            }
    }

    /**
     * Previews one feed before subscribing — reached either by tapping a directory search
     * result ([directoryResult] non-null, carrying `itunesId`/`pageUrl` through to the eventual
     * subscribe body) or by submitting a pasted RSS URL directly ([directoryResult] null).
     * Resets [SubscribeUiState] to [SubscribeUiState.Idle]: a fresh preview invalidates any
     * earlier subscribe outcome, which belonged to whatever feed was previewed before it.
     */
    fun startPreview(
        directoryResult: PodcastDirectoryResult?,
        rssFeed: String,
    ) {
        _uiState.value =
            _uiState.value.copy(previewState = FeedPreviewUiState.Loading, subscribeState = SubscribeUiState.Idle)
        viewModelScope.launch {
            try {
                val preview = apiClient.previewPodcastFeed(rssFeed)
                _uiState.value =
                    _uiState.value.copy(
                        previewState = FeedPreviewUiState.Loaded(preview, rssFeed, directoryResult),
                    )
            } catch (e: ApiException) {
                _uiState.value = _uiState.value.copy(previewState = FeedPreviewUiState.Failed(e.message))
            }
        }
    }

    /** Clears the current preview (and any subscribe outcome with it) — e.g. the user backs
     * out of a preview without subscribing. */
    fun dismissPreview() {
        _uiState.value =
            _uiState.value.copy(previewState = FeedPreviewUiState.Idle, subscribeState = SubscribeUiState.Idle)
    }

    /**
     * Subscribes to the currently-previewed feed. A no-op (state left untouched) if there is no
     * loaded preview to subscribe from — the screen only ever calls this when one is showing, so
     * that's a defensive guard, not a reachable UI path.
     *
     * On success, reloads [loadMyPodcasts] so the new subscription shows in the list right away
     * without the user having to leave and re-enter this screen.
     */
    fun subscribe() {
        val preview = (_uiState.value.previewState as? FeedPreviewUiState.Loaded) ?: return
        val library = podcastLibrary
        if (library == null) {
            _uiState.value = _uiState.value.copy(subscribeState = SubscribeUiState.CannotSubscribe)
            return
        }
        val body = buildSubscribeBody(preview.preview, preview.rssFeed, library, preview.directoryResult)
        if (body == null) {
            _uiState.value = _uiState.value.copy(subscribeState = SubscribeUiState.CannotSubscribe)
            return
        }
        _uiState.value = _uiState.value.copy(subscribeState = SubscribeUiState.Pending)
        viewModelScope.launch {
            try {
                apiClient.subscribePodcast(body)
                _uiState.value = _uiState.value.copy(subscribeState = SubscribeUiState.Subscribed)
                loadMyPodcasts()
            } catch (e: ApiException) {
                _uiState.value = _uiState.value.copy(subscribeState = SubscribeUiState.Failed(e.message))
            }
        }
    }

    private fun LibraryItem.toListEntry(baseUrl: String?): PodcastListEntry =
        PodcastListEntry(
            id = id,
            title = media.title,
            author = media.author,
            coverUrl = baseUrl?.let { "${it.trimEnd('/')}/api/v1/media/$id/cover?width=200" },
        )
}
