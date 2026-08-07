package net.auralis.app.features.player

/**
 * Which of the three independent queues (Android wave 12f — see [QueueStore]) a currently-loaded
 * item belongs to. [PlayerViewModel] sets this explicitly at each of its three play entry points
 * ([PlayerViewModel.playItem] -> [AUDIOBOOK], [PlayerViewModel.playEpisode] -> [PODCAST],
 * [PlayerViewModel.playQueue] -> [MUSIC]) rather than inferring it from the Media3 media id the
 * way [isMusicMediaId] does for Jellyfin progress reporting: those three functions are the only
 * three ways anything ever gets loaded, so the type is already known statically at the call
 * site, and inferring it a second way risks the two ever disagreeing.
 */
enum class QueueContentType { MUSIC, PODCAST, AUDIOBOOK }

/** One queued podcast episode. `podcastTitle` is carried alongside `itemId` (the podcast's own
 *  library item id) purely for a future queue-list UI's display — this wave adds no such UI
 *  (see the wave's own spec), but the field costs nothing to carry now and saves a second fetch
 *  later, matching `apps/web/src/features/player/queueEntries.ts`'s `PodcastQueueEntry`. */
data class PodcastQueueEntry(
    val itemId: String,
    val episodeId: String,
    val title: String,
    val podcastTitle: String?,
)

/**
 * A whole book, or one chapter of one — matching
 * `apps/web/src/features/player/queueEntries.ts`'s `AudiobookQueueEntry` union. A chapter has no
 * URL of its own: [PlaybackHandle] only ever loads a book's resolved audio track
 * ([PlayerViewModel]'s own header — "plays only the first track of an item"), so a chapter is a
 * position *within* that track's timeline, not a separate playable file. [Chapter.startMs] is
 * therefore always resolved as "load [Chapter.itemId], then seek to [Chapter.startMs]" — see
 * [PlayerViewModel]'s playback-ended dispatch for where that resolution happens, and its own doc
 * comment for why a same-book chapter advance seeks instead of reloading.
 */
sealed interface AudiobookQueueEntry {
    data class Item(val itemId: String, val title: String) : AudiobookQueueEntry

    data class Chapter(
        val itemId: String,
        val chapterId: String,
        val title: String,
        val bookTitle: String,
        val startMs: Long,
    ) : AudiobookQueueEntry
}

/** One queued music track — Android's counterpart to `musicQueueStore.ts`'s entries, kept
 *  intentionally minimal: unlike web, Android's actual cross-track advance for music already
 *  runs on Media3's own tested playlist/shuffle/repeat machinery ([PlayerViewModel.playQueue],
 *  [PlaybackHandle.addMediaItems]'s wave I pagination) — this queue exists so music has the same
 *  independent, clearable model the other two content types get, not to replace Media3's own
 *  queue mechanics. Its cursor is kept in sync with Media3's real position by
 *  [PlayerViewModel]'s `onMediaItemTransition` listener, not by driving playback itself. */
data class MusicQueueEntry(
    val itemId: String,
    val title: String,
    val artist: String?,
)
