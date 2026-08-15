package net.develivarr.auralis.data.downloads

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
    /**
     * Whether this engine can actually perform a download. Defaults to `true` so every real
     * implementation (including Wave F2's Media3-backed one) satisfies it with no ceremony;
     * [UnavailableDownloadEngine] is the one override, so [DownloadRepository] can detect "no
     * engine exists yet" through the interface instead of an `is UnavailableDownloadEngine`
     * type-sniff that would still compile — and silently do nothing — after Wave F2 deletes that
     * class.
     */
    val isAvailable: Boolean get() = true

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
 * Stood in for the real Media3-backed [DownloadEngine] until Wave F2a landed
 * `Media3DownloadEngine`, which [net.develivarr.auralis.AppContainer] now wires instead. Every
 * operation here degrades cleanly — `enqueue`/`cancel` are no-ops, `downloadsFor` always answers
 * `emptyList()` — rather than throwing or silently pretending a download started, matching this
 * project's explicit-degradation house style (an unimplemented capability gets a named, honest
 * stand-in, not a `TODO()` that crashes the first time something calls it).
 *
 * Left in place deliberately, not deleted: a legitimate fallback for a build where downloads
 * genuinely can't work, and [DownloadRepository]'s own tests use its shape (via `FakeDownloadEngine`,
 * which mirrors it).
 */
class UnavailableDownloadEngine : DownloadEngine {
    /** No engine exists to act on a download yet — see [DownloadRepository.enqueue]'s [DownloadEnqueueResult.Unavailable] case. */
    override val isAvailable: Boolean = false

    override suspend fun enqueue(
        itemId: String,
        fileId: String,
        uri: String,
    ) {
        // No-op: nothing to enqueue into yet. DownloadRepository checks isAvailable before ever
        // calling this, so in practice this body never runs — kept as a harmless no-op rather
        // than throwing, consistent with this project's total-function house style.
    }

    override suspend fun cancel(
        itemId: String,
        fileId: String,
    ) {
        // No-op, matching enqueue above.
    }

    override suspend fun downloadsFor(itemId: String): List<DownloadedItem> = emptyList()
}
