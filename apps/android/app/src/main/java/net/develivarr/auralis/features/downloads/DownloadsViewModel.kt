package net.develivarr.auralis.features.downloads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.downloads.DownloadRepository
import net.develivarr.auralis.data.downloads.DownloadState
import net.develivarr.auralis.data.downloads.DownloadSummary
import net.develivarr.auralis.data.downloads.downloadProgress
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.settings.ServerConfigRepository

/** The state of one download's cancel/remove button, keyed by item id in [DownloadsUiState]. */
sealed interface DownloadCancelState {
    data object Idle : DownloadCancelState

    data object Pending : DownloadCancelState
}

/** One row on the downloads screen — a [DownloadSummary] joined with the item's own title/cover
 * (which [DownloadEngine]/[DownloadRepository] never carry — see their own doc comments on why
 * this package stays free of anything beyond id/state/bytes) and this screen's own cancel state. */
data class DownloadListItemUi(
    val itemId: String,
    val title: String,
    val coverUrl: String?,
    val state: DownloadState,
    val progress: Float,
    val cancelState: DownloadCancelState,
)

sealed interface DownloadsUiState {
    data object Loading : DownloadsUiState

    data class Loaded(val items: List<DownloadListItemUi>) : DownloadsUiState

    data class Error(val message: String) : DownloadsUiState
}

/** Cached per-item metadata a [DownloadSummary] alone doesn't carry. */
private data class ItemMetadata(val title: String, val coverUrl: String?)

/**
 * Backs [DownloadsScreen]: what's downloaded or downloading, with per-item progress and
 * cancel/remove. See [refresh] for the metadata-caching strategy and [startPolling] for how
 * progress stays live.
 *
 * **Live progress — chosen approach and why**: [DownloadEngine.downloadsFor] is a suspend
 * snapshot query, not a `Flow`/listener (Wave F1's own author flagged this as the thing this
 * wave should reconsider — see `DownloadEngine.kt`'s doc comment). A `DownloadManager.Listener`-
 * driven push model would be strictly more efficient, but it can only be wired inside
 * [net.develivarr.auralis.data.downloads.Media3DownloadEngine], which is Media3-heavy and — per this
 * wave's own constraint — cannot be unit-tested in this project at all (stub `android.jar`, no
 * Robolectric). Polling from here instead keeps every line touched by this wave inside a
 * framework-free, testable class: [startPolling] itself is thin, untested plumbing (see its own
 * doc comment), but the thing it repeatedly calls — [refresh] — is fully covered by
 * `DownloadsViewModelTest` via the same `MockWebServer`-backed pattern `RequestsViewModelTest`
 * and `HomeViewModelTest` already use. A future wave can swap the polling loop for a listener
 * without touching [refresh]'s contract at all.
 */
class DownloadsViewModel(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
    private val downloadRepository: DownloadRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<DownloadsUiState>(DownloadsUiState.Loading)
    val uiState: StateFlow<DownloadsUiState> = _uiState.asStateFlow()

    private var pollingJob: Job? = null
    private val metadataCache = mutableMapOf<String, ItemMetadata>()
    private var cancelStates: Map<String, DownloadCancelState> = emptyMap()

    /**
     * Starts refreshing [uiState] every [POLL_INTERVAL_MS] until this ViewModel is cleared.
     * Idempotent — a second call while already polling is a no-op, so `DownloadsScreen` can call
     * it unconditionally from a `LaunchedEffect(Unit)` without worrying about recomposition
     * re-triggering it. Not unit-tested: the loop itself is a thin, one-line-bodied wrapper
     * around the already-tested [refresh], and asserting "a `while` loop calls a function
     * repeatedly" under a virtual test clock would exercise the test's own scheduling more than
     * this class's logic — the kind of test this wave's spec explicitly warns against writing.
     * No explicit `stopPolling()` is needed: [viewModelScope] is cancelled automatically when
     * this ViewModel is cleared (navigating away from `DownloadsScreen`), which cancels this
     * job with it.
     */
    fun startPolling() {
        if (pollingJob?.isActive == true) return
        pollingJob =
            viewModelScope.launch {
                while (isActive) {
                    refresh()
                    delay(POLL_INTERVAL_MS)
                }
            }
    }

    /**
     * One fetch-and-render pass: every kept-offline item's [DownloadSummary], joined with cached
     * (or freshly fetched) title/cover metadata. Metadata is fetched at most once per item and
     * kept in [metadataCache] across polls — a book's title doesn't change while it downloads,
     * so re-fetching it on every 2-second tick would be pure waste; only the [DownloadSummary]
     * (state/bytes) is re-read every call, which is the part that actually changes.
     * [metadataCache] entries for items no longer in the summary list (cancelled, or removed by
     * some other path) are dropped so a long-running polling session doesn't leak memory.
     */
    suspend fun refresh() {
        try {
            val summaries = downloadRepository.downloadSummaries()
            val baseUrl = serverConfigRepository.getBaseUrl()
            val activeIds = summaries.map { it.itemId }.toSet()
            metadataCache.keys.retainAll(activeIds)
            cancelStates = cancelStates.filterKeys { it in activeIds }
            val items = summaries.map { it.toUi(baseUrl) }
            _uiState.value = DownloadsUiState.Loaded(items)
        } catch (e: ApiException) {
            _uiState.value = DownloadsUiState.Error(e.message)
        }
    }

    private suspend fun DownloadSummary.toUi(baseUrl: String?): DownloadListItemUi {
        val meta = metadataCache[itemId] ?: fetchMetadata(itemId, baseUrl).also { metadataCache[itemId] = it }
        return DownloadListItemUi(
            itemId = itemId,
            title = meta.title,
            coverUrl = meta.coverUrl,
            state = state,
            progress = downloadProgress(bytesDownloaded, totalBytes),
            cancelState = cancelStates[itemId] ?: DownloadCancelState.Idle,
        )
    }

    /**
     * Degrades to the bare item id as a title, with no cover, on any [ApiException] — a title
     * lookup failing for one item (deleted upstream, a transient blip) must not blank the whole
     * downloads screen; an id is an ugly but honest fallback, matching this project's
     * total-function house style.
     */
    private suspend fun fetchMetadata(
        itemId: String,
        baseUrl: String?,
    ): ItemMetadata =
        try {
            val item = apiClient.libraryItem(itemId)
            ItemMetadata(
                title = item.media.title,
                coverUrl = baseUrl?.let { "${it.trimEnd('/')}/api/v1/media/$itemId/cover?width=200" },
            )
        } catch (e: ApiException) {
            ItemMetadata(title = itemId, coverUrl = null)
        }

    /**
     * Cancels/removes [itemId]'s download. [DownloadRepository.cancel] is itself a total
     * function with no failure case to surface (see its own doc comment — every step it takes
     * degrades to a no-op rather than throwing), so [DownloadCancelState] only ever needs
     * [DownloadCancelState.Pending] as a transient "in progress" flag; it's cleared by the
     * [refresh] this triggers, which drops the item (and its cancel-state entry) from
     * [uiState] entirely once it's gone from [DownloadRepository.downloadSummaries].
     */
    fun cancel(itemId: String) {
        cancelStates = cancelStates + (itemId to DownloadCancelState.Pending)
        viewModelScope.launch {
            downloadRepository.cancel(itemId)
            metadataCache.remove(itemId)
            refresh()
        }
    }

    private companion object {
        const val POLL_INTERVAL_MS = 2_000L
    }
}
