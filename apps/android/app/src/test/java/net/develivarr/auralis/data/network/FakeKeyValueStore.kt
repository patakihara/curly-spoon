package net.develivarr.auralis.data.network

/** In-memory [KeyValueStore] test double — what everything built on [KeyValueStore] is tested against. */
class FakeKeyValueStore : KeyValueStore {
    private val strings = mutableMapOf<String, String>()
    private val stringSets = mutableMapOf<String, Set<String>>()

    override suspend fun getString(key: String): String? = strings[key]

    override suspend fun putString(
        key: String,
        value: String,
    ) {
        strings[key] = value
    }

    override suspend fun getStringSet(key: String): Set<String> = stringSets[key] ?: emptySet()

    override suspend fun putStringSet(
        key: String,
        value: Set<String>,
    ) {
        stringSets[key] = value
    }
}
