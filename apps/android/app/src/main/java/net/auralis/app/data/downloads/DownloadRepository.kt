package net.auralis.app.data.downloads

import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.network.KeyValueStore
import net.auralis.app.data.network.fileIdFromContentUrl

/** Outcome of [DownloadRepository.enqueue] — a total function's result type, not an exception. */
sealed interface DownloadEnqueueResult {
    /** `trackCount` tracks were handed to the [DownloadEngine]. */
    data class Enqueued(val trackCount: Int) : DownloadEnqueueResult

    /** The item resolved, but had no track this project knows how to turn into a URL. */
    data object NoPlayableTrack : DownloadEnqueueResult

    /** The upstream call failed; `code` is the originating [ApiException.code]. */
    data class Failed(val code: String) : DownloadEnqueueResult

    /**
     * [DownloadEngine.isAvailable] was `false` — there is no engine yet that could act on this
     * request (the current build wires [UnavailableDownloadEngine] until Wave F2 lands a real
     * one). Nothing was queued and, critically, `itemId` was **not** added to
     * [DownloadRepository.keptOfflineItemIds] — the earlier version of this class recorded it
     * anyway, which produced a kept-offline entry indistinguishable from a real, successful
     * download that [DownloadEngine.downloadsFor] would then never report anything about.
     */
    data object Unavailable : DownloadEnqueueResult
}

/**
 * The decidable half of offline downloads: what to download, and which items the user has asked
 * to keep offline. Framework construction (turning this into real bytes on disk) is
 * [DownloadEngine]'s job, injected here rather than reached for directly — see that interface's
 * own doc comment for why, and [MediaItemConversions]/[PlaybackItemResolver] for the same split
 * applied elsewhere in this project. This class imports no `androidx.media3`/`android.*` type,
 * so it is fully unit-testable on the plain JVM.
 *
 * **Multi-track decision**: unlike [PlaybackItemResolver] — which deliberately resolves only the
 * *first* playable track of a multi-track audiobook today, because playing the rest needs a
 * stitched timeline the player doesn't yet build (see [PlaybackItemResolver]'s own doc comment
 * and `TrackSelection.kt`'s) — [enqueue] downloads **every** track `POST /items/:id/play` hands
 * back. Downloading is not subject to the same limitation: each track is an independent file on
 * disk, [DownloadEngine.enqueue] is already per-track, and Media3's `DownloadManager` needs no
 * stitched timeline to fetch one. Downloading only the first track of, say, a 20-hour, 12-file
 * audiobook would silently strand a listener after track one the moment they lost signal — the
 * exact commute scenario `docs/ROADMAP.md` §7 names as this feature's reason to exist — so this
 * class does not inherit [PlaybackItemResolver]'s single-track scoping, and says so here
 * explicitly rather than leaving the divergence to be rediscovered later.
 */
class DownloadRepository(
    private val apiClient: ApiClient,
    private val keyValueStore: KeyValueStore,
    private val downloadEngine: DownloadEngine,
) {
    /** Every item id the user has asked to keep available offline, regardless of current download state. */
    suspend fun keptOfflineItemIds(): Set<String> = keyValueStore.getStringSet(KEPT_OFFLINE_KEY)

    /**
     * Resolves `itemId`'s tracks via the same `POST /items/:id/play` call
     * [PlaybackItemResolver.resolve] uses, then hands every resolvable track's URL to
     * [downloadEngine]. Degrades to [DownloadEnqueueResult.NoPlayableTrack] rather than
     * downloading nothing silently, and to [DownloadEnqueueResult.Failed] rather than throwing
     * on any [ApiException] — matching this project's total-function house style (see
     * [BrowseTreeRepository]/[PlaybackItemResolver]'s own try/catch-and-degrade methods).
     *
     * Marks `itemId` as kept-offline only on a successful enqueue, so a failed attempt doesn't
     * leave a phantom entry in [keptOfflineItemIds] with nothing actually queued behind it. Checked
     * first and before any network call: [DownloadEnqueueResult.Unavailable] when
     * [downloadEngine]'s [DownloadEngine.isAvailable] is `false`, for the same reason — a
     * placeholder engine's no-op "success" is otherwise indistinguishable from a real one.
     */
    suspend fun enqueue(itemId: String): DownloadEnqueueResult =
        if (!downloadEngine.isAvailable) {
            DownloadEnqueueResult.Unavailable
        } else {
            try {
                val session = apiClient.playItem(itemId)
                val resolvedTracks =
                    session.audioTracks.mapNotNull { track ->
                        val fileId = fileIdFromContentUrl(track.contentUrl) ?: return@mapNotNull null
                        fileId to apiClient.audioTrackUrl(itemId, fileId)
                    }
                if (resolvedTracks.isEmpty()) {
                    DownloadEnqueueResult.NoPlayableTrack
                } else {
                    resolvedTracks.forEach { (fileId, url) -> downloadEngine.enqueue(itemId, fileId, url) }
                    addKeptOffline(itemId)
                    DownloadEnqueueResult.Enqueued(resolvedTracks.size)
                }
            } catch (e: ApiException) {
                DownloadEnqueueResult.Failed(e.code)
            }
        }

    /**
     * Cancels every track download [downloadEngine] currently knows about for `itemId` and
     * removes it from the kept-offline set. Order matters: the engine is asked to stop first, so
     * a crash between the two calls leaves a stray "kept offline" entry (harmless — the user can
     * just try again) rather than an item whose files silently keep downloading with no record
     * the user ever asked to keep it.
     *
     * Needs no [DownloadEngine.isAvailable] check of its own, unlike [enqueue]: an unavailable
     * engine's [DownloadEngine.downloadsFor] answers `emptyList()`, so the loop below is
     * naturally a no-op, and [removeKeptOffline] on an id that was never added (which, since the
     * [enqueue] fix, is now always true for an unavailable engine) is a harmless no-op set
     * difference. The one case this quietly does something useful: an item kept-offline by a
     * build *before* this fix — back when [enqueue] recorded one unconditionally — gets its
     * phantom entry cleaned up the first time this is called on it.
     */
    suspend fun cancel(itemId: String) {
        downloadEngine.downloadsFor(itemId).forEach { downloadEngine.cancel(itemId, it.fileId) }
        removeKeptOffline(itemId)
    }

    private suspend fun addKeptOffline(itemId: String) {
        val current = keyValueStore.getStringSet(KEPT_OFFLINE_KEY)
        keyValueStore.putStringSet(KEPT_OFFLINE_KEY, current + itemId)
    }

    private suspend fun removeKeptOffline(itemId: String) {
        val current = keyValueStore.getStringSet(KEPT_OFFLINE_KEY)
        keyValueStore.putStringSet(KEPT_OFFLINE_KEY, current - itemId)
    }

    private companion object {
        const val KEPT_OFFLINE_KEY = "downloads.kept_offline_item_ids"
    }
}
