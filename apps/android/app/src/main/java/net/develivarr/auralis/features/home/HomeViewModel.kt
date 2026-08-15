package net.develivarr.auralis.features.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.downloads.DownloadEnqueueResult
import net.develivarr.auralis.data.downloads.DownloadRepository
import net.develivarr.auralis.data.model.Shelf
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.settings.ServerConfigRepository

/** One card in a [ShelfUi]'s row — a flattened, display-ready view of a `LibraryItem`. */
data class ShelfItemUi(
    val id: String,
    val title: String,
    val coverUrl: String?,
)

/** One horizontally-scrolling row on the home screen, mapped from a `Shelf`. */
data class ShelfUi(
    val id: String,
    val label: String,
    val items: List<ShelfItemUi>,
)

sealed interface HomeUiState {
    data object Loading : HomeUiState

    data class Loaded(val shelves: List<ShelfUi>) : HomeUiState

    data class Error(val message: String) : HomeUiState
}

/**
 * The state of one shelf item's download button, keyed by item id in
 * [HomeViewModel.downloadStates]. Deliberately carries no payload (unlike
 * [DownloadEnqueueResult], which it's derived from) — the label/enablement this state drives
 * (see `HomeScreen.kt`'s `downloadActionLabel`) only needs to know *which* of the four outcomes
 * happened, and the human-readable detail for each goes to [HomeViewModel.downloadEvents]
 * instead, so a screen doesn't need to format the same message twice from two different places.
 */
enum class DownloadActionState { IDLE, PENDING, ENQUEUED, NO_PLAYABLE_TRACK, FAILED, UNAVAILABLE }

/** One snackbar-worthy outcome of [HomeViewModel.startDownload], carrying the full message a
 * [DownloadActionState] alone can't (a track count, an error code). */
data class DownloadEvent(val itemId: String, val message: String)

/**
 * Loads the signed-in user's first library's home shelves. Cover URLs are resolved here,
 * once, rather than at composition time — building one needs [ServerConfigRepository]'s
 * suspend `getBaseUrl()`, so resolving it per-recomposition would mean re-suspending for a
 * value that never changes for the lifetime of this ViewModel.
 *
 * Also owns starting an offline download for a shelf item (Wave F2b) — there is no book-detail
 * screen anywhere in this app yet (confirmed by reading every file under `features/`), and the
 * home shelves are the one surface every book already appears on, so the download action lives
 * here rather than on a screen that doesn't exist. [downloadStates] is deliberately a *separate*
 * [StateFlow] from [uiState] rather than folded into [HomeUiState.Loaded]: a download's outcome
 * has nothing to do with whether the shelves themselves loaded, and keeping them apart means a
 * download update never has to reconstruct the (unrelated) shelf list around it.
 */
class HomeViewModel(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
    private val downloadRepository: DownloadRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _downloadStates = MutableStateFlow<Map<String, DownloadActionState>>(emptyMap())
    val downloadStates: StateFlow<Map<String, DownloadActionState>> = _downloadStates.asStateFlow()

    // extraBufferCapacity = 1 so a startDownload() that completes before the screen's collector
    // is (re)installed isn't silently dropped by SharedFlow's default zero-capacity buffer — a
    // snackbar arriving one recomposition late is fine; one that never arrives is the bug this
    // avoids. replay = 0 (the default) is still correct: an old download's message replaying
    // into a screen that only just started collecting would show a stale toast for an action
    // the user never took in this session.
    private val _downloadEvents = MutableSharedFlow<DownloadEvent>(extraBufferCapacity = 1)
    val downloadEvents: SharedFlow<DownloadEvent> = _downloadEvents.asSharedFlow()

    init {
        viewModelScope.launch {
            try {
                val baseUrl =
                    serverConfigRepository.getBaseUrl()
                        ?: throw ApiException("server_not_configured", "No Auralis server configured", 0)
                val libraries = apiClient.libraries()
                val firstLibrary = libraries.firstOrNull()
                if (firstLibrary == null) {
                    _uiState.value = HomeUiState.Loaded(emptyList())
                    return@launch
                }
                val shelves = apiClient.libraryHome(firstLibrary.id)
                _uiState.value = HomeUiState.Loaded(shelves.map { it.toUi(baseUrl) })
            } catch (e: ApiException) {
                _uiState.value = HomeUiState.Error(e.message)
            }
        }
    }

    private fun Shelf.toUi(baseUrl: String): ShelfUi =
        ShelfUi(
            id = id,
            label = label,
            items =
                items.map { item ->
                    ShelfItemUi(
                        id = item.id,
                        title = item.media.title,
                        coverUrl = "${baseUrl.trimEnd('/')}/api/v1/media/${item.id}/cover?width=200",
                    )
                },
        )

    /**
     * Starts an offline download for [itemId]. Surfaces all four [DownloadEnqueueResult] cases
     * distinctly — as required by the wave's own spec, not collapsed into a single "done"/"error"
     * toast — via [downloadStates] (drives the button's own label) and [downloadEvents] (the
     * one-shot snackbar message with the full detail).
     */
    fun startDownload(itemId: String) {
        _downloadStates.value = _downloadStates.value + (itemId to DownloadActionState.PENDING)
        viewModelScope.launch {
            val result = downloadRepository.enqueue(itemId)
            val (state, message) =
                when (result) {
                    is DownloadEnqueueResult.Enqueued ->
                        DownloadActionState.ENQUEUED to
                            "Downloading ${result.trackCount} track${if (result.trackCount == 1) "" else "s"}…"
                    is DownloadEnqueueResult.NoPlayableTrack ->
                        DownloadActionState.NO_PLAYABLE_TRACK to "This item has no track that can be downloaded."
                    is DownloadEnqueueResult.Failed ->
                        DownloadActionState.FAILED to "Download failed (${result.code})."
                    is DownloadEnqueueResult.Unavailable ->
                        DownloadActionState.UNAVAILABLE to "Downloads aren't available on this build."
                }
            _downloadStates.value = _downloadStates.value + (itemId to state)
            _downloadEvents.emit(DownloadEvent(itemId, message))
        }
    }
}
