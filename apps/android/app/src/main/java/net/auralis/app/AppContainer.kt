package net.auralis.app

import android.content.Context
import coil.ImageLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import net.auralis.app.data.downloads.DownloadRepository
import net.auralis.app.data.downloads.UnavailableDownloadEngine
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.network.DataStoreKeyValueStore
import net.auralis.app.data.network.KeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
import net.auralis.app.playback.PlaybackItemResolver
import okhttp3.OkHttpClient

/**
 * Manual composition root — the app is small enough that a DI framework isn't justified yet.
 * Constructed once, in [AuralisApplication.onCreate], and handed down to composables that
 * need it.
 */
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
     * Offline downloads (Wave F1 — data layer only, see `docs/ROADMAP.md` §7). Wired against
     * [UnavailableDownloadEngine] because Wave F1 ships only the `DownloadEngine` interface, not
     * a Media3-backed implementation: enqueue/cancel are no-ops and no download ever actually
     * starts until Wave F2 replaces this one line with a real `DownloadManager`-backed engine.
     */
    val downloadRepository = DownloadRepository(apiClient, keyValueStore, UnavailableDownloadEngine())

    /**
     * Shared with [apiClient] via the same [httpClient] instance, so cover-art requests carry
     * the session cookie [SessionCookieJar] attaches — Coil's default loader does not share
     * OkHttp clients with anything else unless told to, and the BFF's cover endpoint requires
     * authentication like every other route.
     */
    val imageLoader: ImageLoader = ImageLoader.Builder(context).okHttpClient(httpClient).build()
}
