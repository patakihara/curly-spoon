package net.develivarr.auralis.features.music

import net.develivarr.auralis.playback.ResolvedPlayback

/**
 * Cap on how many tracks a single "play album"/"play playlist" tap will ever queue beyond the
 * page already on screen. Without one, a pathological playlist (thousands of entries) would
 * have [appendRemainingQueuePages] keep fetching and appending pages to the Media3 queue for as
 * long as playback continues to run in the background — unbounded memory in the queue and
 * unbounded BFF traffic for a single tap. 2000 tracks is generous for anything this app's own
 * paging screens are meant to browse (a multi-hour listen at ~4 min/track), while still being a
 * small, fixed amount of extra work for the pathological case: once reached,
 * [musicQueueAppendPages] simply stops proposing further pages and whatever is queued keeps
 * playing — see that function's own doc comment for the exact cutoff behaviour.
 */
internal const val QUEUE_APPEND_CAP = 2000

/**
 * Pure: the list of page start indices still needed to grow a queue that already has
 * [loadedCount] items toward `min(total, cap)`, in [pageSize]-sized steps — the same page size
 * [MusicRepository.tracks]/[MusicRepository.playlistItems] already page with
 * ([MUSIC_PAGE_SIZE]). Kept free of any repository/network/ViewModel type, the same reasoning
 * [hasMoreMusicPages] is its own pure function for: testable directly, without a coroutine or a
 * `MockWebServer`.
 *
 * Returns an empty list — never throws, never loops — once [loadedCount] already reaches or
 * exceeds `min(total, cap)`. That "or exceeds" matters for [cap] specifically: a huge [total]
 * with a small [loadedCount] still yields exactly enough starts to reach [cap] and stop there,
 * not one page further, which is what bounds [appendRemainingQueuePages]'s own fetching.
 */
internal fun musicQueueAppendPages(
    loadedCount: Int,
    total: Int,
    pageSize: Int,
    cap: Int,
): List<Int> {
    val target = minOf(total, cap)
    if (loadedCount >= target) return emptyList()
    return (loadedCount until target step pageSize).toList()
}

/**
 * Drives [musicQueueAppendPages]' plan against a real (or fake, in tests) page source, calling
 * [onPage] once per successfully-fetched page so the caller (`PlayerViewModel.playQueue`) can
 * append each page to the live Media3 queue as it arrives — never waiting for the whole album/
 * playlist before playback can start; see `AlbumDetailViewModel.appendRemainingToQueue`'s own
 * doc comment for why this is called only *after* the first page is already playing.
 *
 * [fetchPage] returns `null` on failure (mirroring [MusicRepository.tracks]/`.playlistItems`'s
 * own `Failed` result, translated at the call site) rather than throwing — a failed page fetch
 * mid-playback must be non-fatal: this function simply stops proposing further pages, so
 * whatever is already queued keeps playing undisturbed and nothing retries. An empty page (the
 * upstream's own `total` overstated what's really there) degrades the same way, for the same
 * reason.
 *
 * [toResolved] turns one fetched page of [MusicTrackUi] into the [ResolvedPlayback]s
 * `PlayerViewModel` queues — a suspend lambda because resolving a stream URL per track
 * ([MusicRepository.trackStreamUrl]) is itself suspend, even though it never awaits a network
 * response (see that method's own doc comment).
 */
internal suspend fun appendRemainingQueuePages(
    loadedCount: Int,
    total: Int,
    pageSize: Int = MUSIC_PAGE_SIZE,
    cap: Int = QUEUE_APPEND_CAP,
    fetchPage: suspend (startIndex: Int, limit: Int) -> List<MusicTrackUi>?,
    toResolved: suspend (List<MusicTrackUi>) -> List<ResolvedPlayback>,
    onPage: suspend (List<ResolvedPlayback>) -> Unit,
) {
    for (startIndex in musicQueueAppendPages(loadedCount, total, pageSize, cap)) {
        val page = fetchPage(startIndex, pageSize) ?: return
        if (page.isEmpty()) return
        onPage(toResolved(page))
    }
}
