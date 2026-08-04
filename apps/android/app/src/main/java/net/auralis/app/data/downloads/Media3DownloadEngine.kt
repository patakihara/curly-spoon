package net.auralis.app.data.downloads

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.auralis.app.playback.AuralisDownloadService
import java.io.IOException

/**
 * The real, Media3-backed [DownloadEngine] — see that interface's doc comment for the shape this
 * replaces ([UnavailableDownloadEngine]), and [net.auralis.app.AppContainer] for how the
 * [DownloadManager] this class wraps is constructed and shared.
 *
 * Every Media3 type here is `@UnstableApi`, so — like
 * [net.auralis.app.playback.AuralisMediaLibraryService] — this class is deliberately kept out of
 * this project's unit-test surface: the stub `android.jar` these tests run against throws on any
 * real framework call, and there is no Robolectric harness to fake one. [DownloadRequestId] is
 * the one piece of genuinely decidable logic this class needs (the `String` id convention that
 * lets [downloadsFor] recover `itemId`/`fileId` from a Media3 `Download`), and it lives in the
 * framework-free layer instead, fully unit-tested there. This wave's real verification is the CI
 * compile (`./gradlew test assembleDebug`) plus a later on-device check — no device has ever
 * exercised the code below.
 *
 * `enqueue`/`cancel` are routed through [DownloadService.sendAddDownload]/
 * [DownloadService.sendRemoveDownload] rather than calling [downloadManager] directly, so that
 * enqueuing or cancelling a download also starts [AuralisDownloadService] if it isn't already
 * running. The foreground service is what keeps the download alive while the app is
 * backgrounded; calling [DownloadManager.addDownload] directly would queue the request into the
 * manager's on-disk index but wouldn't guarantee anything is actually running to act on it.
 */
// @OptIn (consuming), not @UnstableApi on the class — this class's own public surface
// (DownloadEngine's enqueue/cancel/downloadsFor) never exposes a Media3 type, only its
// constructor's backing properties do, so there is nothing here that needs to propagate the
// opt-in requirement to this class's own callers. Matches AuralisMediaLibraryService's and
// AppContainer's identical use of the same pattern.
@OptIn(UnstableApi::class)
class Media3DownloadEngine(
    private val context: Context,
    private val downloadManager: DownloadManager,
) : DownloadEngine {
    override suspend fun enqueue(
        itemId: String,
        fileId: String,
        uri: String,
    ) {
        val request = DownloadRequest.Builder(DownloadRequestId(itemId, fileId).encode(), Uri.parse(uri)).build()
        DownloadService.sendAddDownload(context, AuralisDownloadService::class.java, request, /* foreground = */ true)
    }

    override suspend fun cancel(
        itemId: String,
        fileId: String,
    ) {
        val id = DownloadRequestId(itemId, fileId).encode()
        DownloadService.sendRemoveDownload(context, AuralisDownloadService::class.java, id, /* foreground = */ true)
    }

    /**
     * Reads [DownloadManager.getDownloadIndex] directly rather than going through the service —
     * this is a pure read of already-persisted state, so nothing needs to be running to answer
     * it. That index is documented (`DownloadIndex.java`, confirmed at the pinned 1.5.1 tag) as
     * `@WorkerThread`-only ("may be slow and shouldn't normally be called on the main thread"),
     * hence [Dispatchers.IO]. Degrades to an empty list on [IOException] instead of throwing —
     * the index is a local SQLite file, and a locked or corrupt read should read as "nothing
     * known yet" rather than crash whatever screen asked, matching this project's total-function
     * house style.
     */
    override suspend fun downloadsFor(itemId: String): List<DownloadedItem> =
        withContext(Dispatchers.IO) {
            try {
                downloadManager.downloadIndex.getDownloads().use { cursor ->
                    buildList {
                        while (cursor.moveToNext()) {
                            cursor.download.toDownloadedItemOrNull(itemId)?.let(::add)
                        }
                    }
                }
            } catch (_: IOException) {
                emptyList()
            }
        }
}

/**
 * `null` when [Download.request]'s id isn't a [DownloadRequestId] this engine produced (see that
 * class's own doc comment), or belongs to a different item than [itemId] — [Media3DownloadEngine]
 * `.downloadsFor` filters by item id itself rather than pushing a per-item query down into
 * [androidx.media3.exoplayer.offline.DownloadIndex], which only supports filtering by state, not
 * by a substring of the id.
 */
private fun Download.toDownloadedItemOrNull(itemId: String): DownloadedItem? {
    val id = DownloadRequestId.decode(request.id) ?: return null
    if (id.itemId != itemId) return null
    return DownloadedItem(
        itemId = id.itemId,
        fileId = id.fileId,
        state = downloadStateFromMedia3(state),
        bytesDownloaded = bytesDownloaded,
        // Download.contentLength is C.LENGTH_UNSET (-1) when unknown, which DownloadedItem's own
        // "<= 0 means unknown" convention already covers — see that field's doc comment.
        totalBytes = contentLength,
        // Media3's own Download.FailureReason has exactly two values, NONE and UNKNOWN
        // (confirmed at the pinned 1.5.1 tag, Download.java) — there is no more specific message
        // to surface, so this is the most honest string available rather than a fabricated one.
        failureReason = if (state == Download.STATE_FAILED) "Download failed" else null,
    )
}
