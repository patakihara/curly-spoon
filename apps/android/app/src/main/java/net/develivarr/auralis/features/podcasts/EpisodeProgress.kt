package net.develivarr.auralis.features.podcasts

import net.develivarr.auralis.data.model.MediaProgress

/** Per-episode listening state for the podcast detail screen's episode list. Mirrors
 * `apps/web/src/features/podcasts/episodeProgress.ts`'s `EpisodeProgressState` exactly. */
enum class EpisodeProgressState {
    UNPLAYED,
    IN_PROGRESS,
    PLAYED,
}

/**
 * No record at all, or a record with nothing played yet, both read as [EpisodeProgressState
 * .UNPLAYED] — a listener has no reason to distinguish "never opened" from "opened, never
 * pressed play" in the episode list. `isFinished` wins over a stale `currentTime` (e.g. a
 * finished episode whose position was later reset). Matches the web reference's
 * `episodeProgressState`.
 */
fun episodeProgressState(progress: MediaProgress?): EpisodeProgressState =
    when {
        progress == null -> EpisodeProgressState.UNPLAYED
        progress.isFinished -> EpisodeProgressState.PLAYED
        progress.currentTime > 0 -> EpisodeProgressState.IN_PROGRESS
        else -> EpisodeProgressState.UNPLAYED
    }

/**
 * Audiobookshelf tracks progress per `(item, episode)` pair, not per episode alone —
 * `GET /me/progress` ([net.develivarr.auralis.data.network.ApiClient.myProgress]) returns every
 * [MediaProgress] record for the signed-in user across every item, books included (a book's
 * record has `episodeId == null`). This is the total lookup that turns that flat list into "the
 * one record for this episode, if any" without ever accidentally matching a book's item-level
 * record against an episode id — matches the web reference's `findEpisodeProgress`.
 */
fun findEpisodeProgress(
    allProgress: List<MediaProgress>,
    itemId: String,
    episodeId: String,
): MediaProgress? =
    allProgress.find { it.libraryItemId == itemId && it.episodeId != null && it.episodeId == episodeId }
