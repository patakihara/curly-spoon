package net.auralis.app.features.search

import net.auralis.app.data.model.ProviderEntry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure behaviour tests for the availability gates — the Kotlin mirror of
 * `apps/web/src/features/search/searchRequestability.ts`. No Compose, no Android framework
 * type anywhere in this file or the module under test.
 */
class SearchRequestabilityTest {
    @Test
    fun `books need both an enabled indexer and an enabled download client`() {
        val indexerOnly = listOf(ProviderEntry(kind = "indexer", configured = true, enabled = true))
        assertFalse(canRequestBooks(indexerOnly))

        val downloadOnly = listOf(ProviderEntry(kind = "download", configured = true, enabled = true))
        assertFalse(canRequestBooks(downloadOnly))

        val both =
            listOf(
                ProviderEntry(kind = "indexer", configured = true, enabled = true),
                ProviderEntry(kind = "download", configured = true, enabled = true),
            )
        assertTrue(canRequestBooks(both))
    }

    @Test
    fun `a configured but disabled indexer does not count`() {
        val providers =
            listOf(
                ProviderEntry(kind = "indexer", configured = true, enabled = false),
                ProviderEntry(kind = "download", configured = true, enabled = true),
            )
        assertFalse(canRequestBooks(providers))
    }

    @Test
    fun `an enabled but unconfigured indexer does not count`() {
        // configured=false, enabled=true shouldn't happen from the real server (enabled always
        // defaults to false when nothing is configured — see `toProviderEntry`), but this
        // module is total and must not trust that invariant.
        val providers =
            listOf(
                ProviderEntry(kind = "indexer", configured = false, enabled = true),
                ProviderEntry(kind = "download", configured = true, enabled = true),
            )
        assertFalse(canRequestBooks(providers))
    }

    @Test
    fun `music needs its own enabled configured provider, independent of the book gate`() {
        val onlyBooks =
            listOf(
                ProviderEntry(kind = "indexer", configured = true, enabled = true),
                ProviderEntry(kind = "download", configured = true, enabled = true),
            )
        assertTrue(canRequestBooks(onlyBooks))
        assertFalse(hasEnabledMusicProvider(onlyBooks))

        val onlyMusic = listOf(ProviderEntry(kind = "music", configured = true, enabled = true))
        assertFalse(canRequestBooks(onlyMusic))
        assertTrue(hasEnabledMusicProvider(onlyMusic))
    }

    @Test
    fun `an empty provider list requests nothing`() {
        assertFalse(canRequestBooks(emptyList()))
        assertFalse(hasEnabledMusicProvider(emptyList()))
    }
}
