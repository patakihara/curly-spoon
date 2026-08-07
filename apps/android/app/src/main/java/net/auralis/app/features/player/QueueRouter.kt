package net.auralis.app.features.player

/**
 * What to do next when the currently loaded item finishes — the Android counterpart to
 * `apps/web/src/features/player/queueRouter.ts`, but solving a different problem than that file
 * does. Web's `installQueueRouter` exists because `playerStore.load()` nulls `onTrackEnded` on
 * every call, so a *stale, previously-attached* handler had to be re-attached after every load.
 * [PlayerViewModel]'s single [Player.Listener][androidx.media3.common.Player.Listener] has no
 * such staleness: it is installed once and re-evaluates which content type is current every time
 * `onPlaybackStateChanged` fires `STATE_ENDED`, so there is nothing to go stale and nothing to
 * re-attach. [resolveAdvanceAction] is the piece that *is* still needed on both platforms: given
 * which content type just finished, decide what "next" means for it. That decision is pulled out
 * into this pure, JVM-testable function — see [PlayerViewModel]'s own doc comment on
 * `handlePlaybackEnded` for where it's called from and why that call site, not this function
 * itself, is what makes the router "wired in" rather than merely correct.
 */
sealed interface QueueAdvanceAction {
    /** Nothing queued for the finishing content type — including [QueueContentType.MUSIC]
     *  always: Media3's own playlist already advanced itself before `STATE_ENDED` could ever
     *  fire for a mid-queue track (`STATE_ENDED` on a multi-item Media3 playlist only fires once
     *  the *last* item finishes), so there is never a music action for this router to take. */
    data object None : QueueAdvanceAction

    /** Seek within the item already loaded — the same-book chapter-advance case. Never a
     *  reload: `docs/HANDOVER.md`'s progress-sync notes are explicit that a reload restarts the
     *  Audiobookshelf session and corrupts `timeListened` bookkeeping, and a same-book chapter
     *  is by definition a position within the track already loaded. */
    data class SeekWithinCurrent(val positionMs: Long) : QueueAdvanceAction

    /** Load a different audiobook item, then (for a cross-book chapter entry) seek to
     *  [thenSeekToMs] once it starts. `null` for a plain [AudiobookQueueEntry.Item]. */
    data class LoadAudiobookItem(val itemId: String, val thenSeekToMs: Long?) : QueueAdvanceAction

    /** Load the next queued podcast episode. */
    data class LoadPodcastEpisode(val itemId: String, val episodeId: String) : QueueAdvanceAction
}

/**
 * Decides [QueueAdvanceAction] for whichever content type just finished, and — as a side effect
 * — advances that type's [QueueStore] (never a different one, per `docs/ROADMAP.md` §12f's
 * requirement that switching types must not clear an unrelated queue: this function only ever
 * touches the single store matching [finishedContentType]). [currentAudiobookItemId] is the book
 * id already loaded when [finishedContentType] is [QueueContentType.AUDIOBOOK] — used to tell a
 * same-book chapter (seek) from a different book or a cross-book chapter (load, then seek).
 */
fun resolveAdvanceAction(
    finishedContentType: QueueContentType?,
    currentAudiobookItemId: String?,
    podcastQueue: QueueStore<PodcastQueueEntry>,
    audiobookQueue: QueueStore<AudiobookQueueEntry>,
): QueueAdvanceAction =
    when (finishedContentType) {
        null, QueueContentType.MUSIC -> QueueAdvanceAction.None
        QueueContentType.PODCAST -> {
            val next = podcastQueue.advance() ?: return QueueAdvanceAction.None
            QueueAdvanceAction.LoadPodcastEpisode(next.itemId, next.episodeId)
        }
        QueueContentType.AUDIOBOOK -> {
            when (val next = audiobookQueue.advance() ?: return QueueAdvanceAction.None) {
                is AudiobookQueueEntry.Item -> QueueAdvanceAction.LoadAudiobookItem(next.itemId, thenSeekToMs = null)
                is AudiobookQueueEntry.Chapter ->
                    if (next.itemId == currentAudiobookItemId) {
                        QueueAdvanceAction.SeekWithinCurrent(next.startMs)
                    } else {
                        QueueAdvanceAction.LoadAudiobookItem(next.itemId, thenSeekToMs = next.startMs)
                    }
            }
        }
    }
