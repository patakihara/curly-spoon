package net.develivarr.auralis.features.books

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
import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.settings.ServerConfigRepository
import net.develivarr.auralis.features.home.DownloadActionState
import net.develivarr.auralis.util.formatDuration
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * One row in [BookDetailScreen]'s chapter list. [timeLabel] is formatted from the chapter's own
 * *start* position, not its duration — mirrors `apps/web/src/features/player/ChapterList.tsx`'s
 * `supportingText={formatDuration(chapter.start)}`, per `docs/design/screens/BOOK_DETAIL.md` §3's
 * "the chapter's formatted time" (that document leaves the choice unstated; the web precedent it
 * shares a spec with settles it). [index] is 1-based display order, not the chapter's own
 * upstream `id`.
 */
data class BookChapterUi(
    val index: Int,
    val title: String,
    val startMs: Long,
    val timeLabel: String,
)

/** [BookDetailScreen]'s loaded content — everything the header, description and chapter list
 * need, already display-ready. */
data class BookDetailUiData(
    val itemId: String,
    val title: String,
    val subtitle: String?,
    /** Comma-joined author names, preferring the structured `authors[]` this endpoint's
     * `expanded=true` genuinely populates (see this file's own doc comment on
     * [BookDetailViewModel] for why that's safe here and not on a shelf/list endpoint), falling
     * back to the flattened `author` string. `null` when neither is present — the screen omits
     * the author line entirely rather than rendering an empty one (§5's fallback contract).
     * Rendered as plain, non-interactive text on Android: this wave does not build an Android
     * author screen (§4/§5/§7 of the spec), unlike web, which links to `/author/:id`. */
    val authorNames: String?,
    val coverUrl: String?,
    val description: String?,
    /** `null` when every one of narrator/duration/chapter-count/progress is absent — the screen
     * omits the whole meta line rather than rendering an empty one. See [composeBookMetaLine]. */
    val metaLine: String?,
    /** Empty when this book has no chapter markers — a normal, common case (a single-file
     * audiobook), not an error state. The screen omits the "Chapters" section entirely rather
     * than showing an empty list (§5). */
    val chapters: List<BookChapterUi>,
    /** "Resume" iff the item carries a progress record, "Play" otherwise — matches
     * `ItemPage.tsx:89`'s existing logic exactly, including *not* special-casing a finished book
     * (§5: "do not add new logic for isFinished"). */
    val playLabel: String,
)

sealed interface BookDetailUiState {
    data object Loading : BookDetailUiState

    data class Loaded(val data: BookDetailUiData) : BookDetailUiState

    /** [itemId] resolved to a real item, but not a book — mirrors
     * [net.develivarr.auralis.features.podcasts.PodcastDetailUiState.NotAPodcast]. Per §5 of the
     * spec, this is "a routing bug elsewhere, not this screen's problem" — surfaced rather than
     * silently coerced. */
    data class NotABook(val title: String) : BookDetailUiState

    data class Failed(val message: String) : BookDetailUiState
}

/**
 * Backs [BookDetailScreen]: one audiobook's metadata, description and chapter list. The book
 * counterpart of [net.develivarr.auralis.features.podcasts.PodcastDetailViewModel] — same shape,
 * one `GET /items/:id` fetch, no BFF change (`docs/design/screens/BOOK_DETAIL.md` §4: this route
 * already serves everything the screen needs).
 *
 * Fetches with `expanded=true&include=progress` via [ApiClient.libraryItem]. **`expanded=true`
 * matters beyond just populating `chapters`**: it's also what makes `media.authors[]`/
 * `media.series[]` carry real, structured entries rather than the minified fallback that bit
 * this project three times before (`docs/HANDOVER.md`, "The minified-item bug") — this endpoint
 * is not one of the list/shelf endpoints that bug applies to, so reading `authors[].name` here is
 * safe. Android's [net.develivarr.auralis.data.model.AuthorRef] already carries a real `id` this
 * wave doesn't use (no Android author screen — see [BookDetailUiData.authorNames]'s doc comment).
 *
 * Download state is this screen's own single-item copy of the four-outcome machinery
 * [net.develivarr.auralis.features.home.HomeViewModel.startDownload] already uses against the
 * shared [DownloadRepository] — reused, not reimplemented, per the wave's own instruction: same
 * [DownloadEnqueueResult] type, same [DownloadActionState] enum and the same
 * [net.develivarr.auralis.features.home.downloadActionLabel]/`downloadActionClickable` label
 * mapping [BookDetailScreen] calls directly (both are `internal`, so visible from this package
 * within the same Gradle module). A dedicated `StateFlow<DownloadActionState>` here rather than
 * the shared `Map<String, DownloadActionState>` [HomeViewModel] keeps: this screen only ever
 * downloads its own [itemId].
 */
class BookDetailViewModel(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
    private val downloadRepository: DownloadRepository,
    private val itemId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow<BookDetailUiState>(BookDetailUiState.Loading)
    val uiState: StateFlow<BookDetailUiState> = _uiState.asStateFlow()

    private val _downloadState = MutableStateFlow(DownloadActionState.IDLE)
    val downloadState: StateFlow<DownloadActionState> = _downloadState.asStateFlow()

    // extraBufferCapacity = 1, replay = 0 — same reasoning as HomeViewModel.downloadEvents' own
    // doc comment: a download that finishes before this screen's collector (re)installs isn't
    // silently dropped, and a stale message from a previous download never replays into a fresh
    // collector.
    private val _downloadMessages = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val downloadMessages: SharedFlow<String> = _downloadMessages.asSharedFlow()

    fun load() {
        _uiState.value = BookDetailUiState.Loading
        viewModelScope.launch {
            try {
                val item = apiClient.libraryItem(itemId, expanded = true, includeProgress = true)
                if (item.media.kind != "book") {
                    _uiState.value = BookDetailUiState.NotABook(item.media.title)
                    return@launch
                }
                val baseUrl = serverConfigRepository.getBaseUrl()
                _uiState.value = BookDetailUiState.Loaded(item.toBookDetailData(baseUrl))
            } catch (e: ApiException) {
                _uiState.value = BookDetailUiState.Failed(e.message)
            }
        }
    }

    /** Starts an offline download of this screen's own [itemId] — the detail-screen counterpart
     * to [net.develivarr.auralis.features.home.HomeViewModel.startDownload], sharing its
     * [DownloadRepository]/[DownloadEnqueueResult] and the outcome-to-label mapping it drives
     * (see this class's own doc comment). */
    fun startDownload() {
        _downloadState.value = DownloadActionState.PENDING
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
            _downloadState.value = state
            _downloadMessages.emit(message)
        }
    }
}

