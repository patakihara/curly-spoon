package net.develivarr.auralis.data.settings

import net.develivarr.auralis.data.network.KeyValueStore

/**
 * Stores which Auralis (BFF) server this app talks to. Unlike the web app, which is served
 * same-origin from the BFF, Android is a separate origin and needs its own first-run
 * "point the app at your server" setting — distinct from the Audiobookshelf URL that the
 * server's own `/api/v1/setup` endpoint configures.
 */
class ServerConfigRepository(private val store: KeyValueStore) {
    suspend fun getBaseUrl(): String? = store.getString(BASE_URL_KEY)

    suspend fun setBaseUrl(url: String) = store.putString(BASE_URL_KEY, url)

    private companion object {
        const val BASE_URL_KEY = "bff_base_url"
    }
}
