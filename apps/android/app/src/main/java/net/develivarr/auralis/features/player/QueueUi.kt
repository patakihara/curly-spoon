package net.develivarr.auralis.features.player

/**
 * The queue view's pure mapping layer (Android wave 12f) — deliberately holds no Android UI
 * import and no [androidx.media3.common.MediaItem] reference (see [MediaItemSummary]'s own doc
 * comment for why), so every branch worth getting wrong here runs on the plain JVM under
 * [QueueUiTest] rather than needing a device this project doesn't have.
 */

/** One row in the queue view — one podcast episode, one audiobook item/chapter, or one Media3
 *  playlist entry, whichever content type is currently live (see [PlayerViewModel.currentContentTypeFlow]).
 *  [id] is a stable key for a `LazyColumn`, never re-derived from [title]/[subtitle], which are
 *  free-text and not guaranteed unique. */
data class QueueRowUi(
    val id: String,
    val title: String,
    val subtitle: String?,
    val isCurrent: Boolean,
)

/**
 * A minimal, pure summary of one Media3 [androidx.media3.common.MediaItem] — deliberately not the
 * real type: [androidx.media3.common.MediaItem] is an Android type that would make this file
 * untestable on the JVM (no Robolectric in this project — see [PlaybackHandle]'s own doc
 * comment). [PlayerViewModel] adapts each real `MediaItem` it reads off [PlaybackHandle] into one
 * of these before handing the list to [musicQueueRows].
 */
data class MediaItemSummary(
    val id: String,
    val title: String,
    val artist: String?,
)

/**
 * Builds the queue view's rows from a podcast [SimpleQueueState]. `null` — nothing queued —
 * yields an empty list, not a crash. [SimpleQueueState.cursor] of `-1` (the bootstrap value set
 * by [QueueStore.enqueueNext]/[QueueStore.enqueueLast] on an empty queue — see either's own doc
 * comment) marks **no** row current: a podcast queue never holds the episode playing right now,
 * only what comes after it — that identity lives on [PlayerViewModel] itself, not in this store.
 */
fun podcastQueueRows(state: SimpleQueueState<PodcastQueueEntry>?): List<QueueRowUi> {
    val current = state ?: return emptyList()
    return current.order.mapIndexed { index, entry ->
        QueueRowUi(
            id = entry.episodeId,
            title = entry.title,
            subtitle = entry.podcastTitle,
            isCurrent = index == current.cursor,
        )
    }
}

/**
 * The [podcastQueueRows] counterpart for audiobooks. Every [AudiobookQueueEntry] variant maps to
 * a row with a non-blank title: a plain [AudiobookQueueEntry.Item] has no book to disambiguate
 * itself from and so gets no subtitle, while an [AudiobookQueueEntry.Chapter] carries its own
 * book's title as the subtitle so a queued chapter still says which book it belongs to. Same
 * `null`/cursor rules as [podcastQueueRows] — see that function's own doc comment.
 */
fun audiobookQueueRows(state: SimpleQueueState<AudiobookQueueEntry>?): List<QueueRowUi> {
    val current = state ?: return emptyList()
    return current.order.mapIndexed { index, entry ->
        val row =
            when (entry) {
                is AudiobookQueueEntry.Item ->
                    QueueRowUi(id = entry.itemId, title = entry.title, subtitle = null, isCurrent = false)
                is AudiobookQueueEntry.Chapter ->
                    QueueRowUi(
                        id = entry.chapterId,
                        title = entry.title,
                        subtitle = entry.bookTitle,
                        isCurrent = false,
                    )
            }
        row.copy(isCurrent = index == current.cursor)
    }
}

/**
 * Builds the queue view's rows from Media3's real playlist (Android wave 12f's central point —
 * see `PlayerViewModel.musicQueue`'s own doc comment: the music "queue" is Media3's playlist, not
 * a [QueueStore]). [items] is already adapted to plain [MediaItemSummary]s by the caller — see
 * that type's own doc comment for why the real [androidx.media3.common.MediaItem] never reaches
 * this pure file. [currentIndex] is [PlaybackHandle.currentMediaItemIndex]; `-1` (nothing loaded,
 * matching a real empty Media3 playlist) marks no row current, exactly like an out-of-range index
 * would — no row's position ever equals `-1`.
 */
fun musicQueueRows(
    items: List<MediaItemSummary>,
    currentIndex: Int,
): List<QueueRowUi> =
    items.mapIndexed { index, item ->
        QueueRowUi(id = item.id, title = item.title, subtitle = item.artist, isCurrent = index == currentIndex)
    }
