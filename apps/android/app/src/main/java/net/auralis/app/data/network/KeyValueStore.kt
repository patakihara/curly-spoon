package net.auralis.app.data.network

/**
 * Minimal suspend key-value abstraction so the rest of the data layer (cookie persistence,
 * server config) is unit-testable on the plain JVM, without Robolectric or a real Android
 * `Context`. [DataStoreKeyValueStore] is the production implementation; tests use
 * `FakeKeyValueStore`.
 */
interface KeyValueStore {
    suspend fun getString(key: String): String?

    suspend fun putString(
        key: String,
        value: String,
    )

    suspend fun getStringSet(key: String): Set<String>

    suspend fun putStringSet(
        key: String,
        value: Set<String>,
    )
}
