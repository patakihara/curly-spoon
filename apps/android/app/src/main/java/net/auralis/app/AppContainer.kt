package net.auralis.app

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.DownloadManager
import coil.ImageLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import net.auralis.app.data.downloads.DownloadRepository
import net.auralis.app.data.downloads.Media3DownloadEngine
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.network.DataStoreKeyValueStore
import net.auralis.app.data.network.KeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
import net.auralis.app.playback.PlaybackItemResolver
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.Executors

/**
 * Manual composition root — the app is small enough that a DI framework isn't justified yet.
 * Constructed once, in [AuralisApplication.onCreate], and handed down to composables that
 * need it.
 */
// UnstableApi covers downloadCache/downloadManager's construction below (SimpleCache,
// StandaloneDatabaseProvider, DownloadManager are all @UnstableApi at the pinned Media3 1.5.1
// tag). @OptIn — consuming the requirement here — rather than annotating this class itself with
// @UnstableApi, which would instead propagate it to every one of this class's many call sites
// across the app (ViewModels, Composables, AuralisApplication) that have nothing to do with
// Media3, matching AuralisMediaLibraryService's own established use of the same pattern.
@OptIn(UnstableApi::class)
class AppContainer(context: Context) {
    private val keyValueStore: KeyValueStore = DataStoreKeyValueStore(context)
    val serverConfigRepository = ServerConfigRepository(keyValueStore)
    val sessionCookieJar = SessionCookieJar(keyValueStore, CoroutineScope(SupervisorJob() + Dispatchers.IO))
    val httpClient = OkHttpClient.Builder().cookieJar(sessionCookieJar).build()
    val apiClient =
        ApiClient(httpClient, sessionCookieJar) {
            serverConfigRepository.getBaseUrl()
                ?: throw ApiException("server_not_configured", "No Auralis server configured", 0)
        }

    /**
     * Shared by [net.auralis.app.features.player.PlayerViewModel] (the phone UI's "tap a shelf
     * item" path) and [net.auralis.app.playback.AuralisMediaLibraryService] (its own, separately
     * constructed instance — a `MediaLibraryService` has no `ViewModelStore` to receive this one
     * through), so both surfaces build the exact same enriched playback `MediaItem` instead of
     * the two diverging constructions Wave E2b replaced.
     */
    val playbackItemResolver = PlaybackItemResolver(apiClient, serverConfigRepository)

    /**
     * Backs both [downloadCache] and [downloadManager] below. [StandaloneDatabaseProvider]
     * always resolves to the same fixed file name (`exoplayer_internal.db`, confirmed at the
     * pinned 1.5.1 tag) regardless of how many instances exist, so two separate instances would
     * each open their own connection to that one file for no benefit — one shared instance
     * instead, matching Media3's own demo app (`DemoUtil.java`'s `getDatabaseProvider`, same
     * tag).
     */
    private val downloadDatabaseProvider = StandaloneDatabaseProvider(context)

    /**
     * Where downloaded — and, read-only, merely-played — audio lives on disk. [NoOpCacheEvictor]
     * is deliberate, not a placeholder: this cache exists to hold *complete* downloads a user
     * explicitly asked to keep offline, and Media3's size-bounded evictors are designed to
     * reclaim space by deleting older cached content — exactly the failure mode that must never
     * happen to a download this app has told the user is "kept offline." Bounding total storage
     * used is a real, future product feature (a settings screen with its own eviction policy),
     * not something to bolt on here by reusing an evictor tuned for opportunistic streaming
     * caches.
     *
     * A single application-wide instance: `SimpleCache`'s own contract (confirmed at the pinned
     * 1.5.1 tag) throws if two instances open the same cache directory. Constructed once here
     * and injected into both [Media3DownloadEngine] (via [downloadManager], below) and
     * [net.auralis.app.playback.AuralisMediaLibraryService] (for read-only playback), so a
     * downloaded item plays from disk with no network regardless of which surface asked for it.
     *
     * Directory: `getExternalFilesDir(null)` (app-private, no permission required at this
     * project's minSdk 26) with a fallback to `filesDir` for the rare device that reports no
     * external storage — the same fallback Media3's own demo app uses.
     */
    val downloadCache: Cache =
        SimpleCache(
            File(context.getExternalFilesDir(null) ?: context.filesDir, "downloads"),
            NoOpCacheEvictor(),
            downloadDatabaseProvider,
        )

    /**
     * Shared by [Media3DownloadEngine] (reads) and
     * [net.auralis.app.playback.AuralisDownloadService] (owns the actual download work) — both
     * must use this exact instance; see that service's own doc comment for why a second one
     * would corrupt shared on-disk state instead of merely being wasteful.
     *
     * Downloads are authenticated the same way playback is: [OkHttpDataSource.Factory] wraps
     * this same [httpClient] instance [apiClient] and the Coil loader already share, so a
     * download request carries the session cookie [SessionCookieJar] attaches — without it,
     * every download would 401 against an authenticated Audiobookshelf exactly like an
     * unauthenticated playback request would.
     *
     * `Executors.newFixedThreadPool(6)` mirrors Media3's own demo app
     * (`DemoUtil.java`'s `ensureDownloadManagerInitialized`, same 1.5.1 tag) rather than an
     * invented number — it bounds how many tracks this app will download in parallel across all
     * in-progress items, independent of `DownloadManager.DEFAULT_MAX_PARALLEL_DOWNLOADS` (3),
     * which separately bounds how many of those the manager will actually start downloading at
     * once.
     */
    val downloadManager: DownloadManager =
        DownloadManager(
            context,
            downloadDatabaseProvider,
            downloadCache,
            OkHttpDataSource.Factory(httpClient),
            Executors.newFixedThreadPool(6),
        )

    /**
     * Offline downloads (see `docs/ROADMAP.md` §7). Wave F1 shipped only the `DownloadEngine`
     * interface plus [net.auralis.app.data.downloads.UnavailableDownloadEngine], a no-op
     * placeholder; Wave F2a replaces that with [Media3DownloadEngine], a real
     * `DownloadManager`-backed implementation, so `isAvailable` now genuinely reflects whether
     * downloads work on this build rather than always reporting "no engine yet."
     */
    val downloadRepository = DownloadRepository(apiClient, keyValueStore, Media3DownloadEngine(context, downloadManager))

    /**
     * Shared with [apiClient] via the same [httpClient] instance, so cover-art requests carry
     * the session cookie [SessionCookieJar] attaches — Coil's default loader does not share
     * OkHttp clients with anything else unless told to, and the BFF's cover endpoint requires
     * authentication like every other route.
     */
    val imageLoader: ImageLoader = ImageLoader.Builder(context).okHttpClient(httpClient).build()
}
