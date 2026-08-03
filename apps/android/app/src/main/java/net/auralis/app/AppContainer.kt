package net.auralis.app

import android.content.Context
import coil.ImageLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.network.DataStoreKeyValueStore
import net.auralis.app.data.network.KeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
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
    private val httpClient = OkHttpClient.Builder().cookieJar(sessionCookieJar).build()
    val apiClient =
        ApiClient(httpClient, sessionCookieJar) {
            serverConfigRepository.getBaseUrl()
                ?: throw ApiException("server_not_configured", "No Auralis server configured", 0)
        }

    /**
     * Shared with [apiClient] via the same [httpClient] instance, so cover-art requests carry
     * the session cookie [SessionCookieJar] attaches — Coil's default loader does not share
     * OkHttp clients with anything else unless told to, and the BFF's cover endpoint requires
     * authentication like every other route.
     */
    val imageLoader: ImageLoader = ImageLoader.Builder(context).okHttpClient(httpClient).build()
}
