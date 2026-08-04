package net.auralis.app.data.downloads

/**
 * The framework-facing boundary [DownloadRepository] decides *through*, never *around*: every
 * method here is plain data in, plain data out, so [DownloadRepository]'s own logic (what to
 * download, what state the offline-kept set is in) stays Media3-free and unit-testable on the
 * plain JVM, matching this project's established pattern of isolating framework construction at
 * a thin edge (see [MediaItemConversions]'s and [PlaybackItemResolver]'s doc comments).
 *
 * This wave ships this interface plus a fake for tests only. Wave F2 implements it against
 * Media3's `DownloadManager`/`DownloadService` — `enqueue` becomes a `DownloadRequest` built
 * from `uri` and handed to `DownloadManager.addDownload`, `cancel` a `DownloadManager.removeDownload`,
 * and `downloadsFor` a query against `DownloadManager.downloadIndex` mapped through
 * `downloadStateFromMedia3` (see that function's doc comment).
 */
interface DownloadEngine {
    /** Starts (or resumes) downloading one track. `fileId` identifies the track within `itemId` — see [DownloadedItem]. */
    suspend fun enqueue(
        itemId: String,
        fileId: String,
        uri: String,
    )

    /** Cancels and removes one track's download. A no-op, not an error, if it was never enqueued — matches this project's total-function house style. */
    suspend fun cancel(
        itemId: String,
        fileId: String,
    )

    /** Current known state of every track download belonging to `itemId`, in no particular order. Empty when none exist. */
    suspend fun downloadsFor(itemId: String): List<DownloadedItem>
}

/**
 * Stands in for the real Media3-backed [DownloadEngine] until Wave F2 lands one. Every operation
 * degrades cleanly — `enqueue`/`cancel` are no-ops, `downloadsFor` always answers `emptyList()` —
 * rather than throwing or silently pretending a download started, matching this project's
 * explicit-degradation house style (an unimplemented capability gets a named, honest stand-in,
 * not a `TODO()` that crashes the first time something calls it).
 *
 * [net.auralis.app.AppContainer] wires this in today. Swap it for the real implementation there
 * once Wave F2 exists — that is the one line this class exists to make trivial to replace.
 */
class UnavailableDownloadEngine : DownloadEngine {
    override suspend fun enqueue(
        itemId: String,
        fileId: String,
        uri: String,
    ) {
        // No-op: nothing to enqueue into yet. DownloadRepository still records the item as
        // "kept offline" so the intent survives until a real engine exists to act on it.
    }

    override suspend fun cancel(
        itemId: String,
        fileId: String,
    ) {
        // No-op, matching enqueue above.
    }

    override suspend fun downloadsFor(itemId: String): List<DownloadedItem> = emptyList()
}
