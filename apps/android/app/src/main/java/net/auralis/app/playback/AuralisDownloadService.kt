package net.auralis.app.playback

import android.app.Notification
import androidx.annotation.OptIn
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
 * has no way to test JobScheduler-driven restarts on. Per `DownloadService.getScheduler`'s own
 * doc (same tag): with no scheduler, a download whose requirements (network) aren't currently met
 * simply keeps this service running in the foreground rather than stopping itself to be woken
 * later by a scheduled job. Downloads already in flight are unaffected, and even an interrupted
 * one resumes automatically the next time anything restarts this service (opening the app,
 * enqueuing or cancelling another download) — [DownloadManager] persists its state to the on-disk
 * index regardless of whether a scheduler exists. The gap this leaves is narrow: a download that
 * stalls on lost connectivity while the process is fully evicted by the OS won't restart itself
 * in the background until something else wakes the app. Revisit with `PlatformScheduler` if that
 * gap turns out to matter in practice.
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
     * `android.R.drawable.stat_sys_download` — a public Android framework resource, chosen so
     * this notification needs no drawable asset of its own. This project has no app icon or
     * drawable resource of any kind yet (confirmed: no `res/mipmap*` or `res/drawable*`
     * directory exists) — adding a real brand asset is out of scope for a data-layer wave; swap
     * this for one whenever it exists.
     *
     * On API 33+ this notification is silently invisible unless the user has granted
     * `POST_NOTIFICATIONS` — declared in the manifest (required to ever show it) but not yet
     * requested anywhere at runtime, since requesting a runtime permission is UI work and this
     * wave is explicitly data-layer only (see `docs/ROADMAP.md` §7, Wave F2b). The download
     * itself is unaffected either way: this is still a real foreground service, and downloads
     * proceed whether or not its notification happens to be visible to the user.
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
