package net.auralis.app.features.podcasts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.auralis.app.data.model.LibraryItem
import net.auralis.app.data.model.MediaProgress
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.settings.ServerConfigRepository
import kotlin.math.roundToLong

/** One row in the episode list — a flattened, display-ready view of a `PodcastEpisode` plus
 * its resolved [EpisodeProgressState]. */
data class PodcastEpisodeUi(
    val id: String,
    val title: String,
    val publishedAt: Long?,
    val durationSeconds: Long,
    val progressState: EpisodeProgressState,
)

/** The podcast container's own display fields, plus its episode list — already sorted and
 * progress-annotated for the current [PodcastDetailViewModel]'s order. */
data class PodcastDetailUiData(
    val title: String,
    val author: String?,
    val description: String?,
    val coverUrl: String?,
    val episodes: List<PodcastEpisodeUi>,
)

sealed interface PodcastDetailUiState {
    data object Loading : PodcastDetailUiState

    data class Loaded(val data: PodcastDetailUiData, val order: EpisodeOrder) : PodcastDetailUiState

    /** [itemId] resolved to a real item, but not a podcast — a stale link, or a bare item id
     * for a book reused by mistake. [title] is still shown, since the fetch itself succeeded. */
    data class NotAPodcast(val title: String) : PodcastDetailUiState

    data class Failed(val message: String) : PodcastDetailUiState
}

/**
 * Backs [PodcastDetailScreen]: one podcast's metadata and episode list. Mirrors
 * `apps/web/src/features/podcasts/PodcastDetailPage.tsx` — an expanded `GET /items/:id` fetch
 * (the only fetch that populates `media.episodes`, per [net.auralis.app.data.model.MediaSummary]
 * `episodes`'s own doc comment) plus `GET /me/progress` for per-episode listening state, since
 * Audiobookshelf never populates item-level progress on a podcast container.
 *
 * [order]/[setOrder] re-derive [PodcastDetailUiState.Loaded] from the already-fetched
 * [rawItem]/[allProgress] with no network round trip — flipping "Newest first" ↔ "Oldest first"
 * is a pure re-sort of data already in hand, not a reason to hit the BFF again.
 */
class PodcastDetailViewModel(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
    private val itemId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow<PodcastDetailUiState>(PodcastDetailUiState.Loading)
    val uiState: StateFlow<PodcastDetailUiState> = _uiState.asStateFlow()

    private var order: EpisodeOrder = EpisodeOrder.NEWEST
    private var rawItem: LibraryItem? = null
    private var allProgress: List<MediaProgress> = emptyList()
    private var cachedBaseUrl: String? = null

    fun load() {
        _uiState.value = PodcastDetailUiState.Loading
        viewModelScope.launch {
            try {
                val item = apiClient.libraryItem(itemId, expanded = true)
                if (item.media.kind != "podcast") {
                    _uiState.value = PodcastDetailUiState.NotAPodcast(item.media.title)
                    return@launch
                }
                rawItem = item
                allProgress = progressOrEmpty()
                cachedBaseUrl = serverConfigRepository.getBaseUrl()
                _uiState.value = PodcastDetailUiState.Loaded(buildData(item, allProgress, cachedBaseUrl), order)
            } catch (e: ApiException) {
                _uiState.value = PodcastDetailUiState.Failed(e.message)
            }
        }
    }

    /** Degrades to an empty progress list rather than failing the whole screen: progress is
     * enrichment (played/in-progress badges), not the core "what can I play" data — a failed
     * `GET /me/progress` should leave every episode reading as unplayed, not the screen showing
     * nothing at all. Matches [net.auralis.app.playback.PlaybackItemResolver.libraryItemOrNull]'s
     * own degrade-rather-than-fail-the-caller style. */
    private suspend fun progressOrEmpty(): List<MediaProgress> =
        try {
            apiClient.myProgress()
        } catch (e: ApiException) {
            emptyList()
        }

    /** Switches episode order and re-renders from already-fetched data. A no-op before [load]
     * has ever succeeded — there is nothing to re-sort yet. */
    fun setOrder(newOrder: EpisodeOrder) {
        order = newOrder
        val item = rawItem ?: return
        _uiState.value = PodcastDetailUiState.Loaded(buildData(item, allProgress, cachedBaseUrl), order)
    }

    private fun buildData(
        item: LibraryItem,
        allProgress: List<MediaProgress>,
        baseUrl: String?,
    ): PodcastDetailUiData {
        val media = item.media
        val episodes = sortEpisodes(media.episodes ?: emptyList(), order)
        return PodcastDetailUiData(
            title = media.title,
            author = media.author,
            description = media.description,
            coverUrl = baseUrl?.let { "${it.trimEnd('/')}/api/v1/media/${item.id}/cover?width=400" },
            episodes =
                episodes.map { episode ->
                    PodcastEpisodeUi(
                        id = episode.id,
                        title = episode.title,
                        publishedAt = episode.publishedAt,
                        durationSeconds = episode.duration.roundToLong(),
                        progressState =
                            episodeProgressState(findEpisodeProgress(allProgress, item.id, episode.id)),
                    )
                },
        )
    }
}
