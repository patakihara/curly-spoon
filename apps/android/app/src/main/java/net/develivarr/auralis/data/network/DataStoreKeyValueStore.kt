package net.develivarr.auralis.data.network

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

// Must be a top-level `val` — DataStore requires exactly one instance per file/name for a
// given process, and redeclaring it elsewhere would create a second, conflicting instance.
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auralis_settings")

/**
 * Production [KeyValueStore], backed by Jetpack DataStore Preferences. Thin, essentially
 * untestable-without-Android adapter by design — see `FakeKeyValueStore` for what everything
 * built on top of [KeyValueStore] is actually unit-tested against.
 */
class DataStoreKeyValueStore(private val context: Context) : KeyValueStore {
    override suspend fun getString(key: String): String? = context.dataStore.data.first()[stringPreferencesKey(key)]

    override suspend fun putString(
        key: String,
        value: String,
    ) {
        context.dataStore.edit { it[stringPreferencesKey(key)] = value }
    }

    override suspend fun getStringSet(key: String): Set<String> =
        context.dataStore.data.first()[stringSetPreferencesKey(key)] ?: emptySet()

    override suspend fun putStringSet(
        key: String,
        value: Set<String>,
    ) {
        context.dataStore.edit { it[stringSetPreferencesKey(key)] = value }
    }
}
