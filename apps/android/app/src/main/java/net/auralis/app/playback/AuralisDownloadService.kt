package net.auralis.app.playback

import android.app.Notification
import android.os.Build
import androidx.annotation.OptIn
import androidx.annotation.RequiresApi
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler
import net.auralis.app.AuralisApplication
import net.auralis.app.R

/**
 * Media3's required concrete [DownloadService] subclass — without one, a [DownloadManager] can
 * hold queued work but nothing keeps the process running to execute it once the app is
 * backgrounded. Declared in `AndroidManifest.xml` with `foregroundServiceType="dataSync"`; see
 * that file's comment on the manifest for the targetSdk-35 permission/type reasoning.
 *
 * [getDownloadManager] returns [net.auralis.app.AppContainer.downloadManager] — the same
 * instance [net.auralis.app.data.downloads.Media3DownloadEngine] reads from — rather than
 * constructing a second one. Media3's own contract expects exactly one [DownloadManager] per
 * process: `DownloadService.java`'s `downloadManagerHelpers` map (confirmed at the pinned 1.5.1
 * tag) is keyed by service class and memoises whatever this method returns the *first* time it's
 * called, so a second, independently-constructed manager here would never actually run — but
 * would still open its own connection to the same on-disk index/cache files the first one owns.
 *
 * [getScheduler] deliberately returns `null`, not
 * [androidx.media3.exoplayer.scheduler.PlatformScheduler]. `PlatformScheduler` lives in this same
 * `media3-exoplayer` artifact this project already depends on — confirmed at the pinned 1.5.1
 * tag — so, unlike
 * `WorkManagerScheduler`, using it needs no new Gradle dependency. It was still left out of this
 * wave: `PlatformScheduler`'s own class doc (same tag) requires a manifest surface that has never
 * been exercised here — the `RECEIVE_BOOT_COMPLETED` permission plus an exported
 * `PlatformScheduler$PlatformSchedulerService` job-service component — on a device this project
 * has no way to test JobScheduler-driven restarts on.
 *
 * This is not a deferred nice-to-have: `DownloadService.onCreate()` itself (same pinned tag)
 * only ever consults [getScheduler] when `Util.SDK_INT < 31`, so on every device this app
 * realistically ships to there is *no* scheduler fallback today regardless of what this method
 * returns — returning a real [androidx.media3.exoplayer.scheduler.PlatformScheduler] here
 * would be silently discarded on API 31+. With no scheduler, a download whose requirements
 * (network) aren't currently met simply keeps this service running in the foreground instead of
 * stopping itself to be woken later by a scheduled job — which is exactly how a stalled download
 * can run this service long enough to hit the Android 15 `dataSync` timeout handled in
 * [onTimeout] below. Downloads already in flight are unaffected, and even an interrupted one
 * resumes automatically the next time anything restarts this service (opening the app, enqueuing
 * or cancelling another download) — [DownloadManager] persists its state to the on-disk index
 * regardless of whether a scheduler exists. The gap this leaves is narrow: a download that
 * stalls on lost connectivity while the process is fully evicted by the OS won't restart itself
 * in the background until something else wakes the app. Revisit with `PlatformScheduler` if that
 * gap turns out to matter in practice — building it would additionally need a real device to
 * verify JobScheduler-driven restarts on, which this project still has no way to do.
 */