private fun LibraryItem.toBookDetailData(baseUrl: String?): BookDetailUiData {
    val media = this.media
    val authorNames =
        media.authors?.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.name }
            ?: media.author
    val progressPercent = progress?.let { (it.progress * 100).roundToInt().coerceIn(0, 100) }
    val chapters =
        (media.chapters ?: emptyList())
            .sortedBy { it.start }
            .mapIndexed { i, chapter ->
                val startMs = (chapter.start * 1000).roundToLong()
                BookChapterUi(
                    index = i + 1,
                    title = chapter.title,
                    startMs = startMs,
                    timeLabel = formatDuration(startMs / 1000),
                )
            }
    return BookDetailUiData(
        itemId = id,
        title = media.title,
        subtitle = media.subtitle,
        authorNames = authorNames,
        coverUrl = baseUrl?.let { "${it.trimEnd('/')}/api/v1/media/$id/cover?width=400" },
        description = media.description,
        metaLine =
            composeBookMetaLine(
                narrator = media.narrator,
                durationSeconds = media.duration,
                chapterCount = media.chapters?.size,
                progressPercent = progressPercent,
            ),
        chapters = chapters,
        playLabel = if (progress != null) "Resume" else "Play",
    )
}

/**
 * Composes the muted meta line under a book's author — e.g. "Narrated by Rob Inglis · 19 h 07 m
 * · 24 chapters · 38% listened" — joining only the parts that are present, in that fixed order,
 * with " · " between them and never a stray separator when a field is absent. `null` when
 * nothing is present at all, so [BookDetailScreen] omits the whole line rather than rendering an
 * empty one. This is `docs/design/screens/BOOK_DETAIL.md` §5's "meta-line joining rule", written
 * once as a pure function and tested directly rather than as four ad hoc conditionals in the
 * screen, per that section's own instruction.
 */
fun composeBookMetaLine(
    narrator: String?,
    durationSeconds: Double?,
    chapterCount: Int?,
    progressPercent: Int?,
): String? {
    val parts = mutableListOf<String>()
    if (!narrator.isNullOrBlank()) parts += "Narrated by $narrator"
    if (durationSeconds != null && durationSeconds > 0) parts += formatBookDurationLabel(durationSeconds)
    if (chapterCount != null && chapterCount > 0) {
        parts += "$chapterCount chapter${if (chapterCount == 1) "" else "s"}"
    }
    if (progressPercent != null) parts += "$progressPercent% listened"
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

/** A book's *total* duration reads as "19 h 07 m", not [formatDuration]'s clock-style "19:07:00"
 * — a distinct display need from a chapter row's own timestamp (see [BookChapterUi]'s doc
 * comment), matching the design mock's own `'19 h 07 m'` (`docs/design/screens/BOOK_DETAIL.md`
 * §3). Sub-hour durations read as e.g. "42 m", no "0 h" prefix. */
private fun formatBookDurationLabel(seconds: Double): String {
    val totalMinutes = (seconds / 60).roundToLong()
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return if (hours > 0) "%d h %02d m".format(hours, minutes) else "%d m".format(minutes)
}

/**
 * The chapter containing [positionMs], or `null` if none does (an empty chapter list, or a
 * position before the first chapter's own start — shouldn't happen in practice, but this stays
 * total rather than assuming). Assumes [chapters] is already sorted ascending by [BookChapterUi
 * .startMs] — true of every list [BookDetailViewModel] builds (`.sortedBy { it.start }` above) —
 * so the *last* chapter whose start the position has reached is the active one; a chapter with no
 * declared end runs up to the next chapter's start by construction. Per
 * `docs/design/screens/BOOK_DETAIL.md` §5, callers must only use this when the book in question
 * is the player's currently loaded item — "no chapter is marked active" otherwise — this function
 * itself doesn't know or care which book [positionMs] belongs to.
 */
fun activeChapterIndex(
    chapters: List<BookChapterUi>,
    positionMs: Long,
): Int? = chapters.lastOrNull { positionMs >= it.startMs }?.index

/**
 * [BookDetailScreen]'s chapter row's merged accessibility announcement. Per §6 of the spec, each
 * row "must announce, at minimum: its title, its position/duration, and whether it is the
 * currently-active chapter" and that state "must be exposed as a semantic property … not conveyed
 * by colour alone" — mirrors the merged-node `contentDescription` pattern
 * `ForYouCarousel.kt`'s `feedItemAnnouncement` already establishes for this same reason on the For
 * You cards (`Modifier.semantics(mergeDescendants = true) { contentDescription = … }`).
 */
fun chapterAnnouncement(
    chapter: BookChapterUi,
    active: Boolean,
): String =
    if (active) {
        "${chapter.title}, ${chapter.timeLabel}, current chapter"
    } else {
        "${chapter.title}, ${chapter.timeLabel}"
    }