@OptIn(UnstableApi::class)
class AuralisDownloadService :
    DownloadService(
        FOREGROUND_NOTIFICATION_ID,
        DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
        NOTIFICATION_CHANNEL_ID,
        R.string.download_notification_channel_name,
        /* channelDescriptionResourceId = */ 0,
    ) {
    private val notificationHelper: DownloadNotificationHelper by lazy {
        DownloadNotificationHelper(this, NOTIFICATION_CHANNEL_ID)
    }

    override fun getDownloadManager(): DownloadManager = (applicationContext as AuralisApplication).container.downloadManager

    override fun getScheduler(): Scheduler? = null

    /**
     * Android 15 (API 35) caps `dataSync` foreground services at 6 cumulative hours per 24h
     * and calls this when the budget runs out; [stopSelf] must run within a few seconds or the
     * app takes a fatal `android.app.RemoteServiceException: "...did not stop within its
     * timeout..."` (`developer.android.com/about/versions/15/behavior-changes-15`). [getScheduler]
     * returning effectively-`null` on every real device (see its own doc above) is what lets a
     * download stalled on lost connectivity pin this service in the foreground long enough to
     * exhaust that budget instead of stopping itself to be rescheduled.
     *
     * Only the two-argument overload is implemented: `Service.onTimeout(int)` (API 34, one
     * argument) fires for `FOREGROUND_SERVICE_TYPE_SHORT_SERVICE`, a type this service does not
     * declare (its manifest entry, `AndroidManifest.xml`, is `dataSync`), so it would never be
     * called here regardless of `minSdk`. `Service.onTimeout(int, int)` itself is `void`/`Unit`
     * (JNI descriptor `(II)V`, confirmed against the platform reference), matching this override.
     * `@RequiresApi` is needed because this two-argument overload — and the `super.onTimeout` call
     * below — do not exist below API 35, and `minSdk` here is 26; the override is simply never
     * invoked by the platform on lower API levels, so nothing else needs an SDK_INT guard.
     *
     * [getDownloadManager] `.pauseDownloads()` runs *before* [stopSelf], not just for good
     * measure: a bare `stopSelf()` alone would fight itself. `stopSelf()` → `onDestroy()` detaches
     * this instance from Media3's internal `DownloadManagerHelper` (`downloadService = null`,
     * confirmed at the pinned 1.5.1 tag, `DownloadService.java`), and that same file's
     * `onDownloadChanged` calls `restartService()` — a fresh attempt to start this very `dataSync`
     * foreground service — whenever it sees a detached service and a download still in
     * `STATE_DOWNLOADING`/`STATE_REMOVING`/`STATE_RESTARTING` (`needsStartedService`, same tag).
     * Those are exactly the states an in-flight download is in when this callback fires, so
     * without pausing first, `onTimeout` would immediately trigger a restart attempt against the
     * budget the system just declared exhausted. `pauseDownloads()` moves every such download to
     * `STATE_QUEUED` first (`DownloadManager.java`'s `syncTasks()`/`canDownloadsRun()`, same tag)
     * — a state `needsStartedService` excludes — so that restart never fires. The pause is purely
     * in-memory (never written to the on-disk index) and is unconditionally cleared by
     * [DownloadManager.resumeDownloads], which `DownloadService.onCreate()` already calls on
     * every service start (same tag) — so this doesn't change the resumability guarantee
     * documented above on [getScheduler]: the download simply resumes, un-paused, the next time
     * anything restarts this service.
     */
    @RequiresApi(Build.VERSION_CODES.VANILLA_ICE_CREAM)
    override fun onTimeout(
        startId: Int,
        fgsType: Int,
    ) {
        getDownloadManager().pauseDownloads()
        stopSelf()
        super.onTimeout(startId, fgsType)
    }

    /**
     * `android.R.drawable.stat_sys_download` — a public Android framework resource, chosen so
     * this notification needs no drawable asset of its own. This project has no app icon or
     * drawable resource of any kind yet (confirmed: no `res/mipmap*` or `res/drawable*`
     * directory exists) — adding a real brand asset is out of scope for a data-layer wave; swap
     * this for one whenever it exists.
     *
     * On API 33+ this notification is silently invisible unless the user has granted
     * `POST_NOTIFICATIONS` — declared in the manifest, and, as of Wave F2b, requested at
     * runtime from `HomeScreen.kt`'s `startDownloadWithPermissionPrompt` the first time the
     * user starts a download. A refusal is still handled gracefully: this is a real foreground
     * service either way, and downloads proceed whether or not its notification happens to be
     * visible to the user.
     */
    override fun getForegroundNotification(
        downloads: MutableList<Download>,
        notMetRequirements: Int,
    ): Notification =
        notificationHelper.buildProgressNotification(
            /* context = */ this,
            android.R.drawable.stat_sys_download,
            /* contentIntent = */ null,
            /* message = */ null,
            downloads,
            notMetRequirements,
        )

    private companion object {
        /** Only needs to be unique within this app's own notification ids; nothing else uses one yet. */
        const val FOREGROUND_NOTIFICATION_ID = 1
        const val NOTIFICATION_CHANNEL_ID = "auralis_downloads"
    }
}
